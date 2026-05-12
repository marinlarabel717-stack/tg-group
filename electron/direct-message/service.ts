import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import { NewMessage } from 'telegram/events'
import { CustomFile } from 'telegram/client/uploads'
import bigInt from 'big-integer'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager } from '../accounts/check-engine/telegram-client-manager'
import type {
  DirectMessageAutoReplyEvent,
  DirectMessageAutoReplyPayload,
  DirectMessageAutoReplyState,
  DirectMessageCollectPayload,
  DirectMessageCollectResult,
  DirectMessageCollectedUserPayload,
  DirectMessageSendPayload,
  DirectMessageSendProgress,
  DirectMessageSendResult,
  DirectMessageSendResultItem
} from '../../src/types'

function formatDirectMessageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '私信发送失败'
  if (/PEER_FLOOD/i.test(normalized)) return '这个账号触发 Telegram 私信风控了，先暂停一会再发。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个用户名不对，请检查 @username 是否填错。'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '这个用户名不存在，请确认目标用户写对了。'
  if (/PHONE_NUMBER_INVALID/i.test(normalized)) return '这个手机号格式不对，请检查手机号。'
  if (/USER_PRIVACY_RESTRICTED/i.test(normalized)) return '对方隐私限制了私信，当前账号发不过去。'
  if (/USER_IS_BLOCKED/i.test(normalized)) return '对方已经把当前账号拉黑了。'
  if (/CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED/i.test(normalized)) return '当前账号没有发送权限，或者被限制了。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录状态失效了，需要重新登录。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(normalized)) return '私信文案太长了，缩短一点再试。'
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(normalized)) return '图片有问题，Telegram 不认这张图。'
  if (/SOURCE_MESSAGE_LINK_INVALID/i.test(normalized)) return '频道消息链接不对，请检查链接。'
  if (/CHAT_FORWARDS_RESTRICTED/i.test(normalized)) return '这个频道消息禁止转发。'
  if (/FLOOD_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/FLOOD_WAIT_(\d+)/i)
    return matched ? `当前账号被限流了，请 ${matched[1]} 秒后再试。` : '当前账号被限流了，请稍后再试。'
  }
  return `发送失败：${normalized}`
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function slugifyFileName(input: string) {
  const value = input.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '')
  return value || 'direct_message_image'
}

function inferImageExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'bin'
}

function resolveMediaFile(imageUrl: string, title: string) {
  const value = imageUrl.trim()
  if (!value) return undefined
  if (value.startsWith('data:')) {
    const matched = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!matched) throw new Error('图片 Data URL 格式不正确')
    const mimeType = matched[1] || 'application/octet-stream'
    const encoded = matched[3] || ''
    const buffer = matched[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded), 'utf8')
    const extension = inferImageExtension(mimeType)
    return new CustomFile(`${slugifyFileName(title)}.${extension}`, buffer.length, '', buffer)
  }
  return value
}

function parseDirectTarget(targetValue: string) {
  const raw = targetValue.trim()
  if (!raw) return null
  if (/^\+?\d{6,15}$/.test(raw)) return { kind: 'phone' as const, value: raw.startsWith('+') ? raw : `+${raw}` }
  const directLink = raw.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,})(?:\?.*)?$/i)
  if (directLink?.[1]) return { kind: 'username' as const, value: `@${directLink[1].replace(/^@+/, '')}` }
  if (/^@?[A-Za-z0-9_]{5,}$/i.test(raw)) return { kind: 'username' as const, value: raw.startsWith('@') ? raw : `@${raw}` }
  return null
}

function normalizeCollectedValue(user: { username?: string | null; phone?: string | null }) {
  if (typeof user.username === 'string' && user.username.trim()) {
    const username = user.username.replace(/^@+/, '').trim()
    if (username) return `@${username}`
  }
  if (typeof user.phone === 'string' && user.phone.trim()) {
    return user.phone.startsWith('+') ? user.phone : `+${user.phone}`
  }
  return ''
}

