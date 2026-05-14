import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import { NewMessage } from 'telegram/events'
import { CustomFile } from 'telegram/client/uploads'
import bigInt from 'big-integer'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
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
  DirectMessageSendResultItem,
  DirectMessageStopResult,
  GroupCollectorFilterPayload,
  GroupCollectorLastSeenBucket,
  GroupCollectorPayload,
  GroupCollectorResult,
  GroupCollectorRole,
  GroupCollectorUserPayload
} from '../../src/types'

function formatDirectMessageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '私信发送失败'
  const waitMatched = normalized.match(/A wait of (\d+) seconds is required/i)
  if (waitMatched?.[1]) return `操作太快了，Telegram 要求先等 ${waitMatched[1]} 秒再继续。`
  if (/PEER_FLOOD/i.test(normalized)) return '这个账号触发 Telegram 私信风控了，先暂停一会再发。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理，所以这次没有继续走本地直连。先把可用代理补上再试。'
  if (/FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(normalized)) return '这个账号已经冻结了，当前私信功能用不了，系统会自动停掉这个账号。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(normalized)) return '这个账号已经被封了，不能继续私信，系统会自动停掉这个账号。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录已经失效了，需要重新登录，系统会自动停掉这个账号。'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '这个账号当前被 Telegram 限制了，不能继续私信，系统会自动停掉这个账号。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个用户名不对，请检查 @username 是否填错。'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '这个用户名不存在，请确认目标用户写对了。'
  if (/ALLOW_PAYMENT_REQUIRED/i.test(normalized)) return '对方开启了付费私信，当前账号不能直接发送。'
  if (/INPUT_USER_DEACTIVATED/i.test(normalized)) return '对方账号已注销、被封，或者已经不存在。'
  if (/PHONE_NUMBER_INVALID/i.test(normalized)) return '这个手机号格式不对，请检查手机号。'
  if (/USER_PRIVACY_RESTRICTED/i.test(normalized)) return '对方隐私限制了私信，当前账号发不过去。'
  if (/USER_IS_BLOCKED/i.test(normalized)) return '对方已经把当前账号拉黑了。'
  if (/CHAT_SEND_PHOTOS_FORBIDDEN/i.test(normalized)) return '对方那边不允许收图片，或者当前会话不让发图片。'
  if (/CHAT_SEND_VIDEOS_FORBIDDEN/i.test(normalized)) return '当前会话不允许发视频。'
  if (/CHAT_SEND_GIFS_FORBIDDEN/i.test(normalized)) return '当前会话不允许发动图。'
  if (/CHAT_SEND_DOCS_FORBIDDEN/i.test(normalized)) return '当前会话不允许发文件。'
  if (/CHAT_SEND_VOICES_FORBIDDEN/i.test(normalized)) return '当前会话不允许发语音。'
  if (/CHAT_SEND_AUDIOS_FORBIDDEN|CHAT_SEND_MUSIC_FORBIDDEN/i.test(normalized)) return '当前会话不允许发音频。'
  if (/CHAT_SEND_STICKERS_FORBIDDEN/i.test(normalized)) return '当前会话不允许发表情贴纸。'
  if (/CHAT_SEND_ROUNDVIDEOS_FORBIDDEN/i.test(normalized)) return '当前会话不允许发圆视频。'
  if (/CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED/i.test(normalized)) return '当前账号没有发送权限，或者被限制了。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(normalized)) return '私信文案太长了，缩短一点再试。'
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(normalized)) return '图片有问题，Telegram 不认这张图。'
  if (/SOURCE_MESSAGE_LINK_INVALID/i.test(normalized)) return '频道消息链接不对，请检查链接。'
  if (/CHAT_FORWARDS_RESTRICTED/i.test(normalized)) return '这个频道消息禁止转发。'
  if (/POSTBOT_RESULT_EMPTY/i.test(normalized)) return 'postbot 没返回可发送的图文结果，请检查代码是不是完整可用。'
  if (/FLOOD_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/FLOOD_WAIT_(\d+)/i)
    return matched ? `当前账号被限流了，请 ${matched[1]} 秒后再试。` : '当前账号被限流了，请稍后再试。'
  }
  return `发送失败：${normalized}`
}

function readRequiredWaitSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const waitMatched = message.match(/A wait of (\d+) seconds is required/i)
  if (waitMatched?.[1]) {
    const seconds = Number(waitMatched[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }
  const floodMatched = message.match(/FLOOD_WAIT_(\d+)/i)
  if (!floodMatched?.[1]) return null
  const seconds = Number(floodMatched[1])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function readRiskPauseSeconds(error: unknown) {
  const explicitWait = readRequiredWaitSeconds(error)
  if (explicitWait) return explicitWait

  const message = error instanceof Error ? error.message : String(error)
  if (/PEER_FLOOD/i.test(message)) {
    return 15 * 60
  }

  return null
}

function isUnavailableAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN|ACCOUNT_RESTRICTED|FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(message)
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function stopReasonForAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(message)) return '冻结'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) return '封禁'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) return '失效'
  if (/ACCOUNT_RESTRICTED/i.test(message)) return '限制'
  return '异常'
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

function resolveCollectorSource(input: string) {
  const raw = input.trim()
  if (!raw) return ''
  const target = parseDirectTarget(raw)
  if (target?.kind === 'username') {
    return target.value
  }
  return raw
}

function normalizeCollectorDisplayName(user: { id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null }) {
  const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : ''
  const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof user.username === 'string' && user.username.trim()) return `@${user.username.replace(/^@+/, '').trim()}`
  if (typeof user.phone === 'string' && user.phone.trim()) return user.phone.startsWith('+') ? user.phone : `+${user.phone}`
  return `用户#${String(user.id ?? '').trim() || '未知'}`
}

function readCollectorHasAvatar(user: Record<string, unknown>) {
  return Boolean(user.photo ?? user.profilePhoto ?? user.hasProfilePic)
}

function readCollectorIsPremium(user: Record<string, unknown>) {
  return Boolean(user.premium ?? user.isPremium)
}

function readCollectorRole(participant: any): GroupCollectorRole | null {
  const className = String(participant?.className || participant?.constructor?.name || '')
  if (/Creator/i.test(className)) return 'owner'
  if (/Admin/i.test(className)) return 'admin'
  return null
}

function stringifyEntityId(value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const text = (value as { toString: () => string }).toString()
    return text && text !== '[object Object]' ? text : ''
  }
  return ''
}

function readParticipantUserId(participant: any) {
  return stringifyEntityId(participant?.userId ?? participant?.user_id ?? participant?.peer?.userId ?? participant?.peer?.user_id)
}

function readCollectorLastSeen(user: Record<string, unknown>): { bucket: GroupCollectorLastSeenBucket; label: string } {
  const status = user.status as Record<string, unknown> | null | undefined
  const className = String(status?.className || (status as any)?.constructor?.name || '')

  if (/UserStatusOnline/i.test(className)) return { bucket: 'online', label: '在线' }
  if (/UserStatusRecently/i.test(className)) return { bucket: 'recent', label: '最近在线' }
  if (/UserStatusLastWeek/i.test(className)) return { bucket: 'week', label: '近一周' }
  if (/UserStatusLastMonth/i.test(className)) return { bucket: 'month', label: '近一月' }
  if (/UserStatusOffline/i.test(className)) return { bucket: 'offline', label: '离线' }
  return { bucket: 'unknown', label: '未知' }
}

function shouldKeepCollectorUser(item: GroupCollectorUserPayload, filters: GroupCollectorFilterPayload) {
  if (filters.roleFilters.length > 0 && !filters.roleFilters.includes(item.role)) {
    return false
  }

  if (filters.onlyBots && !item.isBot) {
    return false
  }

  if (filters.avatarFilters.length === 1) {
    if (filters.avatarFilters[0] === 'has' && !item.hasAvatar) return false
    if (filters.avatarFilters[0] === 'none' && item.hasAvatar) return false
  }

  if (filters.usernameFilters.length === 1) {
    if (filters.usernameFilters[0] === 'has' && !item.hasUsername) return false
    if (filters.usernameFilters[0] === 'none' && item.hasUsername) return false
  }

  if (filters.premiumFilters.length === 1) {
    if (filters.premiumFilters[0] === 'premium' && !item.isPremium) return false
    if (filters.premiumFilters[0] === 'normal' && item.isPremium) return false
  }

  if (filters.lastSeenFilters.length > 0 && !filters.lastSeenFilters.includes(item.lastSeenBucket)) {
    return false
  }

  return true
}

