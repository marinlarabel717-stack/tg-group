import { Api } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager } from '../accounts/check-engine/telegram-client-manager'
import type { BroadcastJoinedGroup, BroadcastPushSchedulePayload, BroadcastPushScheduleResult, BroadcastPushScheduleResultItem } from '../../src/types'

const MIN_SCHEDULE_AHEAD_MS = 60_000

function formatBroadcastError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '写入 Telegram 定时消息失败'
  if (/USERNAME_INVALID/i.test(normalized)) return '群组 @username 不合法'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '群组 @username 不存在'
  if (/CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)) return '当前账号无法识别这个群，请确认 @username、私密链接或群链接正确'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '当前账号没有该群的发言/排程权限'
  if (/USER_NOT_PARTICIPANT/i.test(normalized)) return '当前账号尚未加入这个群或这个私密链接无权访问'
  if (/SCHEDULE_TOO_MUCH/i.test(normalized)) return '该聊天的官方定时消息已达到上限，请先去 Telegram 清理一部分'
  if (/SCHEDULE_DATE_TOO_LATE/i.test(normalized)) return '排程时间超出 Telegram 允许范围'
  if (/SCHEDULE_DATE_INVALID|MSG_ID_INVALID/i.test(normalized)) return '排程时间无效，请改成未来时间再试'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '当前账号 Session 已失效，请重新登录该账号'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '私密链接无效、已过期，或当前账号无法使用这个链接'
  if (/FLOOD_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/FLOOD_WAIT_(\d+)/i)
    return matched ? `触发 Telegram 限流，请 ${matched[1]} 秒后再试` : '触发 Telegram 限流，请稍后再试'
  }
  return normalized
}

function extractInviteHash(input: string) {
  const raw = input.trim()
  if (!raw) return ''
  const plusMatched = raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
  if (plusMatched?.[1]) return plusMatched[1].trim()
  return ''
}

function normalizeGroupRef(input: string) {
  const raw = input.trim()
  if (!raw) return null
  const inviteHash = extractInviteHash(raw)
  if (inviteHash) {
    return { kind: 'invite' as const, value: inviteHash }
  }
  const linkMatched = raw.match(/(?:https?:\/\/)?t\.me\/([^/?#]+)/i)
  const candidate = (linkMatched?.[1] ?? raw).trim()
  if (!candidate) return null
  if (/^-?\d+$/.test(candidate)) return { kind: 'peer' as const, value: Number(candidate) }
  return { kind: 'username' as const, value: candidate.startsWith('@') ? candidate : `@${candidate.replace(/^@+/, '')}` }
}

async function resolveGroupEntity(client: TelegramClient, groupRef: ReturnType<typeof normalizeGroupRef>) {
  if (!groupRef) return null
  if (groupRef.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: groupRef.value }))
    if ((invite as { className?: string }).className === 'ChatInviteAlready') {
      return (invite as { chat?: unknown }).chat ?? null
    }
    throw new Error('USER_NOT_PARTICIPANT')
  }
  return client.getEntity(groupRef.value as never)
}

function inferImageExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  if (mimeType.includes('svg')) return 'svg'
  return 'bin'
}

function slugifyFileName(input: string) {
  const value = input.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '')
  return value || 'broadcast_image'
}

function normalizeJoinedGroupTitle(value: string) {
  return value.trim().toLowerCase()
}

function dedupeJoinedGroups(groups: BroadcastJoinedGroup[]) {
  const result = new Map<string, BroadcastJoinedGroup>()

  for (const group of groups) {
    const titleKey = normalizeJoinedGroupTitle(group.title)
    const primaryKey = group.username ? `username:${group.username.toLowerCase()}` : group.peerId ? `peer:${group.peerId}` : `title:${titleKey}`
    const titleFallbackKey = titleKey ? `title:${titleKey}` : primaryKey
    const existing = result.get(primaryKey) || result.get(titleFallbackKey)

    if (!existing) {
      result.set(primaryKey, group)
      if (titleKey) result.set(titleFallbackKey, group)
      continue
    }

    const merged: BroadcastJoinedGroup = {
      ...existing,
      title: existing.title || group.title,
      username: group.username || existing.username,
      targetRef: group.username || existing.username || existing.targetRef || group.targetRef || group.peerId || existing.peerId,
      peerId: existing.peerId || group.peerId,
      memberCount: Math.max(existing.memberCount || 0, group.memberCount || 0),
      type: existing.type === 'supergroup' || group.type === 'supergroup' ? 'supergroup' : existing.type
    }

    result.set(primaryKey, merged)
    if (titleKey) result.set(titleFallbackKey, merged)
  }

  return Array.from(new Map(Array.from(result.values()).map((group) => [`${group.username || ''}::${group.peerId || ''}::${normalizeJoinedGroupTitle(group.title)}`, group])).values())
}