function normalizeTargetValue(input: string) {
  const value = input.trim()
  if (!value) return ''
  if (/^@?[a-zA-Z0-9_]{5,}$/i.test(value)) return `@${value.replace(/^@+/, '').toLowerCase()}`
  return value.toLowerCase()
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

async function loadSourceMessage(client: TelegramClient, sourceLink: string) {
  const parsed = parseTelegramMessageLink(sourceLink)
  if (!parsed || !Number.isFinite(parsed.messageId) || parsed.messageId <= 0) {
    throw new Error('SOURCE_MESSAGE_LINK_INVALID')
  }

  const messages = await (client as TelegramClient & {
    getMessages: (entity: unknown, params: Record<string, unknown>) => Promise<Array<any>>
  }).getMessages(parsed.peerRef as never, { ids: [parsed.messageId] })

  const sourceMessage = Array.isArray(messages) ? messages[0] : null
  if (!sourceMessage || (sourceMessage as { className?: string }).className === 'MessageEmpty') {
    throw new Error('SOURCE_MESSAGE_LINK_INVALID')
  }

  return { parsed, sourceMessage }
}

function parsePostbotCode(code: string) {
  const raw = code.trim()
  if (!raw) return { text: '', imageUrl: '', buttonText: '', buttonUrl: '' }

  const normalized = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    const text = [parsed.text, parsed.message, parsed.caption, parsed.content].find((item) => typeof item === 'string' && item.trim())
    const imageUrl = [parsed.imageUrl, parsed.image, parsed.photo, parsed.media].find((item) => typeof item === 'string' && item.trim())
    const buttonText = [parsed.buttonText, parsed.button_title, parsed.buttonLabel].find((item) => typeof item === 'string' && item.trim())
    const buttonUrl = [parsed.buttonUrl, parsed.url, parsed.link].find((item) => typeof item === 'string' && item.trim())
    return {
      text: typeof text === 'string' ? text.trim() : '',
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
      buttonText: typeof buttonText === 'string' ? buttonText.trim() : '',
      buttonUrl: typeof buttonUrl === 'string' ? buttonUrl.trim() : ''
    }
  } catch {
    return { text: normalized, imageUrl: '', buttonText: '', buttonUrl: '' }
  }
}

function buildPostbotText(parsed: { text: string; buttonText: string; buttonUrl: string }) {
  const base = parsed.text.trim()
  if (!parsed.buttonText || !parsed.buttonUrl) return base
  return `${base}${base ? '\n\n' : ''}${parsed.buttonText}\n${parsed.buttonUrl}`
}

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  return `账号#${account.id}`
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