async function loadAdminRoleMap(client: TelegramClient, entity: unknown) {
  const roleMap = new Map<string, GroupCollectorRole>()

  try {
    const result = await client.invoke(new Api.channels.GetParticipants({
      channel: entity as never,
      filter: new Api.ChannelParticipantsAdmins(),
      offset: 0,
      limit: 200,
      hash: bigInt.zero
    }))

    const participants = Array.isArray((result as { participants?: unknown[] }).participants)
      ? (result as { participants: unknown[] }).participants
      : []

    for (const participant of participants) {
      const userId = readParticipantUserId(participant)
      const role = readCollectorRole(participant)
      if (!userId || !role) continue
      roleMap.set(userId, role)
    }
  } catch {
    // ignore; basic groups / unavailable admin list fall back to member role
  }

  return roleMap
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

function createRandomId() {
  const seed = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  return bigInt(seed)
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

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  return `账号#${account.id}`
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

interface ActiveSendTask {
  cancelled: boolean
  clients: Map<number, TelegramClient>
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
  private activeSendTask: ActiveSendTask | null = null

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  setAutoReplyEventSink(sink?: (payload: DirectMessageAutoReplyEvent) => void) {
    this.autoReplyEventSink = sink
  }

  async stopCurrentSend(): Promise<DirectMessageStopResult> {
    if (!this.activeSendTask) {
      return {
        stopped: false,
        message: '当前没有正在发送的私信任务。'
      }
    }

    this.activeSendTask.cancelled = true
    await Promise.all(Array.from(this.activeSendTask.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    this.activeSendTask.clients.clear()

    return {
      stopped: true,
      message: '已停止当前私信任务。'
    }
  }

  async sendMessages(payload: DirectMessageSendPayload, onProgress?: (payload: DirectMessageSendProgress) => void): Promise<DirectMessageSendResult> {
    const accountIds = Array.from(new Set(payload.items.map((item) => item.accountId).filter((item): item is number => typeof item === 'number')))
    const accounts = this.accountRepository.getByIds(accountIds)
    const accountsById = new Map(accounts.map((item) => [item.id, item]))
    const clients = new Map<number, TelegramClient>()
    const results: DirectMessageSendResultItem[] = []
    const unavailableAccountIds = new Set<number>()
    const accountCooldownUntil = new Map<number, number>()
    const activeAccountIds = new Set<number>()
    const startedAt = Date.now()
    const pendingItems = [...payload.items]
      .sort((left, right) => left.waitSeconds - right.waitSeconds)
      .map((item) => ({ item, dueAt: startedAt + item.waitSeconds * 1000 }))
    const task: ActiveSendTask = { cancelled: false, clients }
    const concurrency = Math.max(1, Math.min(payload.concurrency ?? 1, Math.max(1, accountIds.length || 1), Math.max(1, pendingItems.length || 1)))
    let stopReason = ''
    this.activeSendTask = task

    const pickNextEntry = () => {
      const now = Date.now()
      let readyIndex = -1
      let readyDueAt = Number.POSITIVE_INFINITY
      let nextFutureDueAt = Number.POSITIVE_INFINITY

      for (let index = 0; index < pendingItems.length; index += 1) {
        const entry = pendingItems[index]
        const accountId = typeof entry.item.accountId === 'number' ? entry.item.accountId : null
        if (accountId != null && activeAccountIds.has(accountId)) continue
        const cooldownUntil = accountId != null ? (accountCooldownUntil.get(accountId) ?? 0) : 0
        const effectiveDueAt = Math.max(entry.dueAt, cooldownUntil)
        if (effectiveDueAt <= now && effectiveDueAt < readyDueAt) {
          readyIndex = index
          readyDueAt = effectiveDueAt
        } else if (effectiveDueAt < nextFutureDueAt) {
          nextFutureDueAt = effectiveDueAt
        }
      }

      if (readyIndex >= 0) {
        const [entry] = pendingItems.splice(readyIndex, 1)
        return { entry, waitMs: 0 }
      }

      if (nextFutureDueAt < Number.POSITIVE_INFINITY) {
        return { entry: null as null, waitMs: Math.max(0, nextFutureDueAt - now) }
      }

      return { entry: null as null, waitMs: pendingItems.length > 0 ? 150 : 0 }
    }

    const processEntry = async (item: DirectMessageSendPayload['items'][number]) => {
      const account = typeof item.accountId === 'number' ? accountsById.get(item.accountId) : null
      if (typeof item.accountId === 'number' && unavailableAccountIds.has(item.accountId)) {
        if (unavailableAccountIds.size >= accountIds.length) {
          stopReason = '无可用账号发送，本次任务已停止。'
          this.emitSendNotice(results, payload.items.length, stopReason, onProgress, null)
          task.cancelled = true
          return
        }
        const resultItem = this.createFailedSendItem(item, '这个账号已经不可用了，当前目标已跳过。')
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        return
      }
      if (!account) {
        const resultItem = this.createFailedSendItem(item, '发送账号不存在，请重新选择账号后再试。')
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        return
      }

      if (payload.messageType === 'text' && !payload.messageText.trim()) {
        const resultItem = this.createFailedSendItem(item, '文本内容还没填。')
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        return
      }
      if ((payload.messageType === 'channel_forward' || payload.messageType === 'hidden_channel_forward') && !payload.sourceLink.trim()) {
        const resultItem = this.createFailedSendItem(item, '频道消息链接还没填。')
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        return
      }
      if (payload.messageType === 'postbot_code' && !payload.postbotCode.trim()) {
        const resultItem = this.createFailedSendItem(item, 'postbot 代码还没填。')
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        return
      }

      let cleanup: undefined | (() => Promise<void>)
      let requeueItem = false
      const accountId = typeof item.accountId === 'number' ? item.accountId : null
      if (accountId != null) activeAccountIds.add(accountId)

      try {
        if (task.cancelled) return
        let client = clients.get(account.id)
        if (!client) {
          client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
          clients.set(account.id, client)
        }

        let resultItem: DirectMessageSendResultItem | null = null

        while (!task.cancelled) {
          try {
            const resolved = await resolveSendEntity(client, item.targetValue)
            cleanup = resolved.cleanup
            let response: unknown = null

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
              const query = payload.postbotCode.trim()
              const inlineBot = await client.getEntity('@postbot' as never)
              const inlineResults = await client.invoke(new Api.messages.GetInlineBotResults({
                bot: inlineBot as never,
                peer: resolved.entity as never,
                query,
                offset: ''
              }))

              const firstResult = Array.isArray((inlineResults as { results?: unknown[] }).results)
                ? (inlineResults as { results: Array<{ id?: string }> }).results[0]
                : null

              if (!firstResult?.id) {
                throw new Error('POSTBOT_RESULT_EMPTY')
              }

              response = await client.invoke(new Api.messages.SendInlineBotResult({
                peer: resolved.entity as never,
                queryId: (inlineResults as { queryId: any }).queryId,
                id: firstResult.id,
                randomId: createRandomId(),
                clearDraft: true
              }))
            } else {
              const media = payload.imageUrl.trim() ? resolveMediaFile(payload.imageUrl, payload.messageText || item.targetValue) : undefined
              response = await (client as TelegramClient & {
                sendMessage: (entity: unknown, options: Record<string, unknown>) => Promise<{ id?: number }>
              }).sendMessage(resolved.entity as never, {
                message: payload.messageText.trim() || undefined,
                file: media
              })
            }

            resultItem = {
              previewItemId: item.id,
              targetId: item.targetId,
              targetValue: item.targetValue,
              status: 'sent',
              errorMessage: '',
              remoteMessageId: Array.isArray(response)
                ? (typeof (response[0] as { id?: unknown } | undefined)?.id === 'number' ? (response[0] as { id: number }).id : null)
                : (typeof (response as { id?: unknown } | null)?.id === 'number' ? (response as { id: number }).id : extractResponseMessageId(response)),
              sentAt: new Date().toISOString(),
              accountId: item.accountId
            }
            break
          } catch (error) {
            await cleanup?.()
            cleanup = undefined
            const waitSeconds = readRiskPauseSeconds(error)
            if (!waitSeconds || task.cancelled) {
              throw error
            }

            const cooldownUntil = Date.now() + waitSeconds * 1000
            if (typeof item.accountId === 'number') {
              accountCooldownUntil.set(item.accountId, cooldownUntil)
            }

            this.emitSendNotice(
              results,
              payload.items.length,
              `[${account.phone || readAccountLabel(account)}] 这个账号触发私信风控，先暂停 ${waitSeconds} 秒，其他账号继续发送，到时间后自动恢复。`,
              onProgress,
              waitSeconds
            )

            pendingItems.push({ item, dueAt: cooldownUntil })
            requeueItem = true
            break
          }
        }

        if (task.cancelled || requeueItem) return
        if (!resultItem) return

        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
      } catch (error) {
        const resultItem = this.createFailedSendItem(item, formatDirectMessageError(error))
        results.push(resultItem)
        this.emitSendProgress(results, payload.items.length, resultItem, onProgress)
        if (typeof item.accountId === 'number' && isUnavailableAccountError(error)) {
          unavailableAccountIds.add(item.accountId)
          accountCooldownUntil.delete(item.accountId)
          const skippedCount = pendingItems.reduce((count, entry) => count + (entry.item.accountId === item.accountId ? 1 : 0), 0)
          for (let index = pendingItems.length - 1; index >= 0; index -= 1) {
            if (pendingItems[index]?.item.accountId === item.accountId) {
              pendingItems.splice(index, 1)
            }
          }
          const currentClient = clients.get(item.accountId)
          if (currentClient) {
            await this.clientManager.destroyClient(currentClient).catch(() => undefined)
            clients.delete(item.accountId)
          }

          const reason = stopReasonForAccountError(error)
          this.emitSendNotice(
            results,
            payload.items.length,
            skippedCount > 0
              ? `[${account.phone || readAccountLabel(account)}] 这个账号已判定为${reason}，已停止继续私信，后面剩余 ${skippedCount} 个目标不再发送。`
              : `[${account.phone || readAccountLabel(account)}] 这个账号已判定为${reason}，已停止继续私信。`,
            onProgress,
            null
          )

          if (unavailableAccountIds.size >= accountIds.length) {
            stopReason = '无可用账号发送，本次任务已停止。'
            this.emitSendNotice(results, payload.items.length, stopReason, onProgress, null)
            task.cancelled = true
          }
        }
      } finally {
        if (accountId != null) activeAccountIds.delete(accountId)
        await cleanup?.()
      }
    }

    const worker = async () => {
      while (!task.cancelled) {
        if (pendingItems.length === 0) return
        const { entry, waitMs } = pickNextEntry()
        if (!entry) {
          if (waitMs > 0) {
            await this.sleepWithCancel(waitMs, task)
          }
          continue
        }
        await processEntry(entry.item)
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
    } finally {
      await Promise.all(Array.from(clients.values()).map((client) => this.clientManager.destroyClient(client)))
      if (this.activeSendTask === task) {
        this.activeSendTask = null
      }
    }

    const successCount = results.filter((item) => item.status === 'sent').length
    const failedCount = results.filter((item) => item.status === 'failed').length
    const remainingCount = Math.max(0, payload.items.length - results.length)
    return {
      total: results.length,
      successCount,
      failedCount,
      items: results,
      message: task.cancelled
        ? `${stopReason || '任务已停止。'} 成功 ${successCount} 条，失败 ${failedCount} 条，剩余 ${remainingCount} 条未继续发送。`
        : failedCount === 0
          ? `已成功发出 ${successCount} 条私信。`
          : `发送完成：成功 ${successCount} 条，失败 ${failedCount} 条。`
    }
  }

  async collectUsers(payload: DirectMessageCollectPayload): Promise<DirectMessageCollectResult> {
    const account = this.accountRepository.getByIds([payload.accountId])[0]
    if (!account) throw new Error('账号不存在')

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)

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

  async collectGroupUsers(payload: GroupCollectorPayload): Promise<GroupCollectorResult> {
    const account = this.accountRepository.getByIds([payload.accountId])[0]
    if (!account) throw new Error('账号不存在')

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)

    try {
      const sourceRef = resolveCollectorSource(payload.source)
      if (!sourceRef) {
        throw new Error('请先填写群链接或群用户名')
      }

      const entity = await client.getEntity(sourceRef as never)
      const adminRoleMap = await loadAdminRoleMap(client, entity)
      let rawUsers: Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null; bot?: boolean | null; photo?: unknown; premium?: boolean | null; status?: unknown }> = []

      if (payload.mode === 'public_members') {
        const participantLimit = Number.isFinite(payload.participantLimit) ? Number(payload.participantLimit) : 0
        const params: Record<string, unknown> = {}
        if (participantLimit > 0) {
          params.limit = Math.max(1, Math.min(participantLimit, 5000))
        }
        rawUsers = await (client as TelegramClient & {
          getParticipants: (entity: unknown, params: Record<string, unknown>) => Promise<Array<{ id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null; bot?: boolean | null; photo?: unknown; premium?: boolean | null; status?: unknown }>>
        }).getParticipants(entity as never, params)
      } else {
        const historyLimit = Number.isFinite(payload.historyLimit) ? Number(payload.historyLimit) : 1000
        const messages = await (client as TelegramClient & {
          getMessages: (entity: unknown, params: Record<string, unknown>) => Promise<Array<any>>
        }).getMessages(entity as never, { limit: Math.max(1, Math.min(historyLimit, 5000)) })

        const users = new Map<string, { id?: unknown; username?: string | null; phone?: string | null; firstName?: string | null; lastName?: string | null; bot?: boolean | null; photo?: unknown; premium?: boolean | null; status?: unknown }>()
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
          const userId = stringifyEntityId((sender as { id?: unknown }).id)
          if (!userId || users.has(userId)) continue
          users.set(userId, sender as any)
        }
        rawUsers = Array.from(users.values())
      }

      const seen = new Set<string>()
      const items: GroupCollectorUserPayload[] = []
      let skipped = 0

      for (const rawUser of rawUsers) {
        const userId = stringifyEntityId(rawUser.id)
        if (!userId || seen.has(userId)) {
          skipped += 1
          continue
        }
        seen.add(userId)

        const lastSeen = readCollectorLastSeen(rawUser as Record<string, unknown>)
        const item: GroupCollectorUserPayload = {
          userId,
          displayName: normalizeCollectorDisplayName(rawUser),
          username: typeof rawUser.username === 'string' ? rawUser.username : '',
          phone: typeof rawUser.phone === 'string' ? rawUser.phone : '',
          targetValue: normalizeCollectedValue(rawUser),
          sourceLabel: payload.mode === 'public_members' ? '公开群成员' : '历史发言用户',
          role: adminRoleMap.get(userId) || 'member',
          isBot: Boolean((rawUser as { bot?: boolean | null }).bot),
          hasAvatar: readCollectorHasAvatar(rawUser as Record<string, unknown>),
          hasUsername: Boolean(typeof rawUser.username === 'string' && rawUser.username.trim()),
          isPremium: readCollectorIsPremium(rawUser as Record<string, unknown>),
          lastSeenBucket: lastSeen.bucket,
          lastSeenLabel: lastSeen.label
        }

        if (!shouldKeepCollectorUser(item, payload.filters)) {
          skipped += 1
          continue
        }

        items.push(item)
      }

      return {
        total: rawUsers.length,
        matched: items.length,
        filtered: skipped,
        items,
        message: items.length > 0
          ? `采集完成，命中 ${items.length} 个用户。`
          : '这次没有命中符合条件的用户。'
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
        const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
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

  private emitSendNotice(results: DirectMessageSendResultItem[], total: number, message: string, onProgress?: (payload: DirectMessageSendProgress) => void, waitSeconds?: number | null) {
    if (!onProgress) return
    const successCount = results.filter((entry) => entry.status === 'sent').length
    const failedCount = results.filter((entry) => entry.status === 'failed').length
    onProgress({
      total,
      completed: results.length,
      successCount,
      failedCount,
      item: null,
      message,
      waitSeconds: waitSeconds ?? null
    })
  }

  private emitAutoReplyEvent(payload: DirectMessageAutoReplyEvent) {
    this.autoReplyEventSink?.(payload)
  }

  private async sleepWithCancel(ms: number, task: ActiveSendTask) {
    let remaining = ms
    while (remaining > 0 && !task.cancelled) {
      const step = Math.min(remaining, 200)
      await sleep(step)
      remaining -= step
    }
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