function resolveMediaFile(imageUrl: string, title: string) {
  const value = imageUrl.trim()
  if (!value) return undefined

  if (value.startsWith('data:')) {
    const matched = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!matched) throw new Error('图片 Data URL 格式不正确')
    const mimeType = matched[1] || 'application/octet-stream'
    const encoded = matched[3] || ''
    const buffer = matched[2]
      ? Buffer.from(encoded, 'base64')
      : Buffer.from(decodeURIComponent(encoded), 'utf8')
    const extension = inferImageExtension(mimeType)
    return new CustomFile(`${slugifyFileName(title)}.${extension}`, buffer.length, '', buffer)
  }

  return value
}

function buildCreativeMessage(creative: { text: string; kind?: string; buttonText?: string; buttonUrl?: string }) {
  const text = creative.text.trim()
  if (creative.kind !== 'image_button') return text || undefined

  const buttonText = typeof creative.buttonText === 'string' ? creative.buttonText.trim() : ''
  const buttonUrl = typeof creative.buttonUrl === 'string' ? creative.buttonUrl.trim() : ''
  if (!buttonUrl) return text || undefined

  const buttonLine = buttonText ? `${buttonText}：${buttonUrl}` : buttonUrl
  return [text, buttonLine].filter(Boolean).join('\n\n') || undefined
}

async function ensureAuthorizedClient(account: AccountRecord, sessionLoader: SessionLoader, clientManager: TelegramClientManager) {
  const session = await sessionLoader.load(account.sessionPath)
  const client = clientManager.createClient(session)
  await client.connect()
  const authorized = await client.isUserAuthorized()
  if (!authorized) {
    await clientManager.destroyClient(client)
    throw new Error('AUTH_KEY_UNREGISTERED')
  }
  return client
}