async function resolveSendEntity(client: TelegramClient, targetValue: string) {
  const parsed = parseDirectTarget(targetValue)
  if (!parsed) {
    throw new Error('目标用户格式不对')
  }

  if (parsed.kind === 'username') {
    const entity = await client.getEntity(parsed.value as never)
    return { entity, cleanup: undefined as undefined | (() => Promise<void>) }
  }

  const importResult = await client.invoke(new Api.contacts.ImportContacts({
    contacts: [new Api.InputPhoneContact({
      clientId: bigInt(Date.now()),
      phone: parsed.value,
      firstName: 'Direct',
      lastName: 'Message'
    })]
  }))

  const importedUser = Array.isArray((importResult as { users?: unknown[] }).users)
    ? (importResult as { users: Array<{ id?: unknown }> }).users[0]
    : null

  if (!importedUser) {
    throw new Error('PHONE_NUMBER_INVALID')
  }

  const entity = await client.getEntity(importedUser as never)
  return {
    entity,
    cleanup: async () => {
      try {
        await client.invoke(new Api.contacts.DeleteByPhones({ phones: [parsed.value] }))
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

interface AutoReplyRuntimeEntry {
  account: AccountRecord
  client: TelegramClient
  handler: (event: any) => Promise<void>
  eventBuilder: NewMessage
}

export class DirectMessageService {
  private autoReplyRuntime = new Map<number, AutoReplyRuntimeEntry>()
  private autoReplyState: DirectMessageAutoReplyState = {
    enabled: false,
    accountIds: [],
    activeCount: 0,
    ruleCount: 0,
    startedAt: null
  }
  private autoReplyRules: DirectMessageAutoReplyPayload['rules'] = []
  private autoReplyCooldowns = new Map<string, number>()
  private autoReplyEventSink?: (payload: DirectMessageAutoReplyEvent) => void

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager
  ) {}

  setAutoReplyEventSink(sink?: (payload: DirectMessageAutoReplyEvent) => void) {
    this.autoReplyEventSink = sink
  }

  async sendMessages(payload: DirectMessageSendPayload, onProgress?: (payload: DirectMessageSendProgress) => void): Promise<DirectMessageSendResult> {
    const accountIds = Array.from(new Set(payload.items.map((item) => item.accountId).filter((item): item is number => typeof item === 'number')))
    const accounts = this.accountRepository.getByIds(accountIds)
    const accountsById = new Map(accounts.map((item) => [item.id, item]))
    const clients = new Map<number, TelegramClient>()
    const results: DirectMessageSendResultItem[] = []
    const sortedItems = [...payload.items].sort((left, right) => left.waitSeconds - right.waitSeconds)
    const startedAt = Date.now()

    try {
      for (const item of sortedItems) {
        const dueAt = startedAt + item.waitSeconds * 1000
        await sleep(dueAt - Date.now())

        const account = typeof item.accountId === 'number' ? accountsById.get(item.accountId) : null
        if (!account) {
          const resultItem = this.createFailedSendItem(item, '发送账号不存在，请重新选择账号后再试。')
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
          continue
        }
        if (payload.messageType === 'text' && !payload.messageText.trim()) {
          const resultItem = this.createFailedSendItem(item, '文本内容还没填。')
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
          continue
        }
        if ((payload.messageType === 'channel_forward' || payload.messageType === 'hidden_channel_forward') && !payload.sourceLink.trim()) {
          const resultItem = this.createFailedSendItem(item, '频道消息链接还没填。')
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
          continue
        }
        if (payload.messageType === 'postbot_code' && !payload.postbotCode.trim()) {
          const resultItem = this.createFailedSendItem(item, 'postbot 代码还没填。')
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
          continue
        }

        let cleanup: undefined | (() => Promise<void>)

        try {
          let client = clients.get(account.id)
          if (!client) {
            client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)
            clients.set(account.id, client)
          }

          const resolved = await resolveSendEntity(client, item.targetValue)
          cleanup = resolved.cleanup
          let response: { id?: number } | Array<{ id?: number }> | null = null

          if (payload.messageType === 'channel_forward') {
            const { parsed } = await loadSourceMessage(client, payload.sourceLink)
            response = await (client as TelegramClient & {
              forwardMessages: (entity: unknown, options: Record<string, unknown>) => Promise<Array<{ id?: number }> | { id?: number }>
            }).forwardMessages(resolved.entity as never, {
              messages: [parsed.messageId],
              fromPeer: parsed.peerRef as never,
              dropAuthor: false
            })
          } else if (payload.messageType === 'hidden_channel_forward') {
            const { sourceMessage } = await loadSourceMessage(client, payload.sourceLink)
            const sourceText = typeof sourceMessage.message === 'string'
              ? sourceMessage.message
              : typeof sourceMessage.text === 'string'
                ? sourceMessage.text
                : ''
            const sourceMedia = sourceMessage.media
            const sourceEntities = Array.isArray(sourceMessage.entities) ? sourceMessage.entities : undefined
            if (!sourceText.trim() && !sourceMedia) {
              throw new Error('MEDIA_EMPTY')
            }
            response = await (client as TelegramClient & {
              sendMessage: (entity: unknown, options: Record<string, unknown>) => Promise<{ id?: number }>
            }).sendMessage(resolved.entity as never, {
              message: sourceText || undefined,
              file: sourceMedia || undefined,
              formattingEntities: sourceEntities
            })
          } else if (payload.messageType === 'postbot_code') {
            const parsedPostbot = parsePostbotCode(payload.postbotCode)
            const composedText = buildPostbotText(parsedPostbot)
            const media = parsedPostbot.imageUrl ? resolveMediaFile(parsedPostbot.imageUrl, composedText || item.targetValue) : undefined
            response = await (client as TelegramClient & {
              sendMessage: (entity: unknown, options: Record<string, unknown>) => Promise<{ id?: number }>
            }).sendMessage(resolved.entity as never, {
              message: composedText || undefined,
              file: media
            })
          } else {
            const media = payload.imageUrl.trim() ? resolveMediaFile(payload.imageUrl, payload.messageText || item.targetValue) : undefined
            response = await (client as TelegramClient & {
              sendMessage: (entity: unknown, options: Record<string, unknown>) => Promise<{ id?: number }>
            }).sendMessage(resolved.entity as never, {
              message: payload.messageText.trim() || undefined,
              file: media
            })
          }

          const resultItem: DirectMessageSendResultItem = {
            previewItemId: item.id,
            targetId: item.targetId,
            targetValue: item.targetValue,
            status: 'sent',
            errorMessage: '',
            remoteMessageId: Array.isArray(response)
              ? (typeof response[0]?.id === 'number' ? response[0].id : null)
              : (typeof response?.id === 'number' ? response.id : null),
            sentAt: new Date().toISOString(),
            accountId: item.accountId
          }
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        } catch (error) {
          const resultItem = this.createFailedSendItem(item, formatDirectMessageError(error))
          results.push(resultItem)
          this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        } finally {
          await cleanup?.()
        }
      }
    } finally {
      await Promise.all(Array.from(clients.values()).map((client) => this.clientManager.destroyClient(client)))
    }

    const successCount = results.filter((item) => item.status === 'sent').length
    const failedCount = results.filter((item) => item.status === 'failed').length
    return {
      total: results.length,
      successCount,
      failedCount,
      items: results,
      message: failedCount === 0 ? `已成功发出 ${successCount} 条私信。` : `发送完成：成功 ${successCount} 条，失败 ${failedCount} 条。`
    }
  }

  async collectUsers(payload: DirectMessageCollectPayload): Promise<DirectMessageCollectResult> {
    const account = this.accountRepository.getByIds([payload.accountId])[0]
    if (!account) throw new Error('账号不存在')

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)

    try {
      let rawUsers: Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }> = []
      const limit = Math.max(1, Math.min(payload.limit ?? 100, 300))

      if (payload.mode === 'contact') {
        const contacts = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt.zero }))
        rawUsers = Array.isArray((contacts as { users?: unknown[] }).users)
          ? (contacts as { users: Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }> }).users.slice(0, limit)
          : []
      } else if (payload.mode === 'group_members') {
        const target = parseDirectTarget(payload.source)
        if (!target || target.kind !== 'username') throw new Error('群链接或群用户名不对')
        const entity = await client.getEntity(target.value as never)
        rawUsers = await (client as TelegramClient & {
          getParticipants: (entity: unknown, params: Record<string, unknown>) => Promise<Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }>>
        }).getParticipants(entity as never, { limit })
      } else if (payload.mode === 'comment_users') {
        const parsed = parseTelegramMessageLink(payload.source)
        if (!parsed) throw new Error('频道消息链接不对')
        const messages = await (client as TelegramClient & {
          getMessages: (entity: unknown, params: Record<string, unknown>) => Promise<Array<any>>
        }).getMessages(parsed.peerRef as never, { replyTo: parsed.messageId, limit })

        const users = new Map<string, { id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }>()
        for (const message of messages || []) {
          let sender = typeof message?.getSender === 'function' ? await message.getSender() : null
          if (!sender && message?.senderId) {
            try {
              sender = await client.getEntity(message.senderId as never)
            } catch {
              sender = null
            }
          }
          if (!sender || typeof sender !== 'object') continue
          const key = String((sender as { id?: unknown }).id ?? '')
          if (!key) continue
          users.set(key, sender as any)
        }
        rawUsers = Array.from(users.values()).slice(0, limit)
      } else if (payload.mode === 'react_users') {
        const parsed = parseTelegramMessageLink(payload.source)
        if (!parsed) throw new Error('频道消息链接不对')
        const entity = await client.getEntity(parsed.peerRef as never)
        const reactionList = await client.invoke(new Api.messages.GetMessageReactionsList({
          peer: entity as never,
          id: parsed.messageId,
          limit
        }))
        rawUsers = Array.isArray((reactionList as { users?: unknown[] }).users)
          ? (reactionList as { users: Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }> }).users
          : []
      }

      const resultItems: DirectMessageCollectedUserPayload[] = []
      const seen = new Set<string>()
      let skipped = 0

      for (const user of rawUsers) {
        const value = normalizeCollectedValue(user)
        if (!value) {
          skipped += 1
          continue
        }
        const normalizedValue = normalizeTargetValue(value)
        if (!normalizedValue || seen.has(normalizedValue)) {
          skipped += 1
          continue
        }
        seen.add(normalizedValue)
        resultItems.push({
          value,
          normalizedValue,
          sourceLabel: payload.mode === 'contact' ? '联系人' : payload.mode === 'group_members' ? '群成员' : payload.mode === 'comment_users' ? '评论用户' : '反应用户',
          userId: typeof user.id === 'bigint' ? user.id.toString() : String(user.id ?? ''),
          username: typeof user.username === 'string' ? user.username : '',
          phone: typeof user.phone === 'string' ? user.phone : ''
        })
      }

      return {
        total: rawUsers.length,
        added: resultItems.length,
        skipped,
        items: resultItems,
        message: resultItems.length > 0 ? `已采集 ${resultItems.length} 个可用用户。` : '没有采集到可直接发送的用户。'
      }
    } catch (error) {
      throw new Error(formatDirectMessageError(error))
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  async configureAutoReply(payload: DirectMessageAutoReplyPayload): Promise<DirectMessageAutoReplyState> {
    await this.stopAllAutoReply()

    const rules = payload.rules.filter((rule) => rule.enabled && rule.keyword.trim() && rule.replyText.trim())
    if (!payload.enabled || payload.accountIds.length === 0 || rules.length === 0) {
      this.autoReplyRules = []
      this.autoReplyState = {
        enabled: false,
        accountIds: [],
        activeCount: 0,
        ruleCount: 0,
        startedAt: null
      }
      return this.autoReplyState
    }

    const accounts = this.accountRepository.getByIds(payload.accountIds)
    this.autoReplyRules = rules

    for (const account of accounts) {
      try {
        const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)
        const handler = async (event: any) => {
          try {
            const message = event?.message
            if (!event?.isPrivate || !message) return
            const text = typeof message.message === 'string' ? message.message.trim() : typeof message.text === 'string' ? message.text.trim() : ''
            if (!text) return

            const sender = typeof message.getSender === 'function' ? await message.getSender() : null
            const senderId = sender?.id ? String(sender.id) : (message.senderId ? String(message.senderId) : '')
            if (!senderId) return

            const matchedRule = this.autoReplyRules.find((rule) => {
              const keyword = rule.keyword.trim()
              if (!keyword) return false
              if (rule.matchMode === 'exact') return text === keyword
              return text.toLowerCase().includes(keyword.toLowerCase())
            })
            if (!matchedRule) return

            const cooldownKey = `${account.id}:${senderId}:${matchedRule.id}`
            const lastReplyAt = this.autoReplyCooldowns.get(cooldownKey) ?? 0
            const cooldownMs = Math.max(0, matchedRule.cooldownSeconds) * 1000
            if (cooldownMs > 0 && Date.now() - lastReplyAt < cooldownMs) return

            this.autoReplyCooldowns.set(cooldownKey, Date.now())
            await message.reply({ message: matchedRule.replyText })
            this.emitAutoReplyEvent({
              accountId: account.id,
              accountLabel: readAccountLabel(account),
              senderId,
              senderLabel: [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || sender?.username || sender?.phone || senderId,
              messageText: text,
              matchedKeyword: matchedRule.keyword,
              replyText: matchedRule.replyText,
              status: 'replied',
              errorMessage: '',
              createdAt: new Date().toISOString()
            })
          } catch (error) {
            this.emitAutoReplyEvent({
              accountId: account.id,
              accountLabel: readAccountLabel(account),
              senderId: '',
              senderLabel: '未知用户',
              messageText: '',
              matchedKeyword: '',
              replyText: '',
              status: 'failed',
              errorMessage: formatDirectMessageError(error),
              createdAt: new Date().toISOString()
            })
          }
        }

        const eventBuilder = new NewMessage({ incoming: true })
        client.addEventHandler(handler, eventBuilder)
        this.autoReplyRuntime.set(account.id, { account, client, handler, eventBuilder })
      } catch (error) {
        this.emitAutoReplyEvent({
          accountId: account.id,
          accountLabel: readAccountLabel(account),
          senderId: '',
          senderLabel: '系统',
          messageText: '',
          matchedKeyword: '',
          replyText: '',
          status: 'failed',
          errorMessage: formatDirectMessageError(error),
          createdAt: new Date().toISOString()
        })
      }
    }

    this.autoReplyState = {
      enabled: this.autoReplyRuntime.size > 0,
      accountIds: Array.from(this.autoReplyRuntime.keys()),
      activeCount: this.autoReplyRuntime.size,
      ruleCount: this.autoReplyRules.length,
      startedAt: this.autoReplyRuntime.size > 0 ? new Date().toISOString() : null
    }

    return this.autoReplyState
  }

  getAutoReplyState() {
    return this.autoReplyState
  }

  async dispose() {
    await this.stopAllAutoReply()
  }

  private async stopAllAutoReply() {
    const runtimes = Array.from(this.autoReplyRuntime.values())
    this.autoReplyRuntime.clear()
    this.autoReplyCooldowns.clear()
    await Promise.all(runtimes.map(async (runtime) => {
      try {
        runtime.client.removeEventHandler(runtime.handler as never, runtime.eventBuilder)
      } catch {
        // ignore
      }
      await this.clientManager.destroyClient(runtime.client)
    }))
  }

  private emitSendProgress(results: DirectMessageSendResultItem[], total: number, item: DirectMessageSendResultItem, onProgress?: (payload: DirectMessageSendProgress) => void) {
    if (!onProgress) return
    const successCount = results.filter((entry) => entry.status === 'sent').length
    const failedCount = results.filter((entry) => entry.status === 'failed').length
    onProgress({
      total,
      completed: results.length,
      successCount,
      failedCount,
      item,
      message: `正在发送 ${results.length}/${total}，成功 ${successCount}，失败 ${failedCount}。`
    })
  }

  private emitAutoReplyEvent(payload: DirectMessageAutoReplyEvent) {
    this.autoReplyEventSink?.(payload)
  }

  private createFailedSendItem(item: DirectMessageSendPayload['items'][number], errorMessage: string): DirectMessageSendResultItem {
    return {
      previewItemId: item.id,
      targetId: item.targetId,
      targetValue: item.targetValue,
      status: 'failed',
      errorMessage,
      remoteMessageId: null,
      sentAt: null,
      accountId: item.accountId
    }
  }
}
