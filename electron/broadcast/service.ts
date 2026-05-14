import { Api } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'
import type { TelegramClient } from 'telegram'
import bigInt from 'big-integer'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type { BroadcastDeleteScheduledMessagesPayload, BroadcastDeleteScheduledMessagesResult, BroadcastJoinedGroup, BroadcastPushSchedulePayload, BroadcastPushScheduleProgress, BroadcastPushScheduleResult, BroadcastPushScheduleResultItem, BroadcastScheduledMessageItem, BroadcastScheduledMessageListResult, BroadcastStopResult } from '../../src/types'

const MIN_SCHEDULE_AHEAD_MS = 60_000
const TELEGRAM_SCHEDULE_QUEUE_LIMIT = 100

function readRequiredWaitSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const explicitWait = message.match(/A wait of (\d+) seconds is required/i)
  if (explicitWait?.[1]) {
    const seconds = Number(explicitWait[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  const floodWait = message.match(/FLOOD_WAIT_(\d+)/i)
  if (floodWait?.[1]) {
    const seconds = Number(floodWait[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  const slowModeWait = message.match(/SLOWMODE_WAIT_(\d+)/i)
  if (slowModeWait?.[1]) {
    const seconds = Number(slowModeWait[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  return null
}

function formatBroadcastError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '写入 Telegram 定时消息失败'
  if (/SOURCE_MESSAGE_LINK_INVALID/i.test(normalized)) return '频道消息链接不对，请填完整的频道消息链接。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个群的 @username 不对，请检查群用户名。'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '这个群的 @username 不存在，请确认群链接填对了。'
  if (/CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)) return '当前账号认不出这个群，请检查 @username、群链接或私密链接。'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '这个频道当前账号进不去，可能没加入，或者频道本身是私密的。'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '当前账号在这个群没有发送或定时发送权限。'
  if (/CHAT_WRITE_FORBIDDEN/i.test(normalized)) return '当前账号在这个群不能发消息，可能被禁言了。'
  if (/CHAT_FORWARDS_RESTRICTED/i.test(normalized)) return '这个频道消息不允许转发，可能频道开了禁止转发。'
  if (/USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED/i.test(normalized)) return '当前账号在这个群被限制发言，先去 Telegram 里确认群权限。'
  if (/USER_NOT_PARTICIPANT/i.test(normalized)) return '当前账号还没加入这个群，或者这个私密链接当前账号没权限进。'
  if (/CHAT_SEND_PLAIN_FORBIDDEN/i.test(normalized)) return '这个群不允许发纯文字，请改成图文或图片发送。'
  if (/CHAT_SEND_PHOTOS_FORBIDDEN/i.test(normalized)) return '这个群不允许发图片。你这条消息里带了图片，所以发不过去。'
  if (/CHAT_SEND_VIDEOS_FORBIDDEN/i.test(normalized)) return '这个群不允许发视频。'
  if (/CHAT_SEND_GIFS_FORBIDDEN/i.test(normalized)) return '这个群不允许发动图。'
  if (/CHAT_SEND_DOCS_FORBIDDEN/i.test(normalized)) return '这个群不允许发文件。'
  if (/CHAT_SEND_VOICES_FORBIDDEN/i.test(normalized)) return '这个群不允许发语音。'
  if (/CHAT_SEND_AUDIOS_FORBIDDEN|CHAT_SEND_MUSIC_FORBIDDEN/i.test(normalized)) return '这个群不允许发音频。'
  if (/CHAT_SEND_STICKERS_FORBIDDEN/i.test(normalized)) return '这个群不允许发表情贴纸。'
  if (/CHAT_SEND_ROUNDVIDEOS_FORBIDDEN/i.test(normalized)) return '这个群不允许发圆视频。'
  if (/CHAT_SEND_MEDIA_FORBIDDEN/i.test(normalized)) return '这个群不允许发图片或媒体，请改成纯文字，或去群里确认发送权限。'
  if (/MEDIA_EMPTY|MESSAGE_EMPTY/i.test(normalized)) return '这条消息内容是空的，至少要有文字或图片。'
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(normalized)) return '图片有问题，可能格式不对、文件坏了，或者 Telegram 不认这张图。'
  if (/BUTTON_URL_INVALID/i.test(normalized)) return '按钮链接格式不对，请填完整的 https:// 链接。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(normalized)) return '文案太长了，缩短一点再试。'
  if (/SCHEDULE_QUEUE_FULL_LOCAL/i.test(normalized)) {
    const matched = normalized.match(/current=(\d+)/i)
    const current = matched?.[1] ? Number(matched[1]) : null
    return Number.isFinite(current)
      ? `这个群当前已经挂着 ${current} 条待发送定时了。Telegram 卡的是“当前总待发送队列”，不是“每天几条”。先删掉一些再发。`
      : '这个群当前待发送的定时消息已经堆满了。Telegram 卡的是“当前总待发送队列”，不是“每天几条”。先删掉一些再发。'
  }
  if (/SCHEDULE_TOO_MUCH/i.test(normalized)) return '这个群的官方定时消息已经堆满了，先去 Telegram 里删掉一部分再发。'
  if (/SCHEDULE_DATE_TOO_LATE/i.test(normalized)) return '定时时间设得太远了，Telegram 不接受这么远的时间。'
  if (/SCHEDULE_DATE_INVALID|MSG_ID_INVALID/i.test(normalized)) return '定时时间不对，请改成未来时间再试。'
  if (/TELEGRAM_REPEAT_NOT_APPLIED/i.test(normalized)) return 'Telegram 这次没有把“每天重复”真正挂上去，这条我已经按失败处理了。你可以直接重试这一条；如果还不行，我再继续顺着这条日志往下抠。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理，所以这次没有继续走本地直连。先把可用代理补上再试。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号的登录状态失效了，需要重新登录。'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '私密链接失效了、过期了，或者当前账号用不了这个链接。'
  if (/SLOWMODE_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/SLOWMODE_WAIT_(\d+)/i)
    return matched ? `这个群开了慢速模式，请 ${matched[1]} 秒后再发。` : '这个群开了慢速模式，请稍后再发。'
  }
  if (/FLOOD_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/FLOOD_WAIT_(\d+)/i)
    return matched ? `当前账号触发 Telegram 限流了，请 ${matched[1]} 秒后再试。` : '当前账号触发 Telegram 限流了，请稍后再试。'
  }
  if (/A wait of (\d+) seconds is required/i.test(normalized)) {
    const matched = normalized.match(/A wait of (\d+) seconds is required/i)
    return matched ? `当前发得有点快了，Telegram 要求先等 ${matched[1]} 秒，再继续发送。` : '当前发得有点快了，Telegram 要求先等几秒，再继续发送。'
  }
  return `发送失败：${normalized}`
}

function parseTelegramMessageLink(input: string) {
  const raw = input.trim()
  if (!raw) return null

  const privateMatched = raw.match(/(?:https?:\/\/)?t\.me\/c\/(\d+)\/(\d+)(?:\?.*)?$/i)
  if (privateMatched) {
    return {
      peerRef: BigInt(`-100${privateMatched[1]}`),
      messageId: Number(privateMatched[2])
    }
  }

  const publicMatched = raw.match(/(?:https?:\/\/)?t\.me\/(?:(?:s|a)\/)?([A-Za-z0-9_]{3,})\/(\d+)(?:\?.*)?$/i)
  if (publicMatched) {
    return {
      peerRef: `@${publicMatched[1].replace(/^@+/, '')}`,
      messageId: Number(publicMatched[2])
    }
  }

  return null
}

function toIsoDateTime(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null
  }
  if (typeof value === 'number') {
    const date = new Date(value > 1_000_000_000_000 ? value : value * 1000)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  if (typeof value === 'bigint') {
    const date = new Date(Number(value) * 1000)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  return null
}

function readScheduledMediaLabel(message: any) {
  const mediaClass = String(message?.media?.className || '')
  if (mediaClass.includes('MessageMediaPhoto')) return '图片'
  if (mediaClass.includes('Document')) return '文件'
  if (mediaClass.includes('Geo')) return '位置'
  if (mediaClass.includes('Contact')) return '联系人'
  if (mediaClass.includes('Poll')) return '投票'
  if (mediaClass.includes('WebPage')) return '链接预览'
  if (message?.media) return '媒体'
  return '文字'
}

function readForwardLabel(message: any) {
  const header = message?.fwdFrom?.fromName
  if (typeof header === 'string' && header.trim()) return header.trim()
  const postAuthor = message?.postAuthor
  if (typeof postAuthor === 'string' && postAuthor.trim()) return postAuthor.trim()
  return ''
}

function readScheduledRepeatPeriod(message: any) {
  const candidates = [
    message?.scheduleRepeatPeriod,
    message?.schedule_repeat_period,
    message?.schedulePeriod,
    message?.schedule_period,
    message?.repeatPeriodSeconds,
    message?.repeat_period_seconds
  ]

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'bigint') {
      const next = Number(value)
      if (Number.isFinite(next) && next > 0) return next
    }
    if (typeof value === 'string' && value.trim()) {
      const next = Number(value)
      if (Number.isFinite(next) && next > 0) return next
    }
  }

  return null
}

function serializeScheduledMessage(message: any): BroadcastScheduledMessageItem | null {
  const messageId = typeof message?.id === 'number' ? message.id : null
  if (!messageId) return null
  const text = typeof message?.message === 'string'
    ? message.message.trim()
    : typeof message?.text === 'string'
      ? message.text.trim()
      : typeof message?.rawText === 'string'
        ? message.rawText.trim()
        : ''
  const hasMedia = Boolean(message?.media)
  const hasButtons = Boolean(message?.replyMarkup)
  const forwardLabel = readForwardLabel(message)
  return {
    messageId,
    scheduledAt: toIsoDateTime(message?.date),
    text,
    hasMedia,
    mediaLabel: readScheduledMediaLabel(message),
    hasButtons,
    isForwarded: Boolean(message?.fwdFrom),
    forwardLabel,
    repeatPeriodSeconds: readScheduledRepeatPeriod(message)
  }
}

async function getScheduledMessageCount(client: TelegramClient, entity: unknown) {
  const result = await client.invoke(new Api.messages.GetScheduledHistory({
    peer: entity as never,
    hash: bigInt.zero
  })) as { messages?: any[] }

  return Array.isArray(result?.messages) ? result.messages.length : 0
}

async function getScheduledMessageById(client: TelegramClient, entity: unknown, messageId: number) {
  const result = await client.invoke(new Api.messages.GetScheduledHistory({
    peer: entity as never,
    hash: bigInt.zero
  })) as { messages?: any[] }

  if (!Array.isArray(result?.messages)) return null
  return result.messages.find((message) => typeof message?.id === 'number' && message.id === messageId) ?? null
}

async function verifyScheduledRepeatPeriod(client: TelegramClient, entity: unknown, messageId: number, expectedRepeatPeriodSeconds: number) {
  let sawScheduledMessage = false

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const matched = await getScheduledMessageById(client, entity, messageId)
    if (matched) {
      sawScheduledMessage = true
    }

    const remoteRepeatPeriod = readScheduledRepeatPeriod(matched)
    if (remoteRepeatPeriod === expectedRepeatPeriodSeconds) {
      return { verified: true, sawScheduledMessage }
    }

    if (attempt < 7) {
      await new Promise((resolve) => setTimeout(resolve, 1_200))
    }
  }

  return { verified: false, sawScheduledMessage }
}

function extractResponseMessageId(result: unknown) {
  if (typeof (result as { id?: unknown } | null)?.id === 'number') {
    return (result as { id: number }).id
  }

  const updates = Array.isArray((result as { updates?: unknown[] } | null)?.updates)
    ? (result as { updates: Array<{ id?: unknown; message?: { id?: unknown } }> }).updates
    : []

  for (const update of updates) {
    if (typeof update?.message?.id === 'number') return update.message.id
    if (typeof update?.id === 'number') return update.id
  }

  return null
}

function extractResponseRepeatPeriod(result: unknown) {
  const direct = readScheduledRepeatPeriod(result as any)
  if (typeof direct === 'number') return direct

  const updates = Array.isArray((result as { updates?: unknown[] } | null)?.updates)
    ? (result as { updates: Array<{ message?: unknown }> }).updates
    : []

  for (const update of updates) {
    const repeatPeriod = readScheduledRepeatPeriod((update as { message?: unknown })?.message as any)
    if (typeof repeatPeriod === 'number') {
      return repeatPeriod
    }
  }

  return null
}

async function loadSourceMessage(client: TelegramClient, sourceLink: string) {
  const parsed = parseTelegramMessageLink(sourceLink)
  if (!parsed || !Number.isFinite(parsed.messageId) || parsed.messageId <= 0) {
    throw new Error('SOURCE_MESSAGE_LINK_INVALID')
  }

  const messages = await (client as TelegramClient & {
    getMessages: (entity: unknown, params: Record<string, unknown>) => Promise<Array<{
      message?: string
      text?: string
      media?: unknown
      entities?: unknown[]
      id?: number
      className?: string
    }>>
  }).getMessages(parsed.peerRef as never, { ids: [parsed.messageId] })

  const sourceMessage = Array.isArray(messages) ? messages[0] : null
  if (!sourceMessage || (sourceMessage as { className?: string }).className === 'MessageEmpty') {
    throw new Error('SOURCE_MESSAGE_LINK_INVALID')
  }

  return sourceMessage
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

  if (groupRef.kind === 'peer') {
    try {
      return await client.getEntity(groupRef.value as never)
    } catch (error) {
      const dialogs = await client.getDialogs({ limit: 300 }).catch(() => []) as Array<{ id?: { toString?: () => string }; entity?: unknown }>
      const matchedDialog = dialogs.find((dialog) => {
        const dialogId = typeof dialog?.id?.toString === 'function' ? dialog.id.toString() : ''
        return dialogId === String(groupRef.value)
      })
      if (matchedDialog?.entity) {
        return matchedDialog.entity
      }
      throw error
    }
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

function toClientProxy(proxy: AccountCheckProxy | null): AccountClientProxyOptions | null {
  if (!proxy) return null
  return {
    type: proxy.type,
    ip: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    ipVersion: proxy.ipVersion
  }
}

async function ensureAuthorizedClient(account: AccountRecord, sessionLoader: SessionLoader, clientManager: TelegramClientManager, proxyPoolService: ProxyPoolService) {
  const session = await sessionLoader.load(account.sessionPath)
  const proxy = proxyPoolService.isEnabled() ? proxyPoolService.getAccountCheckProxy() : null
  if (proxyPoolService.isEnabled() && !proxy) {
    throw new Error('GLOBAL_PROXY_REQUIRED')
  }

  const client = clientManager.createClient(session, {
    proxy: toClientProxy(proxy)
  })
  await client.connect()
  const authorized = await client.isUserAuthorized()
  if (!authorized) {
    await clientManager.destroyClient(client)
    throw new Error('AUTH_KEY_UNREGISTERED')
  }
  return client
}

export class BroadcastService {
  private activePushTask: { cancelled: boolean; clients: Map<number, TelegramClient> } | null = null

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  async stopCurrentPush(): Promise<BroadcastStopResult> {
    if (!this.activePushTask) {
      return {
        stopped: false,
        message: '当前没有正在写入的定时群发任务。'
      }
    }

    this.activePushTask.cancelled = true
    await Promise.all(Array.from(this.activePushTask.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    this.activePushTask.clients.clear()
    return {
      stopped: true,
      message: '已停止当前定时群发写入，后续不会再继续写入。'
    }
  }

  async pushSchedule(payload: BroadcastPushSchedulePayload, onProgress?: (payload: BroadcastPushScheduleProgress) => void): Promise<BroadcastPushScheduleResult> {
    const creativesById = new Map(payload.creatives.map((item) => [item.id, item]))
    const groupsById = new Map(payload.groups.map((item) => [item.id, item]))
    const accountIds = Array.from(new Set(payload.items.map((item) => item.accountId).filter((item): item is number => typeof item === 'number')))
    const accounts = this.accountRepository.getByIds(accountIds)
    const accountsById = new Map(accounts.map((item) => [item.id, item]))
    const results: BroadcastPushScheduleResultItem[] = []
    const clients = new Map<number, TelegramClient>()
    const entityCache = new Map<string, unknown>()
    const scheduledCountCache = new Map<string, number>()
    const pendingItemsByAccount = new Map<number, BroadcastPushSchedulePayload['items']>()
    let successCount = 0
    let failedCount = 0
    let completedCount = 0
    const task = { cancelled: false, clients }
    this.activePushTask = task

    const reportProgress = (item: BroadcastPushScheduleResultItem) => {
      completedCount += 1
      if (item.status === 'scheduled') successCount += 1
      if (item.status === 'failed') failedCount += 1
      this.emitProgress(payload.items.length, completedCount, successCount, failedCount, item, onProgress)
    }

    try {
      for (const item of payload.items) {
        if (task.cancelled) break
        const existingScheduled = item.status === 'scheduled' && item.remoteMessageId
        if (existingScheduled) {
          const resultItem: BroadcastPushScheduleResultItem = {
            previewItemId: item.id,
            status: 'scheduled',
            errorMessage: '',
            remoteMessageId: item.remoteMessageId ?? null,
            syncedAt: item.syncedAt ?? null,
            accountId: item.accountId,
            groupId: item.groupId,
            creativeId: item.creativeId
          }
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }

        const creative = item.creativeId ? creativesById.get(item.creativeId) : null
        const group = groupsById.get(item.groupId)
        const account = typeof item.accountId === 'number' ? accountsById.get(item.accountId) : null
        const scheduledAt = new Date(item.scheduledAt)

        if (!group) {
          const resultItem = this.createFailedItem(item, '目标群不存在，请重新生成预览')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (!group.enabled) {
          const resultItem = this.createFailedItem(item, `目标群 ${group.title} 当前已停用`)
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (!creative) {
          const resultItem = this.createFailedItem(item, '文案不存在，请重新生成预览')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (!creative.enabled) {
          const resultItem = this.createFailedItem(item, `文案 ${creative.title} 当前已停用`)
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (!account) {
          const resultItem = this.createFailedItem(item, '发送账号不存在，请检查账号列表')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (!Number.isFinite(scheduledAt.getTime())) {
          const resultItem = this.createFailedItem(item, '排程时间格式不正确')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (scheduledAt.getTime() <= Date.now() + MIN_SCHEDULE_AHEAD_MS) {
          const resultItem = this.createFailedItem(item, '排程时间太近或已过期，请重新生成未来时间段的计划')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (creative.kind === 'channel_forward' && !creative.sourceLink.trim()) {
          const resultItem = this.createFailedItem(item, '频道消息链接还没填，请先贴一条频道消息链接')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if (creative.kind !== 'channel_forward' && !creative.text.trim() && !creative.imageUrl.trim()) {
          const resultItem = this.createFailedItem(item, '文案正文和图片不能同时为空')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }
        if ((item.repeatPeriodSeconds ?? 0) > 0 && !account.profile?.is_premium) {
          const resultItem = this.createFailedItem(item, '当前账号不是会员号，不能写入 Telegram 重复定时发送')
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }

        const groupRef = normalizeGroupRef(group.targetRef || group.username)
        if (!groupRef) {
          const resultItem = this.createFailedItem(item, `目标群 ${group.title} 缺少可用的 @username、私密链接或群链接`)
          results.push(resultItem)
          reportProgress(resultItem)
          continue
        }

        const currentQueue = pendingItemsByAccount.get(account.id) ?? []
        currentQueue.push(item)
        pendingItemsByAccount.set(account.id, currentQueue)
      }

      await Promise.all(Array.from(pendingItemsByAccount.entries()).map(async ([accountId, items]) => {
        const account = accountsById.get(accountId)
        if (!account) return

        for (const item of items) {
          if (task.cancelled) break
          const creative = item.creativeId ? creativesById.get(item.creativeId) : null
          const group = groupsById.get(item.groupId)
          const scheduledAt = new Date(item.scheduledAt)

          if (!creative || !group) {
            const resultItem = this.createFailedItem(item, !group ? '目标群不存在，请重新生成预览' : '文案不存在，请重新生成预览')
            results.push(resultItem)
            reportProgress(resultItem)
            continue
          }

          const groupRef = normalizeGroupRef(group.targetRef || group.username)
          if (!groupRef) {
            const resultItem = this.createFailedItem(item, `目标群 ${group.title} 缺少可用的 @username、私密链接或群链接`)
            results.push(resultItem)
            reportProgress(resultItem)
            continue
          }

          let finished = false
          while (!finished && !task.cancelled) {
            try {
              let client = clients.get(account.id)
              if (!client) {
                client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
                if (task.cancelled) {
                  await this.clientManager.destroyClient(client).catch(() => undefined)
                  break
                }
                clients.set(account.id, client)
              }

              const entityKey = `${account.id}:${groupRef.kind}:${String(groupRef.value)}`
              let entity = entityCache.get(entityKey)
              if (!entity) {
                entity = await resolveGroupEntity(client, groupRef)
                entityCache.set(entityKey, entity)
              }

              let scheduledCount = scheduledCountCache.get(entityKey)
              if (typeof scheduledCount !== 'number') {
                scheduledCount = await getScheduledMessageCount(client, entity)
                scheduledCountCache.set(entityKey, scheduledCount)
              }
              if (scheduledCount >= TELEGRAM_SCHEDULE_QUEUE_LIMIT) {
                throw new Error(`SCHEDULE_QUEUE_FULL_LOCAL: current=${scheduledCount}`)
              }

              let messageId: number | null = null

              if (creative.kind === 'channel_forward') {
                const sourceMessage = parseTelegramMessageLink(creative.sourceLink)
                if (!sourceMessage || !Number.isFinite(sourceMessage.messageId) || sourceMessage.messageId <= 0) {
                  throw new Error('SOURCE_MESSAGE_LINK_INVALID')
                }

                const forwardResult = await (client as TelegramClient & {
                  forwardMessages: (entity: unknown, options: Record<string, unknown>) => Promise<Array<{ id?: number }> | { id?: number }>
                }).forwardMessages(entity as never, {
                  messages: [sourceMessage.messageId],
                  fromPeer: sourceMessage.peerRef as never,
                  schedule: Math.floor(scheduledAt.getTime() / 1000),
                  scheduleRepeatPeriod: (item.repeatPeriodSeconds ?? 0) > 0 ? item.repeatPeriodSeconds : undefined,
                  dropAuthor: false
                })

                const firstResult = Array.isArray(forwardResult) ? forwardResult[0] : forwardResult
                messageId = extractResponseMessageId(firstResult)

                if ((item.repeatPeriodSeconds ?? 0) > 0 && messageId) {
                  const responseRepeatPeriod = extractResponseRepeatPeriod(firstResult)
                  const verification = responseRepeatPeriod === (item.repeatPeriodSeconds ?? 0)
                    ? { verified: true, sawScheduledMessage: true }
                    : await verifyScheduledRepeatPeriod(client, entity, messageId, item.repeatPeriodSeconds ?? 0)
                  if (!verification.verified && !verification.sawScheduledMessage) {
                    await client.invoke(new Api.messages.DeleteScheduledMessages({
                      peer: entity as never,
                      id: [messageId]
                    })).catch(() => undefined)
                    throw new Error('TELEGRAM_REPEAT_NOT_APPLIED')
                  }
                }
              } else {
                const media = creative.imageUrl.trim() ? resolveMediaFile(creative.imageUrl, creative.title || creative.text || 'broadcast-image') : undefined
                const message = await (client as TelegramClient & { sendMessage: (entity: unknown, options: Record<string, unknown>) => Promise<{ id?: number }> }).sendMessage(entity as never, {
                  message: buildCreativeMessage(creative),
                  file: media,
                  schedule: Math.floor(scheduledAt.getTime() / 1000),
                  scheduleRepeatPeriod: (item.repeatPeriodSeconds ?? 0) > 0 ? item.repeatPeriodSeconds : undefined
                })
                messageId = extractResponseMessageId(message)

                if ((item.repeatPeriodSeconds ?? 0) > 0 && messageId) {
                  const responseRepeatPeriod = extractResponseRepeatPeriod(message)
                  const verification = responseRepeatPeriod === (item.repeatPeriodSeconds ?? 0)
                    ? { verified: true, sawScheduledMessage: true }
                    : await verifyScheduledRepeatPeriod(client, entity, messageId, item.repeatPeriodSeconds ?? 0)
                  if (!verification.verified && !verification.sawScheduledMessage) {
                    await client.invoke(new Api.messages.DeleteScheduledMessages({
                      peer: entity as never,
                      id: [messageId]
                    })).catch(() => undefined)
                    throw new Error('TELEGRAM_REPEAT_NOT_APPLIED')
                  }
                }
              }

              const resultItem: BroadcastPushScheduleResultItem = {
                previewItemId: item.id,
                status: 'scheduled',
                errorMessage: '',
                remoteMessageId: messageId,
                syncedAt: new Date().toISOString(),
                accountId: item.accountId,
                groupId: item.groupId,
                creativeId: item.creativeId
              }
              results.push(resultItem)
              reportProgress(resultItem)
              scheduledCountCache.set(entityKey, scheduledCount + 1)
              finished = true
            } catch (error) {
              if (task.cancelled) break

              const waitSeconds = readRequiredWaitSeconds(error)
              if (waitSeconds) {
                this.emitNoticeProgress(
                  payload.items.length,
                  completedCount,
                  successCount,
                  failedCount,
                  item,
                  `当前账号发得有点快了，Telegram 要求先等 ${waitSeconds} 秒，时间到了会自动继续。`,
                  onProgress
                )
                await this.sleepWithCancel(waitSeconds * 1000, task)
                continue
              }

              const resultItem = this.createFailedItem(item, formatBroadcastError(error))
              results.push(resultItem)
              reportProgress(resultItem)
              finished = true
            }
          }
        }
      }))
    } finally {
      await Promise.all(Array.from(clients.values()).map((client) => this.clientManager.destroyClient(client)))
      if (this.activePushTask === task) {
        this.activePushTask = null
      }
    }

    const message = results.length === 0
      ? '当前没有可写入的排程'
      : task.cancelled
        ? `定时群发已停止。已写入 ${successCount} 条，失败 ${failedCount} 条，剩余 ${Math.max(0, payload.items.length - results.length)} 条未继续写入。`
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

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)

    try {
      const dialogs = await client.getDialogs({ limit: 5000 })
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

  async listScheduledMessages(accountId: number, groupRefRaw: string): Promise<BroadcastScheduledMessageListResult> {
    const account = this.accountRepository.getByIds([accountId])[0]
    if (!account) {
      throw new Error('账号不存在')
    }

    const groupRef = normalizeGroupRef(groupRefRaw)
    if (!groupRef) {
      throw new Error('群组引用不对，请重新选一个群。')
    }

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
    try {
      const entity = await resolveGroupEntity(client, groupRef)
      const result = await client.invoke(new Api.messages.GetScheduledHistory({
        peer: entity as never,
        hash: bigInt.zero
      })) as { messages?: any[] }

      const items = Array.isArray(result?.messages)
        ? result.messages.map((message) => serializeScheduledMessage(message)).filter((item): item is BroadcastScheduledMessageItem => Boolean(item))
          .sort((left, right) => {
            const leftTime = left.scheduledAt ? new Date(left.scheduledAt).getTime() : 0
            const rightTime = right.scheduledAt ? new Date(right.scheduledAt).getTime() : 0
            return leftTime - rightTime
          })
        : []

      return {
        total: items.length,
        items,
        message: items.length > 0 ? `已读取到 ${items.length} 条定时内容。` : '这个群当前还没有定时内容。'
      }
    } catch (error) {
      throw new Error(formatBroadcastError(error))
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  async deleteScheduledMessages(payload: BroadcastDeleteScheduledMessagesPayload): Promise<BroadcastDeleteScheduledMessagesResult> {
    const account = this.accountRepository.getByIds([payload.accountId])[0]
    if (!account) {
      throw new Error('账号不存在')
    }
    const messageIds = Array.from(new Set(payload.messageIds.filter((item) => Number.isFinite(item) && item > 0)))
    if (messageIds.length === 0) {
      return {
        deletedCount: 0,
        message: '还没有选中要删除的定时内容。'
      }
    }

    const groupRef = normalizeGroupRef(payload.groupRef)
    if (!groupRef) {
      throw new Error('群组引用不对，请重新选一个群。')
    }

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
    try {
      const entity = await resolveGroupEntity(client, groupRef)
      await client.invoke(new Api.messages.DeleteScheduledMessages({
        peer: entity as never,
        id: messageIds
      }))
      return {
        deletedCount: messageIds.length,
        message: `已删除 ${messageIds.length} 条定时内容。`
      }
    } catch (error) {
      throw new Error(formatBroadcastError(error))
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  private emitProgress(
    total: number,
    completed: number,
    successCount: number,
    failedCount: number,
    item: BroadcastPushScheduleResultItem,
    onProgress?: (payload: BroadcastPushScheduleProgress) => void
  ) {
    if (!onProgress) return
    onProgress({
      total,
      completed,
      successCount,
      failedCount,
      item,
      message: `正在写入 ${completed}/${total}，已写入 ${successCount} 条，失败 ${failedCount} 条。`
    })
  }

  private emitNoticeProgress(
    total: number,
    completed: number,
    successCount: number,
    failedCount: number,
    item: BroadcastPushSchedulePayload['items'][number],
    message: string,
    onProgress?: (payload: BroadcastPushScheduleProgress) => void
  ) {
    if (!onProgress) return
    onProgress({
      total,
      completed,
      successCount,
      failedCount,
      item: {
        previewItemId: item.id,
        status: 'queued',
        errorMessage: '',
        remoteMessageId: null,
        syncedAt: null,
        accountId: item.accountId,
        groupId: item.groupId,
        creativeId: item.creativeId
      },
      message
    })
  }

  private async sleepWithCancel(ms: number, task: { cancelled: boolean }) {
    if (ms <= 0) return
    const step = 500
    let remaining = ms
    while (remaining > 0 && !task.cancelled) {
      const wait = Math.min(step, remaining)
      await new Promise((resolve) => setTimeout(resolve, wait))
      remaining -= wait
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