export class BroadcastService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager
  ) {}

  async pushSchedule(payload: BroadcastPushSchedulePayload): Promise<BroadcastPushScheduleResult> {
    const creativesById = new Map(payload.creatives.map((item) => [item.id, item]))
    const groupsById = new Map(payload.groups.map((item) => [item.id, item]))
    const accountIds = Array.from(new Set(payload.items.map((item) => item.accountId).filter((item): item is number => typeof item === 'number')))
    const accounts = this.accountRepository.getByIds(accountIds)
    const accountsById = new Map(accounts.map((item) => [item.id, item]))
    const results: BroadcastPushScheduleResultItem[] = []
    const clients = new Map<number, TelegramClient>()
    const entityCache = new Map<string, unknown>()

    try {
      for (const item of payload.items) {
        const existingScheduled = item.status === 'scheduled' && item.remoteMessageId
        if (existingScheduled) {
          results.push({
            previewItemId: item.id,
            status: 'scheduled',
            errorMessage: '',
            remoteMessageId: item.remoteMessageId ?? null,
            syncedAt: item.syncedAt ?? null,
            accountId: item.accountId,
            groupId: item.groupId,
            creativeId: item.creativeId
          })
          continue
        }

        const creative = item.creativeId ? creativesById.get(item.creativeId) : null
        const group = groupsById.get(item.groupId)
        const account = typeof item.accountId === 'number' ? accountsById.get(item.accountId) : null
        const scheduledAt = new Date(item.scheduledAt)

        if (!group) {
          results.push(this.createFailedItem(item, '目标群不存在，请重新生成预览'))
          continue
        }
        if (!group.enabled) {
          results.push(this.createFailedItem(item, `目标群 ${group.title} 当前已停用`))
          continue
        }
        if (!creative) {
          results.push(this.createFailedItem(item, '文案不存在，请重新生成预览'))
          continue
        }
        if (!creative.enabled) {
          results.push(this.createFailedItem(item, `文案 ${creative.title} 当前已停用`))
          continue
        }
        if (!account) {
          results.push(this.createFailedItem(item, '发送账号不存在，请检查账号列表'))
          continue
        }
        if (!Number.isFinite(scheduledAt.getTime())) {
          results.push(this.createFailedItem(item, '排程时间格式不正确'))
          continue
        }
        if (scheduledAt.getTime() <= Date.now() + MIN_SCHEDULE_AHEAD_MS) {
          results.push(this.createFailedItem(item, '排程时间太近或已过期，请重新生成未来时间段的计划'))
          continue
        }
        if (!creative.text.trim() && !creative.imageUrl.trim()) {
          results.push(this.createFailedItem(item, '文案正文和图片不能同时为空'))
          continue
        }

        const groupRef = normalizeGroupRef(group.targetRef || group.username)
        if (!groupRef) {
          results.push(this.createFailedItem(item, `目标群 ${group.title} 缺少可用的 @username、私密链接或群链接`))
          continue
        }

        try {
          let client = clients.get(account.id)
          if (!client) {
            client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)
            clients.set(account.id, client)
          }

          const entityKey = `${account.id}:${groupRef.kind}:${String(groupRef.value)}`
          let entity = entityCache.get(entityKey)
          if (!entity) {
            entity = await resolveGroupEntity(client, groupRef)
            entityCache.set(entityKey, entity)
          }

          const media = creative.imageUrl.trim() ? resolveMediaFile(creative.imageUrl, creative.title || creative.text || 'broadcast-image') : undefined
          const message = await client.sendMessage(entity as never, {
            message: buildCreativeMessage(creative),
            file: media,
            schedule: Math.floor(scheduledAt.getTime() / 1000)
          })

          results.push({
            previewItemId: item.id,
            status: 'scheduled',
            errorMessage: '',
            remoteMessageId: typeof message?.id === 'number' ? message.id : null,
            syncedAt: new Date().toISOString(),
            accountId: item.accountId,
            groupId: item.groupId,
            creativeId: item.creativeId
          })
        } catch (error) {
          results.push(this.createFailedItem(item, formatBroadcastError(error)))
        }
      }
    } finally {
      await Promise.all(Array.from(clients.values()).map((client) => this.clientManager.destroyClient(client)))
    }

    const successCount = results.filter((item) => item.status === 'scheduled').length
    const failedCount = results.filter((item) => item.status === 'failed').length
    const message = results.length === 0
      ? '当前没有可写入的排程'
      : failedCount === 0
        ? `已成功写入 ${successCount} 条 Telegram 官方定时消息。`
        : `写入完成：成功 ${successCount} 条，失败 ${failedCount} 条。`

    return {
      total: results.length,
      successCount,
      failedCount,
      items: results,
      message
    }
  }

  async listJoinedGroups(accountId: number): Promise<BroadcastJoinedGroup[]> {
    const account = this.accountRepository.getByIds([accountId])[0]
    if (!account) {
      throw new Error('账号不存在')
    }

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)

    try {
      const dialogs = await client.getDialogs({ limit: 200 })
      const groups = dialogs
        .filter((dialog) => dialog.isGroup || (dialog.isChannel && !(dialog.entity as any)?.broadcast))
        .map((dialog) => {
          const entity = dialog.entity as any
          const peerId = typeof dialog.id?.toString === 'function' ? dialog.id.toString() : String(entity?.id ?? '')
          const title = String(dialog.title || dialog.name || entity?.title || '未命名群组').trim()
          const username = typeof entity?.username === 'string' && entity.username.trim() ? `@${String(entity.username).replace(/^@+/, '')}` : ''
          const participants = typeof entity?.participantsCount === 'number'
            ? entity.participantsCount
            : typeof entity?.participants_count === 'number'
              ? entity.participants_count
              : 0
          return {
            peerId,
            title,
            username,
            targetRef: username || peerId,
            memberCount: participants,
            type: dialog.isChannel ? 'supergroup' : 'group'
          } satisfies BroadcastJoinedGroup
        })
        .filter((item) => item.title)
      const dedupedGroups = dedupeJoinedGroups(groups)
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))

      return dedupedGroups
    } catch (error) {
      throw new Error(formatBroadcastError(error))
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  private createFailedItem(item: BroadcastPushSchedulePayload['items'][number], errorMessage: string): BroadcastPushScheduleResultItem {
    return {
      previewItemId: item.id,
      status: 'failed',
      errorMessage,
      remoteMessageId: null,
      syncedAt: null,
      accountId: item.accountId,
      groupId: item.groupId,
      creativeId: item.creativeId
    }
  }
}
