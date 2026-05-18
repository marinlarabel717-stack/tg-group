import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import { TelethonSniperService } from './telethon-sniper-service'
import type {
  OtherToolsUsernameFilterItem,
  OtherToolsUsernameFilterPayload,
  OtherToolsUsernameFilterResult,
  OtherToolsSniperCandidateItem,
  OtherToolsSniperListenerLogEntry,
  OtherToolsSniperListenerPayload,
  OtherToolsSniperListenerState,
  OtherToolsSniperListenerStopResult,
  OtherToolsSniperPayload,
  OtherToolsSniperResult,
  OtherToolsSourceSubscribeItem
} from '../../src/types'

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

function readCurrentProxyOrThrow(proxyPoolService: ProxyPoolService) {
  const proxy = proxyPoolService.isEnabled() ? proxyPoolService.getAccountCheckProxy() : null
  if (proxyPoolService.isEnabled() && !proxy) {
    throw new Error('GLOBAL_PROXY_REQUIRED')
  }
  return proxy
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

  try {
    await client.connect()
    const authorized = await client.isUserAuthorized()
    if (!authorized) {
      throw new Error('AUTH_KEY_UNREGISTERED')
    }
    return client
  } catch (error) {
    await clientManager.destroyClient(client).catch(() => undefined)
    throw error
  }
}

function splitInput(input: string) {
  return input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function createSniperLogEntry(entry: Omit<OtherToolsSniperListenerLogEntry, 'id' | 'createdAt'>): OtherToolsSniperListenerLogEntry {
  return {
    id: createId('sniper-log'),
    createdAt: new Date().toISOString(),
    ...entry
  }
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function slugifyFileName(input: string) {
  const value = input.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '')
  return value || 'sniper_post'
}

function inferImageExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'bin'
}

function resolveMediaFile(imageData: string, title: string) {
  const value = imageData.trim()
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

function readEntityType(entity: unknown): OtherToolsUsernameFilterItem['entityType'] {
  const className = typeof (entity as { className?: unknown })?.className === 'string'
    ? String((entity as { className?: string }).className)
    : ''

  if (className === 'User') {
    const isBot = Boolean((entity as { bot?: unknown })?.bot)
    return isBot ? 'bot' : 'user'
  }
  if (className === 'Channel') {
    const isBroadcast = Boolean((entity as { broadcast?: unknown })?.broadcast)
    return isBroadcast ? 'channel' : 'group'
  }
  if (className === 'Chat') {
    return 'group'
  }
  return 'unknown'
}

function readEntityLabel(entityType: OtherToolsUsernameFilterItem['entityType']) {
  if (entityType === 'user') return '用户'
  if (entityType === 'bot') return '机器人'
  if (entityType === 'group') return '群组'
  if (entityType === 'channel') return '频道'
  return '目标'
}

type NormalizedCandidate = {
  raw: string
  normalized: string
  kind: 'username' | 'link'
  candidate: string | null
  invalidReason?: string
  cleanedFromRaw?: boolean
}

type UsernameResolution = {
  category: OtherToolsUsernameFilterItem['category']
  reason: string
  entityType: OtherToolsUsernameFilterItem['entityType']
}

type ResolvedPeer = {
  ref: string
  title: string
  kind: 'channel' | 'group' | 'bot' | 'user' | 'unknown'
  entity: unknown
}

type ExpandedSource = {
  ref: string
  title: string
  kind: ResolvedPeer['kind']
  entity: unknown
}

type PoolCarrier = {
  ref: string
  title: string
  kind: 'channel' | 'group'
  entity: unknown
  input: unknown
  currentUsername: string
}

type SourceExpandResult = {
  sources: ExpandedSource[]
  chatlistJoinCount: number
}

type ListenerClaimResult = {
  claimTargetTitle: string
  claimTargetRef: string
  claimMessage: string
  createdCarrier: boolean
  postSent?: boolean
  postFailureMessage?: string
}

interface ResolvedSniperAccountClient {
  account: AccountRecord
  client: TelegramClient
}

interface ActiveSniperListenerTask {
  id: string
  cancelled: boolean
  tickCount: number
  state: OtherToolsSniperListenerState
  scanClient: TelegramClient | null
  claimClient: TelegramClient | null
  createCarrierClient: TelegramClient | null
  subscribeClients: Map<number, TelegramClient>
  seenMessageKeys: Set<string>
  handledCandidateKeys: Set<string>
}

function normalizeCandidate(raw: string): NormalizedCandidate {
  const value = raw.trim()
  if (!value) {
    return {
      raw,
      normalized: '',
      kind: 'username',
      candidate: null,
      invalidReason: '空内容已跳过'
    }
  }

  const linkMatched = value.match(/^(?:https?:\/\/)?t\.me\/([^/?#]+)(?:[/?#].*)?$/i)
  if (linkMatched?.[1]) {
    const pathValue = linkMatched[1].trim()
    if (!pathValue || pathValue === '+' || /^joinchat$/i.test(pathValue) || /^c$/i.test(pathValue)) {
      return {
        raw,
        normalized: value,
        kind: 'link',
        candidate: null,
        invalidReason: '这不是公开用户名链接，当前只能筛公开 @username / t.me/username'
      }
    }

    const candidate = pathValue.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]+/g, '')
    if (!candidate) {
      return {
        raw,
        normalized: value,
        kind: 'link',
        candidate: null,
        invalidReason: '链接里没有可用的公开用户名'
      }
    }

    return {
      raw,
      normalized: `https://t.me/${candidate}`,
      kind: 'link',
      candidate,
      cleanedFromRaw: candidate !== pathValue.toLowerCase().replace(/^@+/, '')
    }
  }

  const directCandidate = value.replace(/^@+/, '')
  const candidate = directCandidate.toLowerCase().replace(/[^a-z0-9_]+/g, '')
  if (!candidate) {
    return {
      raw,
      normalized: value,
      kind: 'username',
      candidate: null,
      invalidReason: '这里不是可识别的用户名'
    }
  }

  return {
    raw,
    normalized: `@${candidate}`,
    kind: 'username',
    candidate,
    cleanedFromRaw: candidate !== directCandidate.toLowerCase()
  }
}

function buildForbiddenItem(item: NormalizedCandidate, reason: string): OtherToolsUsernameFilterItem {
  return {
    raw: item.raw,
    normalized: item.normalized,
    category: 'forbidden',
    kind: item.kind,
    reason,
    entityType: 'unknown'
  }
}

function isExplicitlyForbiddenError(message: string) {
  return /USERNAME_INVALID|USERNAMES_UNAVAILABLE|USERNAME_PURCHASE_AVAILABLE|USERNAME_NOT_MODIFIED/i.test(message)
}

function isNotOccupiedError(message: string) {
  return /USERNAME_NOT_OCCUPIED|No user has/i.test(message)
}

function isResolvableOccupiedError(message: string) {
  return /USERNAME_OCCUPIED/i.test(message)
}

function isCandidatePatternAcceptable(candidate: string) {
  return /^[a-z][a-z0-9_]{4,31}$/i.test(candidate)
}

function readUsernameFromEntity(entity: unknown) {
  const direct = (entity as { username?: unknown })?.username
  if (typeof direct === 'string' && direct.trim()) return direct.trim().replace(/^@+/, '')
  const usernames = (entity as { usernames?: Array<{ username?: unknown; active?: unknown }> })?.usernames
  if (Array.isArray(usernames)) {
    const active = usernames.find((item) => item && item.active === true && typeof item.username === 'string' && item.username.trim())
    if (typeof active?.username === 'string') return active.username.trim().replace(/^@+/, '')
    const fallback = usernames.find((item) => item && typeof item.username === 'string' && item.username.trim())
    if (typeof fallback?.username === 'string') return fallback.username.trim().replace(/^@+/, '')
  }
  return ''
}

function readTitleFromEntity(entity: unknown) {
  const title = (entity as { title?: unknown })?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  const firstName = typeof (entity as { firstName?: unknown })?.firstName === 'string' ? String((entity as { firstName?: string }).firstName).trim() : ''
  const lastName = typeof (entity as { lastName?: unknown })?.lastName === 'string' ? String((entity as { lastName?: string }).lastName).trim() : ''
  const fullName = `${firstName} ${lastName}`.trim()
  if (fullName) return fullName
  const username = readUsernameFromEntity(entity)
  if (username) return `@${username}`
  return '未命名来源'
}

function readPeerKind(entity: unknown): ResolvedPeer['kind'] {
  const type = readEntityType(entity)
  if (type === 'bot') return 'bot'
  if (type === 'user') return 'user'
  if (type === 'group') return 'group'
  if (type === 'channel') return 'channel'
  return 'unknown'
}

function buildPeerRef(entity: unknown, fallback: string) {
  const username = readUsernameFromEntity(entity)
  if (username) return `https://t.me/${username}`
  return fallback.trim() || readTitleFromEntity(entity)
}

function normalizeKeywordSet(input: string) {
  return splitInput(input).map((item) => item.toLowerCase())
}

function extractChatlistSlug(ref: string) {
  const trimmed = ref.trim()
  if (!trimmed) return ''
  const matched = trimmed.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/addlist\/([A-Za-z0-9_-]+)/i)
  if (matched?.[1]) return matched[1].trim()
  return ''
}

function readEntityPeerKey(entity: unknown) {
  const className = typeof (entity as { className?: unknown })?.className === 'string' ? String((entity as { className?: string }).className) : ''
  const rawId = (entity as { id?: unknown })?.id
  const id = typeof rawId === 'bigint' || typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : ''
  if (!id) return ''
  if (className === 'Channel') return `channel:${id}`
  if (className === 'Chat') return `chat:${id}`
  if (className === 'User') return `user:${id}`
  return ''
}

function readPeerKey(peer: unknown) {
  const className = typeof (peer as { className?: unknown })?.className === 'string' ? String((peer as { className?: string }).className) : ''
  if (className === 'PeerChannel') {
    const value = (peer as { channelId?: unknown }).channelId
    if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') return `channel:${String(value)}`
  }
  if (className === 'PeerChat') {
    const value = (peer as { chatId?: unknown }).chatId
    if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') return `chat:${String(value)}`
  }
  if (className === 'PeerUser') {
    const value = (peer as { userId?: unknown }).userId
    if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') return `user:${String(value)}`
  }
  return ''
}

function buildExpandedSource(entity: unknown, fallbackRef: string): ExpandedSource {
  return {
    ref: buildPeerRef(entity, fallbackRef),
    title: readTitleFromEntity(entity),
    kind: readPeerKind(entity),
    entity
  }
}

async function expandSourceRefsWithChatlists(client: TelegramClient, refs: string[], options?: { joinChatlists?: boolean }): Promise<SourceExpandResult> {
  const expandedSources: ExpandedSource[] = []
  const seen = new Set<string>()
  let chatlistJoinCount = 0
  const joinChatlists = options?.joinChatlists !== false

  for (const ref of refs) {
    const slug = extractChatlistSlug(ref)
    if (!slug) {
      const resolved = await resolvePeer(client, ref)
      const key = `${resolved.kind}:${resolved.ref}`
      if (!seen.has(key)) {
        seen.add(key)
        expandedSources.push({ ref: resolved.ref, title: resolved.title, kind: resolved.kind, entity: resolved.entity })
      }
      continue
    }

    const invite = await client.invoke(new Api.chatlists.CheckChatlistInvite({ slug }))
    const inviteChats = Array.isArray((invite as { chats?: unknown[] })?.chats)
      ? ((invite as { chats?: unknown[] }).chats ?? []).filter((entity) => ['channel', 'group'].includes(readPeerKind(entity)))
      : []

    const missingPeerKeys = new Set(
      Array.isArray((invite as { missingPeers?: unknown[] })?.missingPeers)
        ? ((invite as { missingPeers?: unknown[] }).missingPeers ?? []).map(readPeerKey).filter(Boolean)
        : []
    )

    const peersToJoin = inviteChats.filter((entity) => missingPeerKeys.size === 0 || missingPeerKeys.has(readEntityPeerKey(entity)))

    if (joinChatlists && peersToJoin.length > 0) {
      await client.invoke(new Api.chatlists.JoinChatlistInvite({
        slug,
        peers: peersToJoin as never
      }))
      chatlistJoinCount += peersToJoin.length
    }

    for (const entity of inviteChats) {
      const source = buildExpandedSource(entity, `https://t.me/addlist/${slug}`)
      const key = `${source.kind}:${source.ref}`
      if (seen.has(key)) continue
      seen.add(key)
      expandedSources.push(source)
    }
  }

  return {
    sources: expandedSources,
    chatlistJoinCount
  }
}

function readMessageText(message: unknown) {
  const direct = (message as { message?: unknown })?.message
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const text = (message as { text?: unknown })?.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  return ''
}

function readMessageId(message: unknown) {
  const value = (message as { id?: unknown })?.id
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return String(value)
  return ''
}

function readMessageDate(message: unknown) {
  const value = (message as { date?: unknown })?.date
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) return value.trim()
  return new Date().toISOString()
}

function readReplyMarkupUrls(message: unknown) {
  const urls: string[] = []
  const rows = (message as { replyMarkup?: { rows?: Array<{ buttons?: Array<{ url?: unknown }> }> } })?.replyMarkup?.rows
  if (!Array.isArray(rows)) return urls
  for (const row of rows) {
    if (!Array.isArray(row?.buttons)) continue
    for (const button of row.buttons) {
      if (typeof button?.url === 'string' && button.url.trim()) {
        urls.push(button.url.trim())
      }
    }
  }
  return urls
}

function readEntityUrls(message: unknown) {
  const urls: string[] = []
  const entities = (message as { entities?: Array<{ url?: unknown }> })?.entities
  if (!Array.isArray(entities)) return urls
  for (const entity of entities) {
    if (typeof entity?.url === 'string' && entity.url.trim()) {
      urls.push(entity.url.trim())
    }
  }
  return urls
}

function extractCandidatesFromText(input: string) {
  const matches: string[] = []
  const patterns = [/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\b/gi, /@([A-Za-z0-9_]{5,32})\b/g]
  for (const pattern of patterns) {
    let matched: RegExpExecArray | null = null
    while ((matched = pattern.exec(input)) !== null) {
      const value = matched[0]?.trim()
      if (value) matches.push(value)
    }
  }
  return matches
}

function makeExcerpt(message: string, fallback = '') {
  const source = message.trim() || fallback.trim()
  if (!source) return '（没有可展示的正文）'
  return source.length > 120 ? `${source.slice(0, 120)}…` : source
}

async function resolveUsernameState(client: TelegramClient, item: NormalizedCandidate): Promise<UsernameResolution> {
  if (!item.candidate) {
    return {
      category: 'forbidden',
      reason: item.invalidReason || '当前内容无法识别成公开用户名',
      entityType: 'unknown'
    }
  }

  if (!isCandidatePatternAcceptable(item.candidate)) {
    return {
      category: 'forbidden',
      reason: '清洗后仍不符合 Telegram 用户名规则，不能继续占位',
      entityType: 'unknown'
    }
  }

  try {
    const entity = await client.getEntity(`https://t.me/${item.candidate}` as never)
    const entityType = readEntityType(entity)
    return {
      category: 'valid',
      reason: `已查到真实${readEntityLabel(entityType)}，这个用户名当前是存在的。`,
      entityType
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (!isNotOccupiedError(message) && !isResolvableOccupiedError(message) && !isExplicitlyForbiddenError(message)) {
      return {
        category: 'forbidden',
        reason: `查询失败：${message}`,
        entityType: 'unknown'
      }
    }

    if (isResolvableOccupiedError(message)) {
      return {
        category: 'valid',
        reason: '这个用户名当前已被占用，可视为真实存在的公开用户名。',
        entityType: 'unknown'
      }
    }
  }

  try {
    const checkResult = await client.invoke(new Api.account.CheckUsername({ username: item.candidate }))
    const checkResultMeta = checkResult as unknown as { className?: string }
    const available = Boolean(checkResultMeta?.className === 'BoolTrue' || checkResult === true)

    if (available) {
      return {
        category: 'occupiable',
        reason: item.cleanedFromRaw
          ? `原值本身不可直接用，但清洗成 ${item.normalized} 后可以继续占位。`
          : '当前没有真实目标占用这个用户名，可以继续占位。',
        entityType: 'unknown'
      }
    }

    return {
      category: 'valid',
      reason: '这个用户名当前已被 Telegram 占用，不属于可占位状态。',
      entityType: 'unknown'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isExplicitlyForbiddenError(message)) {
      return {
        category: 'forbidden',
        reason: '这个用户名属于违禁、保留或不可用状态，不能继续占位。',
        entityType: 'unknown'
      }
    }
    if (isResolvableOccupiedError(message)) {
      return {
        category: 'valid',
        reason: '这个用户名当前已被占用，可视为真实存在的公开用户名。',
        entityType: 'unknown'
      }
    }
    return {
      category: 'forbidden',
      reason: `检查占位状态失败：${message}`,
      entityType: 'unknown'
    }
  }
}

function pickCheckAccount(accounts: AccountRecord[], preferredId?: number | null) {
  const available = accounts.filter((account) => !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
  if (preferredId) {
    const matched = available.find((account) => account.id === preferredId)
    if (matched) return matched
  }
  return available[0] ?? accounts[0] ?? null
}

async function resolvePeer(client: TelegramClient, ref: string): Promise<ResolvedPeer> {
  const entity = await client.getEntity(ref as never)
  return {
    ref: buildPeerRef(entity, ref),
    title: readTitleFromEntity(entity),
    kind: readPeerKind(entity),
    entity
  }
}

async function readPoolCarriers(client: TelegramClient, refs: string[]): Promise<PoolCarrier[]> {
  const carriers: PoolCarrier[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const peer = await resolvePeer(client, ref)
    if (!['channel', 'group'].includes(peer.kind)) {
      throw new Error(`池子引用 ${ref} 不是可改用户名的公开群/频道。`)
    }
    const input = await client.getInputEntity(peer.entity as never)
    const key = JSON.stringify(input)
    if (seen.has(key)) continue
    seen.add(key)
    carriers.push({
      ref: peer.ref,
      title: peer.title,
      kind: peer.kind === 'channel' ? 'channel' : 'group',
      entity: peer.entity,
      input,
      currentUsername: readUsernameFromEntity(peer.entity)
    })
  }
  return carriers
}

function matchesKeywords(text: string, includeKeywords: string[], excludeKeywords: string[]) {
  const normalized = text.toLowerCase()
  if (excludeKeywords.some((item) => item && normalized.includes(item))) return false
  if (includeKeywords.length === 0) return true
  return includeKeywords.some((item) => item && normalized.includes(item))
}

function readCheckResultTitle(account: AccountRecord | null) {
  if (!account) return ''
  return account.username || account.phone || `ID ${account.id}`
}

const MAX_PUBLIC_LINKS_PER_ACCOUNT = 10

function isFatalAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) {
    return { status: 'session_expired' as const, message: '登录失效' }
  }
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) {
    return { status: 'banned' as const, message: '账号封禁' }
  }
  if (/FROZEN|USER_DEACTIVATED|INPUT_FETCH_ERROR/i.test(message)) {
    return { status: 'frozen' as const, message: '账号冻结' }
  }
  if (/ACCOUNT_RESTRICTED/i.test(message)) {
    return { status: 'not_logged_in' as const, message: '账号受限' }
  }
  return null
}

function isPublicLinkLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /CHANNELS_ADMIN_PUBLIC_TOO_MUCH|公开群\/频道用户名槽位已经到上限/i.test(message)
}

function readSourceBlob(message: unknown) {
  const text = readMessageText(message)
  const urls = [...readReplyMarkupUrls(message), ...readEntityUrls(message)]
  return [text, ...urls].filter(Boolean).join('\n')
}

function toCandidateCategory(category: UsernameResolution['category']): OtherToolsSniperCandidateItem['category'] {
  if (category === 'valid') return 'occupied'
  if (category === 'occupiable') return 'claimable'
  return 'forbidden'
}

function readUsernameValue(normalized: string) {
  if (normalized.startsWith('https://t.me/')) return normalized.replace('https://t.me/', '').trim()
  return normalized.replace(/^@+/, '').trim()
}

function buildCandidateItem(base: {
  raw: string
  normalized: string
  kind: 'username' | 'link'
  sourceRef: string
  sourceTitle: string
  sourceExcerpt: string
  sourceMessageId: string
  sourceDate: string
} & UsernameResolution): OtherToolsSniperCandidateItem {
  return {
    id: createId('sniper-item'),
    raw: base.raw,
    normalized: base.normalized,
    kind: base.kind,
    category: toCandidateCategory(base.category),
    entityType: base.entityType,
    reason: base.reason,
    sourceRef: base.sourceRef,
    sourceTitle: base.sourceTitle,
    sourceExcerpt: base.sourceExcerpt,
    sourceMessageId: base.sourceMessageId,
    sourceDate: base.sourceDate,
    claimStatus: null,
    claimMessage: '',
    claimTargetRef: '',
    claimTargetTitle: '',
    checkedAccountId: null,
    checkedAccountLabel: ''
  }
}

async function claimCandidateWithPool(client: TelegramClient, carrier: PoolCarrier, candidate: OtherToolsSniperCandidateItem) {
  const username = readUsernameValue(candidate.normalized)
  const checkResult = await client.invoke(new Api.channels.CheckUsername({
    channel: carrier.input as never,
    username
  }))
  const checkResultMeta = checkResult as unknown as { className?: string }
  const available = Boolean(checkResultMeta?.className === 'BoolTrue' || checkResult === true)
  if (!available) {
    throw new Error('USERNAME_OCCUPIED')
  }

  await client.invoke(new Api.channels.UpdateUsername({
    channel: carrier.input as never,
    username
  }))

  return {
    claimTargetTitle: carrier.title,
    claimTargetRef: `https://t.me/${username}`,
    claimMessage: carrier.currentUsername
      ? `已把池子载体 ${carrier.title}（原 @${carrier.currentUsername}）改成 @${username}。`
      : `已把池子载体 ${carrier.title} 绑定成 @${username}。`
  }
}

function expandListenerCarrierTemplate(input: string, context: { candidate: string; accountId: number; index: number }) {
  return (input || '')
    .replace(/\{candidate\}/gi, context.candidate)
    .replace(/\{accountId\}/gi, String(context.accountId))
    .replace(/\{index\}|\{n\}/gi, String(context.index + 1))
}

function buildListenerCarrierTitle(payload: OtherToolsSniperListenerPayload, candidate: string, accountId: number, index: number) {
  const template = payload.createCarrierTitleTemplate.trim() || '监听占位_{candidate}'
  return expandListenerCarrierTemplate(template, { candidate, accountId, index }).slice(0, 128) || `监听占位_${candidate}`
}

function buildListenerCarrierAbout(payload: OtherToolsSniperListenerPayload, candidate: string, accountId: number, index: number) {
  const template = payload.createCarrierAboutTemplate.trim()
  if (!template) return `自动监听命中 ${candidate} 后创建的占位频道。`
  return expandListenerCarrierTemplate(template, { candidate, accountId, index }).slice(0, 255)
}

function extractCreatedChat(response: unknown) {
  const value = response as { chats?: unknown[] } | null
  return Array.isArray(value?.chats) ? value.chats[0] ?? null : null
}

async function rollbackCreatedEntity(client: TelegramClient, entity: unknown) {
  const input = await client.getInputEntity(entity as never)
  await client.invoke(new Api.channels.DeleteChannel({ channel: input as never }))
}

async function sendInitialPostToChannel(client: TelegramClient, entity: unknown, payload: OtherToolsSniperListenerPayload, title: string) {
  if (payload.postType === 'none') return
  const message = payload.postText.trim() || undefined
  const file = payload.postType === 'photo' ? resolveMediaFile(payload.postImageData, title) : undefined
  await (((client as TelegramClient) as TelegramClient & {
    sendMessage: (peer: unknown, options: Record<string, unknown>) => Promise<unknown>
  }).sendMessage(entity as never, {
    message,
    file
  }))
}

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

  return null
}

function formatWaitDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '稍后'
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  if (remainSeconds <= 0) return `${minutes} 分钟`
  return `${minutes} 分 ${remainSeconds} 秒`
}

function formatSniperRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const waitSeconds = readRequiredWaitSeconds(error)
  if (waitSeconds) {
    const waitText = formatWaitDuration(waitSeconds)
    if (/UpdateUsernameRequest/i.test(message)) return `这个账号改公开用户名太频繁，被 Telegram 限流了，请 ${waitText} 后再试。`
    return `这个账号被 Telegram 限流了，请 ${waitText} 后再试。`
  }
  if (/AUTH_KEY_DUPLICATED/i.test(message)) return '这个账号掉线了：同一个登录在别处占用了连接，当前这里不能继续用。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) return '这个账号登录已经失效了，需要重新登录。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) return '这个账号已经被封了，不能继续用。'
  if (/FROZEN|USER_DEACTIVATED|INPUT_FETCH_ERROR/i.test(message)) return '这个账号已经冻结了，不能继续用。'
  if (/ACCOUNT_RESTRICTED/i.test(message)) return '这个账号现在受限，暂时不能继续操作。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(message)) return '你开了全局代理，但现在没有可用代理。'
  if (/TELETHON_SNIPER_SERVICE_UNAVAILABLE/i.test(message)) return '监听核心没准备好，当前这台机器上的监听组件不可用。'
  if (/TIMEOUT/i.test(message)) return '这次操作超时了，Telegram 那边太久没回。'
  if (/InvokeWithLayer/i.test(message) && /AUTH_KEY_DUPLICATED/i.test(message)) return '这个账号会话冲突了：同一个号在别处占用连接，当前监听没法启动。'
  return message
}

function formatSniperPostError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(message)) return '图片格式不对，Telegram 没收下。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(message)) return '文案太长了，发不出去。'
  if (/CHAT_SEND_MEDIA_FORBIDDEN/i.test(message)) return '这个频道当前不允许发媒体。'
  if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED/i.test(message)) return '这个频道当前没有发帖权限。'
  return `首帖发送失败：${formatSniperRuntimeError(error)}`
}

async function createCarrierAndClaim(
  client: TelegramClient,
  candidate: OtherToolsSniperCandidateItem,
  payload: OtherToolsSniperListenerPayload,
  accountId: number,
  createdIndex: number
): Promise<ListenerClaimResult> {
  const username = readUsernameValue(candidate.normalized)
  const title = buildListenerCarrierTitle(payload, username, accountId, createdIndex)
  const about = buildListenerCarrierAbout(payload, username, accountId, createdIndex)
  const response = await client.invoke(new Api.channels.CreateChannel({
    title,
    about,
    broadcast: true,
    megagroup: false
  }))
  const createdEntity = extractCreatedChat(response)
  if (!createdEntity) {
    throw new Error('CREATE_CARRIER_FAILED')
  }

  try {
    const input = await client.getInputEntity(createdEntity as never)
    const checkResult = await client.invoke(new Api.channels.CheckUsername({
      channel: input as never,
      username
    }))
    const checkResultMeta = checkResult as unknown as { className?: string }
    const available = Boolean(checkResultMeta?.className === 'BoolTrue' || checkResult === true)
    if (!available) {
      throw new Error('USERNAME_OCCUPIED')
    }

    await client.invoke(new Api.channels.UpdateUsername({
      channel: input as never,
      username
    }))

    let postFailureMessage = ''
    let postSent = false
    if (payload.postType !== 'none') {
      try {
        await sendInitialPostToChannel(client, createdEntity, payload, title)
        postSent = true
      } catch (postError) {
        postFailureMessage = formatSniperPostError(postError)
      }
    }

    return {
      claimTargetTitle: readTitleFromEntity(createdEntity) || title,
      claimTargetRef: `https://t.me/${username}`,
      claimMessage: payload.postType === 'none'
        ? `已自动创建频道 ${title} 并绑定成 @${username}。`
        : postFailureMessage
          ? `已自动创建频道 ${title} 并绑定成 @${username}，但首帖发送失败：${postFailureMessage}`
          : `已自动创建频道 ${title} 并绑定成 @${username}，并已发送首帖。`,
      createdCarrier: true,
      postSent,
      postFailureMessage
    }
  } catch (error) {
    await rollbackCreatedEntity(client, createdEntity).catch(() => undefined)
    throw error
  }
}

function formatSniperClaimError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/CREATE_CARRIER_FAILED/i.test(message)) return '自动创建占位频道失败了。'
  if (/USERNAME_OCCUPIED/i.test(message)) return '这个名字刚刚被别人占走了。'
  if (/USERNAME_INVALID|USERNAMES_UNAVAILABLE|USERNAME_PURCHASE_AVAILABLE/i.test(message)) return '这个名字现在不能普通占位。'
  if (/CHANNELS_ADMIN_PUBLIC_TOO_MUCH/i.test(message)) return '这个账号的公开群/频道用户名槽位已经到上限了。'
  if (/CHAT_ADMIN_REQUIRED/i.test(message)) return '这个池子载体不是当前账号真正可控的管理员对象。'
  return formatSniperRuntimeError(error)
}

async function isAlreadyInChannel(client: TelegramClient, entity: unknown) {
  try {
    await client.invoke(new Api.channels.GetParticipant({
      channel: entity as never,
      participant: new Api.InputPeerSelf()
    }))
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/USER_NOT_PARTICIPANT|PARTICIPANT_ID_INVALID|not a member of the specified megagroup or channel|target user is not a member/i.test(message)) {
      return false
    }
    throw error
  }
}

async function joinPublicSource(client: TelegramClient, ref: string) {
  const resolved = await resolvePeer(client, ref)
  if (!['channel', 'group'].includes(resolved.kind)) {
    return {
      status: 'skipped' as const,
      source: resolved,
      message: '这个来源不是可加入的频道/群，已跳过。'
    }
  }
  if (await isAlreadyInChannel(client, resolved.entity)) {
    return {
      status: 'skipped' as const,
      source: resolved,
      message: '已加入，跳过。'
    }
  }
  await client.invoke(new Api.channels.JoinChannel({ channel: resolved.entity as never }))
  return {
    status: 'joined' as const,
    source: resolved,
    message: '已成功加入这个频道/群。'
  }
}

function formatSourceSubscribeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/FILTER_INCLUDE_EMPTY/i.test(message)) return '这个分组当前没有新的频道/群需要加入。'
  if (/CHATLISTS_TOO_MUCH/i.test(message)) return '这个账号可导入的分组太多了，Telegram 不让再加新的分组。'
  if (/USER_ALREADY_PARTICIPANT/i.test(message)) return '这个账号已经在目标里了。'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(message)) return '这个账号加入得太多了，Telegram 不让继续加。'
  if (/INVITE_SLUG_EXPIRED|SLUG_EXPIRED/i.test(message)) return '这个分组分享链接已经失效了。'
  return `加入失败：${formatSniperRuntimeError(error)}`
}

function readSubscribeSourceKindLabel(kind: OtherToolsSourceSubscribeItem['sourceKind']) {
  if (kind === 'group') return '群组'
  if (kind === 'channel') return '频道'
  if (kind === 'chatlist') return '分组'
  return '来源'
}

async function subscribeSourcesForAccount(client: TelegramClient, account: AccountRecord, refs: string[]): Promise<OtherToolsSourceSubscribeItem[]> {
  const items: OtherToolsSourceSubscribeItem[] = []
  for (const ref of refs) {
    const slug = extractChatlistSlug(ref)
    if (slug) {
      try {
        const invite = await client.invoke(new Api.chatlists.CheckChatlistInvite({ slug }))
        const inviteChats = Array.isArray((invite as { chats?: unknown[] })?.chats)
          ? ((invite as { chats?: unknown[] }).chats ?? []).filter((entity) => ['channel', 'group'].includes(readPeerKind(entity)))
          : []
        const missingPeerKeys = new Set(
          Array.isArray((invite as { missingPeers?: unknown[] })?.missingPeers)
            ? ((invite as { missingPeers?: unknown[] }).missingPeers ?? []).map(readPeerKey).filter(Boolean)
            : []
        )
        const peersToJoin = inviteChats.filter((entity) => missingPeerKeys.size === 0 || missingPeerKeys.has(readEntityPeerKey(entity)))
        if (peersToJoin.length === 0) {
          continue
        }
        await client.invoke(new Api.chatlists.JoinChatlistInvite({ slug, peers: peersToJoin as never }))
        items.push({
          id: createId('subscribe-item'),
          accountId: account.id,
          accountLabel: readCheckResultTitle(account),
          sourceRef: ref,
          sourceTitle: '分组分享链接',
          sourceKind: 'chatlist',
          status: 'joined',
          message: `已通过分组链接导入 ${peersToJoin.length} 个频道/群。`
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/FILTER_INCLUDE_EMPTY/i.test(message)) {
          continue
        }
        items.push({
          id: createId('subscribe-item'),
          accountId: account.id,
          accountLabel: readCheckResultTitle(account),
          sourceRef: ref,
          sourceTitle: '分组分享链接',
          sourceKind: 'chatlist',
          status: 'failed',
          message: formatSourceSubscribeError(error)
        })
      }
      continue
    }

    try {
      const joined = await joinPublicSource(client, ref)
      items.push({
        id: createId('subscribe-item'),
        accountId: account.id,
        accountLabel: readCheckResultTitle(account),
        sourceRef: joined.source.ref,
        sourceTitle: joined.source.title,
        sourceKind: joined.source.kind === 'channel' || joined.source.kind === 'group' ? joined.source.kind : 'unknown',
        status: joined.status,
        message: joined.message
      })
    } catch (error) {
      items.push({
        id: createId('subscribe-item'),
        accountId: account.id,
        accountLabel: readCheckResultTitle(account),
        sourceRef: ref,
        sourceTitle: ref,
        sourceKind: 'unknown',
        status: 'failed',
        message: formatSourceSubscribeError(error)
      })
    }
  }
  return items
}

export class OtherToolsService {
  private sniperListenerTask: ActiveSniperListenerTask | null = null

  private sniperListenerStateSink: ((state: OtherToolsSniperListenerState) => void) | null = null

  private readonly telethonSniperService = new TelethonSniperService()

  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  setSniperListenerStateSink(sink: ((state: OtherToolsSniperListenerState) => void) | null) {
    this.sniperListenerStateSink = sink
  }

  private createEmptySniperListenerState(message = '监听未启动。'): OtherToolsSniperListenerState {
    return {
      running: false,
      scanAccountId: null,
      scanAccountLabel: '',
      claimAccountId: null,
      claimAccountLabel: '',
      createCarrierAccountId: null,
      createCarrierAccountLabel: '',
      pollIntervalSeconds: 5,
      sourceCount: 0,
      expandedSourceCount: 0,
      checkedMessageCount: 0,
      candidateCount: 0,
      claimedCount: 0,
      createdCarrierCount: 0,
      seenMessageCount: 0,
      startedAt: null,
      lastTickAt: null,
      logs: [],
      message
    }
  }

  private emitSniperListenerState(task: ActiveSniperListenerTask | null = this.sniperListenerTask) {
    const state = task?.state ?? this.createEmptySniperListenerState()
    this.sniperListenerStateSink?.({
      ...state,
      logs: [...state.logs]
    })
  }

  getSniperListenerState(): OtherToolsSniperListenerState {
    if (!this.sniperListenerTask) return this.createEmptySniperListenerState()
    return {
      ...this.sniperListenerTask.state,
      logs: [...this.sniperListenerTask.state.logs]
    }
  }

  private pushSniperListenerLog(task: ActiveSniperListenerTask, entry: Omit<OtherToolsSniperListenerLogEntry, 'id' | 'createdAt'>) {
    const next = createSniperLogEntry(entry)
    task.state.logs = [next, ...task.state.logs].slice(0, 300)
    task.state.message = next.message
    this.emitSniperListenerState(task)
  }

  private resolveSniperTaskAccounts(accounts: AccountRecord[], selectedIds: Array<number | null | undefined>) {
    const normalizedIds = Array.from(new Set(selectedIds.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))))
    if (normalizedIds.length === 0) {
      throw new Error('先选本次任务要用的账号。')
    }

    const selectedAccounts = accounts.filter((account) => normalizedIds.includes(account.id))
    if (selectedAccounts.length === 0) {
      throw new Error('你选的任务账号当前都找不到了。')
    }

    const availableAccounts = selectedAccounts.filter((account) => !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
    if (availableAccounts.length === 0) {
      throw new Error('你选的任务账号当前都不可用，任务没法开始。')
    }

    return availableAccounts
  }

  private async resolveSniperAccountClient(options: {
    accounts: AccountRecord[]
    preferredIds?: Array<number | null | undefined>
    roleLabel: string
    existing?: ResolvedSniperAccountClient[]
    excludeIds?: Array<number | null | undefined>
  }): Promise<ResolvedSniperAccountClient> {
    const excludedIds = new Set((options.excludeIds ?? []).filter((item): item is number => typeof item === 'number' && Number.isFinite(item)))
    const available = options.accounts.filter((account) => !excludedIds.has(account.id) && !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
    const fallbackPool = available.length > 0 ? available : options.accounts.filter((account) => !excludedIds.has(account.id))
    if (fallbackPool.length === 0) {
      throw new Error(`当前没有可用${options.roleLabel}账号。`)
    }

    const preferredIds = Array.from(new Set((options.preferredIds ?? []).filter((item): item is number => typeof item === 'number' && Number.isFinite(item))))
    const orderedCandidates: AccountRecord[] = []
    const seen = new Set<number>()
    for (const id of preferredIds) {
      const matched = fallbackPool.find((account) => account.id === id)
      if (matched && !seen.has(matched.id)) {
        orderedCandidates.push(matched)
        seen.add(matched.id)
      }
    }
    for (const account of fallbackPool) {
      if (seen.has(account.id)) continue
      orderedCandidates.push(account)
      seen.add(account.id)
    }

    let lastError: unknown = null
    for (const account of orderedCandidates) {
      const reused = options.existing?.find((item) => item.account.id === account.id)
      if (reused) return reused
      try {
        const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
        return { account, client }
      } catch (error) {
        lastError = error
        const fatal = isFatalAccountError(error)
        if (fatal) {
          this.repository.updateStatus([account.id], fatal.status)
        }
        if (/GLOBAL_PROXY_REQUIRED/i.test(error instanceof Error ? error.message : String(error))) {
          throw error
        }
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError || '')
    throw new Error(reason ? `账号池里没有能用的${options.roleLabel}账号：${reason}` : `账号池里没有能用的${options.roleLabel}账号。`)
  }

  private async destroySniperListenerTask(task: ActiveSniperListenerTask | null) {
    if (!task) return
    const scanClient = task.scanClient
    const claimClient = task.claimClient
    const createCarrierClient = task.createCarrierClient
    if (scanClient) {
      await this.clientManager.destroyClient(scanClient).catch(() => undefined)
    }
    if (claimClient && claimClient !== scanClient) {
      await this.clientManager.destroyClient(claimClient).catch(() => undefined)
    }
    if (createCarrierClient && createCarrierClient !== scanClient && createCarrierClient !== claimClient) {
      await this.clientManager.destroyClient(createCarrierClient).catch(() => undefined)
    }
    task.scanClient = null
    task.claimClient = null
    task.createCarrierClient = null
    await Promise.all(Array.from(task.subscribeClients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    task.subscribeClients.clear()
  }

  async stopSniperListener(): Promise<OtherToolsSniperListenerStopResult> {
    if (!this.sniperListenerTask) {
      return {
        stopped: false,
        message: '当前没有在运行的监听任务。'
      }
    }

    const task = this.sniperListenerTask
    task.cancelled = true
    task.state.running = false
    task.state.message = '监听任务已停止。'
    this.emitSniperListenerState(task)
    await this.destroySniperListenerTask(task)
    this.sniperListenerTask = null
    return {
      stopped: true,
      message: '监听任务已停止。'
    }
  }

  async filterUsernames(payload: OtherToolsUsernameFilterPayload): Promise<OtherToolsUsernameFilterResult> {
    const values = splitInput(payload.input)
    if (values.length === 0) {
      return {
        accountId: null,
        accountLabel: '',
        total: 0,
        checkedCount: 0,
        valid: [],
        occupiable: [],
        forbidden: [],
        items: [],
        message: '还没有可筛选的内容。'
      }
    }

    const account = pickCheckAccount(this.repository.list())
    if (!account) {
      throw new Error('当前没有可用账号，没法连 Telegram 实查用户名。')
    }

    const client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)

    try {
      const items: OtherToolsUsernameFilterItem[] = []
      for (const raw of values) {
        const normalized = normalizeCandidate(raw)
        const result = await resolveUsernameState(client, normalized)
        items.push({
          raw: normalized.raw,
          normalized: normalized.normalized,
          category: result.category,
          kind: normalized.kind,
          reason: result.reason,
          entityType: result.entityType,
          checkedAccountId: account.id,
          checkedAccountLabel: readCheckResultTitle(account)
        })
      }

      const valid = items.filter((item) => item.category === 'valid')
      const occupiable = items.filter((item) => item.category === 'occupiable')
      const forbidden = items.filter((item) => item.category === 'forbidden')

      return {
        accountId: account.id,
        accountLabel: readCheckResultTitle(account),
        total: items.length,
        checkedCount: items.length,
        valid,
        occupiable,
        forbidden,
        items,
        message: `已通过账号 ${readCheckResultTitle(account)} 实查 ${items.length} 条。`
      }
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  async startSniperListener(payload: OtherToolsSniperListenerPayload): Promise<OtherToolsSniperListenerState> {
    if (this.sniperListenerTask) {
      throw new Error('已经有监听任务在运行了，请先停止当前监听。')
    }

    const sourceRefs = splitLines(payload.sourceInput)
    const poolRefs = splitLines(payload.poolInput)
    if (sourceRefs.length === 0) {
      throw new Error('先填白名单来源，再启动监听。')
    }
    if (payload.postType === 'photo' && !payload.postImageData.trim()) {
      throw new Error('你选了图文 post，但还没上传图片。')
    }
    if (payload.postType !== 'none' && !payload.postText.trim() && !(payload.postType === 'photo' && payload.postImageData.trim())) {
      throw new Error('你开了自动发帖，但文案和图片至少要填一个。')
    }

    const accounts = this.repository.list()
    const selectedTaskAccountIds = Array.from(new Set((payload.subscribeAccountIds ?? []).filter((item): item is number => typeof item === 'number')))
    const taskAccounts = this.resolveSniperTaskAccounts(accounts, selectedTaskAccountIds)
    const scanSelection = await this.resolveSniperAccountClient({
      accounts: taskAccounts,
      preferredIds: [payload.scanAccountId ?? null],
      roleLabel: '监听'
    })
    let scanAccount = scanSelection.account

    const claimSelection = payload.autoClaim
      ? await this.resolveSniperAccountClient({
        accounts: taskAccounts,
        preferredIds: [payload.claimAccountId ?? null, payload.scanAccountId ?? null, scanAccount.id],
        roleLabel: '抢注',
        existing: [scanSelection]
      })
      : null
    let claimAccount = claimSelection?.account ?? null
    if (payload.autoClaim && !claimAccount && !payload.autoCreateCarrier) {
      throw new Error('当前没有可用抢注账号。')
    }

    const createCarrierSuccessCountByAccount = new Map<number, number>()
    const createCarrierSelection = payload.autoCreateCarrier
      ? await this.resolveSniperAccountClient({
        accounts: taskAccounts,
        preferredIds: [payload.createCarrierAccountId ?? null, payload.claimAccountId ?? null, payload.scanAccountId ?? null, claimAccount?.id ?? null, scanAccount.id],
        roleLabel: '建池',
        existing: [scanSelection, ...(claimSelection ? [claimSelection] : [])]
      })
      : null
    let createCarrierAccount = createCarrierSelection?.account ?? null
    if (payload.autoCreateCarrier && !createCarrierAccount) {
      throw new Error('已开启自动建频道占位，但当前没有可用建池账号。')
    }

    const subscribeAccounts = payload.autoSubscribeSources ? taskAccounts : []
    const pollIntervalSeconds = Math.max(5, Math.min(300, Math.trunc(payload.pollIntervalSeconds || 5)))
    const sourceLimit = Math.max(1, Math.min(100, Math.trunc(payload.sourceMessageLimit || 2)))
    const candidateLimit = Math.max(1, Math.min(500, Math.trunc(payload.candidateLimit || 100)))
    const includeKeywords = normalizeKeywordSet(payload.includeKeywords)
    const excludeKeywords = normalizeKeywordSet(payload.excludeKeywords)

    const task: ActiveSniperListenerTask = {
      id: createId('sniper-listener'),
      cancelled: false,
      tickCount: 0,
      state: {
        running: true,
        scanAccountId: scanAccount.id,
        scanAccountLabel: readCheckResultTitle(scanAccount),
        claimAccountId: claimAccount?.id ?? null,
        claimAccountLabel: readCheckResultTitle(claimAccount),
        createCarrierAccountId: createCarrierAccount?.id ?? null,
        createCarrierAccountLabel: readCheckResultTitle(createCarrierAccount),
        pollIntervalSeconds,
        sourceCount: sourceRefs.length,
        expandedSourceCount: 0,
        checkedMessageCount: 0,
        candidateCount: 0,
        claimedCount: 0,
        createdCarrierCount: 0,
        seenMessageCount: 0,
        startedAt: new Date().toISOString(),
        lastTickAt: null,
        logs: [],
        message: '监听准备启动中…'
      },
      scanClient: scanSelection.client,
      claimClient: claimSelection?.client ?? null,
      createCarrierClient: createCarrierSelection?.client ?? null,
      subscribeClients: new Map(),
      seenMessageKeys: new Set(),
      handledCandidateKeys: new Set()
    }
    this.sniperListenerTask = task
    this.emitSniperListenerState(task)

    void (async () => {
      let carrierIndex = 0
      let createdCarrierIndex = 0
      let joinChatlistsOnFirstTick = !payload.autoSubscribeSources || !subscribeAccounts.some((account) => account.id === scanAccount.id)

      try {
        if (!this.telethonSniperService.isAvailable()) {
          throw new Error('TELETHON_SNIPER_SERVICE_UNAVAILABLE')
        }

        task.scanClient = scanSelection.client
        task.claimClient = claimSelection?.client ?? null
        task.createCarrierClient = createCarrierSelection?.client ?? null

        const ensureListenerSourceReady = async (account: AccountRecord, client: TelegramClient, context: 'start' | 'switch') => {
          if (!payload.autoSubscribeSources) return
          let subscribeItems: OtherToolsSourceSubscribeItem[] = []
          try {
            subscribeItems = await subscribeSourcesForAccount(client, account, sourceRefs)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (/TIMEOUT/i.test(message)) {
              throw new Error(`监听启动阶段超时：账号 ${readCheckResultTitle(account)} 预先订阅来源太慢了。`)
            }
            throw error
          }
          const joinedCount = subscribeItems.filter((item) => item.status === 'joined').length
          const failedItems = subscribeItems.filter((item) => item.status === 'failed')
          if (joinedCount > 0) {
            this.pushSniperListenerLog(task, {
              level: 'success',
              message: context === 'start'
                ? `${readCheckResultTitle(account)} 已预先订阅 ${joinedCount} 个来源目标。`
                : `${readCheckResultTitle(account)} 已补订阅 ${joinedCount} 个来源目标。`,
              accountId: account.id,
              accountLabel: readCheckResultTitle(account)
            })
          }
          if (failedItems.length > 0) {
            this.pushSniperListenerLog(task, {
              level: 'warning',
              message: `${readCheckResultTitle(account)} 订阅来源时有 ${failedItems.length} 条失败。`,
              accountId: account.id,
              accountLabel: readCheckResultTitle(account)
            })
            for (const failedItem of failedItems) {
              this.pushSniperListenerLog(task, {
                level: 'warning',
                message: `${readCheckResultTitle(account)} 订阅失败：${readSubscribeSourceKindLabel(failedItem.sourceKind)} ${failedItem.sourceTitle}｜${failedItem.message}`,
                accountId: account.id,
                accountLabel: readCheckResultTitle(account),
                sourceRef: failedItem.sourceRef,
                sourceTitle: failedItem.sourceTitle
              })
            }
          }
        }

        const switchRoleAccount = async (role: 'scan' | 'claim' | 'createCarrier', reason: string) => {
          const roleLabel = role === 'scan' ? '监听' : role === 'claim' ? '抢注' : '建池'
          const previousAccount = role === 'scan' ? scanAccount : role === 'claim' ? claimAccount : createCarrierAccount
          const previousClient = role === 'scan' ? task.scanClient : role === 'claim' ? task.claimClient : task.createCarrierClient

          try {
            const next = await this.resolveSniperAccountClient({
              accounts: taskAccounts,
              preferredIds: role === 'scan'
                ? [payload.scanAccountId ?? null]
                : role === 'claim'
                  ? [payload.claimAccountId ?? null, payload.scanAccountId ?? null]
                  : [payload.createCarrierAccountId ?? null, payload.claimAccountId ?? null, payload.scanAccountId ?? null],
              roleLabel,
              existing: [
                ...(role !== 'scan' && task.scanClient ? [{ account: scanAccount, client: task.scanClient }] : []),
                ...(role !== 'claim' && claimAccount && task.claimClient ? [{ account: claimAccount, client: task.claimClient }] : []),
                ...(role !== 'createCarrier' && createCarrierAccount && task.createCarrierClient ? [{ account: createCarrierAccount, client: task.createCarrierClient }] : [])
              ],
              excludeIds: [previousAccount?.id ?? null]
            })

            const otherClients = [
              role !== 'scan' ? task.scanClient : null,
              role !== 'claim' ? task.claimClient : null,
              role !== 'createCarrier' ? task.createCarrierClient : null
            ].filter((client): client is TelegramClient => Boolean(client))

            if (previousClient && previousClient !== next.client && !otherClients.includes(previousClient)) {
              await this.clientManager.destroyClient(previousClient).catch(() => undefined)
            }

            if (role === 'scan') {
              scanAccount = next.account
              task.scanClient = next.client
              task.state.scanAccountId = next.account.id
              task.state.scanAccountLabel = readCheckResultTitle(next.account)
              await ensureListenerSourceReady(next.account, next.client, 'switch')
            } else if (role === 'claim') {
              claimAccount = next.account
              task.claimClient = next.client
              task.state.claimAccountId = next.account.id
              task.state.claimAccountLabel = readCheckResultTitle(next.account)
            } else {
              createCarrierAccount = next.account
              task.createCarrierClient = next.client
              task.state.createCarrierAccountId = next.account.id
              task.state.createCarrierAccountLabel = readCheckResultTitle(next.account)
            }

            this.pushSniperListenerLog(task, {
              level: 'warning',
              message: `${roleLabel}账号 ${readCheckResultTitle(previousAccount)} 已不可用，已切到 ${readCheckResultTitle(next.account)} 继续任务。原因：${reason}`,
              accountId: next.account.id,
              accountLabel: readCheckResultTitle(next.account)
            })
            return true
          } catch (switchError) {
            if (role === 'claim') {
              claimAccount = null
              task.claimClient = null
              task.state.claimAccountId = null
              task.state.claimAccountLabel = ''
            }
            if (role === 'createCarrier') {
              createCarrierAccount = null
              task.createCarrierClient = null
              task.state.createCarrierAccountId = null
              task.state.createCarrierAccountLabel = ''
            }
            this.pushSniperListenerLog(task, {
              level: 'error',
              message: `${roleLabel}账号池已经耗尽：${formatSniperRuntimeError(switchError)}`
            })
            return false
          }
        }

        await ensureListenerSourceReady(scanAccount, task.scanClient!, 'start')

        task.state.message = '监听已启动，正在进入 Telethon 主链路…'
        this.pushSniperListenerLog(task, {
          level: 'success',
          message: `监听已启动：${readCheckResultTitle(scanAccount)} 已切到 Telethon 主链路。`,
          accountId: scanAccount.id,
          accountLabel: readCheckResultTitle(scanAccount)
        })
        this.pushSniperListenerLog(task, {
          level: 'info',
          message: `首次启动只对齐每个来源最近 ${sourceLimit} 条，后面只盯新帖里的用户名。`,
          accountId: scanAccount.id,
          accountLabel: readCheckResultTitle(scanAccount)
        })
        this.pushSniperListenerLog(task, {
          level: 'info',
          message: `本次任务只会使用你选中的 ${taskAccounts.length} 个账号，不会去动账号列表里的其他号。`
        })
        if (!payload.scanAccountId || (payload.autoClaim && !payload.claimAccountId) || (payload.autoCreateCarrier && !payload.createCarrierAccountId)) {
          this.pushSniperListenerLog(task, {
            level: 'info',
            message: `未手动指定的角色已从这 ${taskAccounts.length} 个任务账号里自动挑选：监听 ${readCheckResultTitle(scanAccount)}${claimAccount ? `，抢注 ${readCheckResultTitle(claimAccount)}` : ''}${createCarrierAccount ? `，建频道 ${readCheckResultTitle(createCarrierAccount)}` : ''}。`
          })
        }

        while (!task.cancelled) {
          task.tickCount += 1
          task.state.lastTickAt = new Date().toISOString()
          this.emitSniperListenerState(task)

          this.pushSniperListenerLog(task, {
            level: 'info',
            message: `第 ${task.tickCount} 轮监听开始：每 ${pollIntervalSeconds} 秒检查一次，每个来源只看最近 ${sourceLimit} 条新帖。`,
            accountId: scanAccount.id,
            accountLabel: readCheckResultTitle(scanAccount)
          })

          let scanResult: Awaited<ReturnType<TelethonSniperService['scanSources']>> | null = null
          try {
            const scanRetryTimeouts = [undefined, 120, 180] as const
            let lastScanError: unknown = null
            for (let attemptIndex = 0; attemptIndex < scanRetryTimeouts.length; attemptIndex += 1) {
              try {
                scanResult = await this.telethonSniperService.scanSources({
                  sessionPath: scanAccount.sessionPath,
                  sourceRefs,
                  sourceMessageLimit: sourceLimit,
                  includeKeywords,
                  excludeKeywords,
                  seenMessageKeys: Array.from(task.seenMessageKeys),
                  handledCandidateKeys: Array.from(task.handledCandidateKeys),
                  joinChatlists: joinChatlistsOnFirstTick,
                  bootstrapExistingMessages: task.tickCount === 1,
                  timeoutSeconds: scanRetryTimeouts[attemptIndex] ?? undefined,
                  proxy: readCurrentProxyOrThrow(this.proxyPoolService)
                })
                break
              } catch (error) {
                lastScanError = error
                const message = error instanceof Error ? error.message : String(error)
                if (!/TIMEOUT/i.test(message)) {
                  throw error
                }
                if (attemptIndex < scanRetryTimeouts.length - 1) {
                  this.pushSniperListenerLog(task, {
                    level: 'warning',
                    message: `第 ${task.tickCount} 轮扫描超时，正在自动重试（第 ${attemptIndex + 2}/${scanRetryTimeouts.length} 次）。`,
                    accountId: scanAccount.id,
                    accountLabel: readCheckResultTitle(scanAccount)
                  })
                  continue
                }
              }
            }
            if (!scanResult && lastScanError) {
              throw lastScanError
            }
            if (!scanResult) {
              throw new Error('监听扫描这轮没拿到结果。')
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (/TIMEOUT/i.test(message)) {
              throw new Error(`监听扫描已自动重试 ${3} 次，但还是超时。可能是来源太多、代理太慢，或者 Telegram 返回太慢。`)
            }
            const fatal = isFatalAccountError(error)
            if (fatal) {
              this.repository.updateStatus([scanAccount.id], fatal.status)
              const switched = await switchRoleAccount('scan', fatal.message)
              if (!switched) {
                task.state.message = '你选的任务账号都已经不可用，监听任务结束。'
                break
              }
              joinChatlistsOnFirstTick = true
              continue
            }
            throw error
          }
          joinChatlistsOnFirstTick = false

          task.state.expandedSourceCount = scanResult.expandedSourceCount
          task.state.checkedMessageCount += scanResult.checkedMessageCount
          task.state.candidateCount += scanResult.candidateCount
          for (const key of scanResult.newSeenMessageKeys) {
            task.seenMessageKeys.add(key)
          }
          task.state.seenMessageCount = task.seenMessageKeys.size
          task.state.message = `监听运行中：当前盯着 ${scanResult.expandedSourceCount} 个实际来源。`

          const occupiableCount = scanResult.items.filter((item) => item.category === 'occupiable').length
          const occupiedCount = scanResult.items.filter((item) => item.category === 'valid').length
          const forbiddenCount = scanResult.items.filter((item) => item.category === 'forbidden').length
          this.pushSniperListenerLog(task, {
            level: scanResult.items.length > 0 ? 'success' : 'info',
            message: `第 ${task.tickCount} 轮监听结果：实际检查 ${scanResult.expandedSourceCount} 个来源，拉取到 ${scanResult.newSeenMessageKeys.length} 条新消息，命中过滤后检查 ${scanResult.checkedMessageCount} 条，发现 ${scanResult.candidateCount} 个候选（可抢 ${occupiableCount} / 已占用 ${occupiedCount} / 不可用 ${forbiddenCount}）。`,
            accountId: scanAccount.id,
            accountLabel: readCheckResultTitle(scanAccount)
          })
          for (const detailLog of scanResult.logs ?? []) {
            this.pushSniperListenerLog(task, {
              level: detailLog.level,
              message: detailLog.message,
              sourceRef: detailLog.sourceRef,
              sourceTitle: detailLog.sourceTitle,
              candidate: detailLog.candidate,
              accountId: scanAccount.id,
              accountLabel: readCheckResultTitle(scanAccount)
            })
          }

          if (scanResult.chatlistJoinCount > 0) {
            this.pushSniperListenerLog(task, {
              level: 'success',
              message: `已自动加入 addlist 里的 ${scanResult.chatlistJoinCount} 个实际来源。`,
              accountId: scanAccount.id,
              accountLabel: readCheckResultTitle(scanAccount)
            })
          }

          for (const detected of scanResult.items) {
            if (task.cancelled) break
            const candidateKey = detected.normalized.toLowerCase()
            if (task.handledCandidateKeys.has(candidateKey)) continue
            task.handledCandidateKeys.add(candidateKey)

            if (detected.category !== 'occupiable') continue

            const item = buildCandidateItem({
              raw: detected.raw,
              normalized: detected.normalized,
              kind: detected.kind,
              category: detected.category,
              reason: detected.reason,
              entityType: detected.entityType,
              sourceRef: detected.sourceRef,
              sourceTitle: detected.sourceTitle,
              sourceExcerpt: detected.sourceExcerpt,
              sourceMessageId: detected.sourceMessageId,
              sourceDate: detected.sourceDate
            })
            item.checkedAccountId = scanAccount.id
            item.checkedAccountLabel = readCheckResultTitle(scanAccount)

            if (!payload.autoClaim) {
              this.pushSniperListenerLog(task, {
                level: 'info',
                message: `新帖命中可占位用户名 ${item.normalized}，但当前没开自动抢注。`,
                sourceRef: item.sourceRef,
                sourceTitle: item.sourceTitle,
                candidate: item.normalized,
                accountId: scanAccount.id,
                accountLabel: readCheckResultTitle(scanAccount)
              })
              continue
            }

            let attemptedRole: 'claim' | 'createCarrier' | null = null
            let attemptedAccount: AccountRecord | null = null
            try {
              let claimed: ListenerClaimResult | null = null
              let claimByAccount: AccountRecord | null = claimAccount
              while (true) {
                const proxy = readCurrentProxyOrThrow(this.proxyPoolService)

                if (carrierIndex < poolRefs.length && claimAccount) {
                  attemptedRole = 'claim'
                  attemptedAccount = claimAccount
                  try {
                    const poolClaimed = await this.telethonSniperService.claimWithPool({
                      sessionPath: claimAccount.sessionPath,
                      carrierRef: poolRefs[carrierIndex],
                      normalizedCandidate: item.normalized,
                      proxy
                    })
                    claimed = {
                      ...poolClaimed,
                      createdCarrier: false
                    }
                    carrierIndex += 1
                    break
                  } catch (error) {
                    if (isPublicLinkLimitError(error)) {
                      this.pushSniperListenerLog(task, {
                        level: 'warning',
                        message: `抢注账号 ${readCheckResultTitle(claimAccount)} 的公开链接槽位已经满了，正在切下一个号继续。`,
                        candidate: item.normalized,
                        sourceRef: item.sourceRef,
                        sourceTitle: item.sourceTitle,
                        accountId: claimAccount.id,
                        accountLabel: readCheckResultTitle(claimAccount)
                      })
                      const switched = await switchRoleAccount('claim', '公开链接槽位已满')
                      if (!switched) {
                        throw new Error('当前这批任务账号的公开链接槽位都满了，没法继续抢注。')
                      }
                      continue
                    }
                    throw error
                  }
                } else if (payload.autoCreateCarrier && createCarrierAccount) {
                  const usedCount = createCarrierSuccessCountByAccount.get(createCarrierAccount.id) ?? 0
                  if (usedCount >= MAX_PUBLIC_LINKS_PER_ACCOUNT) {
                    this.pushSniperListenerLog(task, {
                      level: 'warning',
                      message: `建频道账号 ${readCheckResultTitle(createCarrierAccount)} 在本次任务里已经创建了 ${MAX_PUBLIC_LINKS_PER_ACCOUNT} 个公开链接，正在切下一个号继续。`,
                      candidate: item.normalized,
                      sourceRef: item.sourceRef,
                      sourceTitle: item.sourceTitle,
                      accountId: createCarrierAccount.id,
                      accountLabel: readCheckResultTitle(createCarrierAccount)
                    })
                    const switched = await switchRoleAccount('createCarrier', `本次任务已创建满 ${MAX_PUBLIC_LINKS_PER_ACCOUNT} 个公开链接`)
                    if (!switched) {
                      throw new Error('当前这批任务账号都已经建满公开链接了，没法继续自动建频道抢注。')
                    }
                    continue
                  }

                  attemptedRole = 'createCarrier'
                  attemptedAccount = createCarrierAccount
                  try {
                    const createdClaim = await this.telethonSniperService.createCarrierAndClaim({
                      sessionPath: createCarrierAccount.sessionPath,
                      normalizedCandidate: item.normalized,
                      accountId: createCarrierAccount.id,
                      createdIndex: createdCarrierIndex,
                      createCarrierTitleTemplate: payload.createCarrierTitleTemplate,
                      createCarrierAboutTemplate: payload.createCarrierAboutTemplate,
                      postType: payload.postType,
                      postText: payload.postText,
                      postImageData: payload.postImageData,
                      proxy
                    })
                    claimed = {
                      ...createdClaim,
                      createdCarrier: true
                    }
                    createdCarrierIndex += 1
                    claimByAccount = createCarrierAccount
                    task.state.createdCarrierCount += 1
                    createCarrierSuccessCountByAccount.set(createCarrierAccount.id, usedCount + 1)
                    break
                  } catch (error) {
                    if (isPublicLinkLimitError(error)) {
                      this.pushSniperListenerLog(task, {
                        level: 'warning',
                        message: `建频道账号 ${readCheckResultTitle(createCarrierAccount)} 的公开链接槽位已经满了，正在切下一个号继续。`,
                        candidate: item.normalized,
                        sourceRef: item.sourceRef,
                        sourceTitle: item.sourceTitle,
                        accountId: createCarrierAccount.id,
                        accountLabel: readCheckResultTitle(createCarrierAccount)
                      })
                      const switched = await switchRoleAccount('createCarrier', '公开链接槽位已满')
                      if (!switched) {
                        throw new Error('当前这批任务账号都已经建满公开链接了，没法继续自动建频道抢注。')
                      }
                      continue
                    }
                    throw error
                  }
                } else {
                  item.claimStatus = 'skipped'
                  item.claimMessage = '可抢名已发现，但当前没有可用池子，也没开自动建频道占位。'
                  this.pushSniperListenerLog(task, {
                    level: 'warning',
                    message: `发现 ${item.normalized} 可抢，但没有可用池子/建池账号。`,
                    sourceRef: item.sourceRef,
                    sourceTitle: item.sourceTitle,
                    candidate: item.normalized
                  })
                  break
                }
              }
              if (!claimed) {
                continue
              }

              item.claimStatus = 'claimed'
              item.claimMessage = claimed.claimMessage
              item.claimTargetRef = claimed.claimTargetRef
              item.claimTargetTitle = claimed.claimTargetTitle
              item.claimAccountId = claimByAccount?.id ?? null
              item.claimAccountLabel = readCheckResultTitle(claimByAccount)
              task.state.claimedCount += 1
              this.pushSniperListenerLog(task, {
                level: 'success',
                message: claimed.createdCarrier
                  ? claimed.postFailureMessage
                    ? `命中 ${item.normalized}，已自动创建频道并抢到，但首帖发送失败。`
                    : payload.postType !== 'none' && claimed.postSent
                      ? `命中 ${item.normalized}，已自动创建频道、抢到并发出首帖。`
                      : `命中 ${item.normalized}，已自动创建频道并抢到。`
                  : `命中 ${item.normalized}，已用池子载体抢到。`,
                sourceRef: item.sourceRef,
                sourceTitle: item.sourceTitle,
                candidate: item.normalized,
                targetRef: claimed.claimTargetRef,
                accountId: claimByAccount?.id ?? null,
                accountLabel: readCheckResultTitle(claimByAccount)
              })
              if (claimed.createdCarrier && claimed.postFailureMessage) {
                this.pushSniperListenerLog(task, {
                  level: 'warning',
                  message: `${item.normalized} 的首帖没发出去：${claimed.postFailureMessage}`,
                  sourceRef: item.sourceRef,
                  sourceTitle: item.sourceTitle,
                  candidate: item.normalized,
                  targetRef: claimed.claimTargetRef,
                  accountId: claimByAccount?.id ?? null,
                  accountLabel: readCheckResultTitle(claimByAccount)
                })
              }
            } catch (error) {
              const fatal = isFatalAccountError(error)
              if (fatal) {
                const fatalAccountId = attemptedAccount?.id ?? null
                if (fatalAccountId) {
                  this.repository.updateStatus([fatalAccountId], fatal.status)
                }
                const switched = attemptedRole ? await switchRoleAccount(attemptedRole, fatal.message) : false
                if (!switched && !claimAccount && !createCarrierAccount) {
                  task.state.message = '你选的任务账号都已经不可用，监听任务结束。'
                  task.cancelled = true
                }
              }
              this.pushSniperListenerLog(task, {
                level: 'error',
                message: `命中 ${item.normalized} 但抢注失败：${fatal ? `账号已停用（${fatal.message}）` : formatSniperClaimError(error)}`,
                sourceRef: item.sourceRef,
                sourceTitle: item.sourceTitle,
                candidate: item.normalized,
                accountId: attemptedAccount?.id ?? null,
                accountLabel: readCheckResultTitle(attemptedAccount)
              })
            }

            if (task.state.claimedCount >= candidateLimit) {
              this.pushSniperListenerLog(task, {
                level: 'warning',
                message: `本轮监听自动抢注已达到上限 ${candidateLimit} 条，继续监听但不再重复处理旧候选。`
              })
            }
          }

          if (!task.cancelled) {
            await sleep(pollIntervalSeconds * 1000)
          }
        }
      } catch (error) {
        task.state.running = false
        this.pushSniperListenerLog(task, {
          level: 'error',
          message: `监听启动失败：${formatSniperRuntimeError(error)}`
        })
      } finally {
        task.state.running = false
        task.state.lastTickAt = new Date().toISOString()
        if (!task.cancelled && !task.state.message) {
          task.state.message = '监听任务已结束。'
        }
        this.emitSniperListenerState(task)
        await this.destroySniperListenerTask(task)
        if (this.sniperListenerTask?.id === task.id) {
          this.sniperListenerTask = null
        }
      }
    })()

    return this.getSniperListenerState()
  }

  async scanAndClaim(payload: OtherToolsSniperPayload): Promise<OtherToolsSniperResult> {
    const sourceRefs = splitLines(payload.sourceInput)
    const poolRefs = splitLines(payload.poolInput)
    if (sourceRefs.length === 0) {
      const emptyLogs = [createSniperLogEntry({ level: 'warning', message: '还没有白名单来源，先填频道 / 群 / 机器人再巡检。' })]
      return {
        scanAccountId: null,
        scanAccountLabel: '',
        claimAccountId: null,
        claimAccountLabel: '',
        sourceCount: 0,
        poolCount: 0,
        inspectedMessageCount: 0,
        candidateCount: 0,
        subscribeAccountCount: 0,
        subscribeJoinedCount: 0,
        subscribeAlreadyCount: 0,
        subscribeFailedCount: 0,
        subscribeSkippedCount: 0,
        subscribeItems: [],
        occupied: [],
        claimable: [],
        forbidden: [],
        uncertain: [],
        claimed: [],
        items: [],
        logs: emptyLogs,
        message: '还没有白名单来源，先填频道 / 群 / 机器人再巡检。'
      }
    }

    const accounts = this.repository.list()
    const selectedTaskAccountIds = Array.from(new Set((payload.subscribeAccountIds ?? []).filter((item): item is number => typeof item === 'number')))
    const taskAccounts = this.resolveSniperTaskAccounts(accounts, selectedTaskAccountIds)
    const scanSelection = await this.resolveSniperAccountClient({
      accounts: taskAccounts,
      preferredIds: [payload.scanAccountId ?? null],
      roleLabel: '监听'
    })
    const scanAccount = scanSelection.account

    const claimSelection = payload.autoClaim
      ? await this.resolveSniperAccountClient({
        accounts: taskAccounts,
        preferredIds: [payload.claimAccountId ?? null, payload.scanAccountId ?? null, scanAccount.id],
        roleLabel: '抢注',
        existing: [scanSelection]
      })
      : null
    let claimAccount = claimSelection?.account ?? null
    const autoCreateCarrier = Boolean(payload.autoCreateCarrier)
    const createCarrierSelection = autoCreateCarrier
      ? await this.resolveSniperAccountClient({
        accounts: taskAccounts,
        preferredIds: [payload.createCarrierAccountId ?? null, payload.claimAccountId ?? null, payload.scanAccountId ?? null, claimAccount?.id ?? null, scanAccount.id],
        roleLabel: '建池',
        existing: [scanSelection, ...(claimSelection ? [claimSelection] : [])]
      })
      : null
    let createCarrierAccount = createCarrierSelection?.account ?? null
    const subscribeAccounts = payload.autoSubscribeSources ? taskAccounts : []
    if (payload.autoClaim && !claimAccount && !autoCreateCarrier) {
      throw new Error('当前没有可用抢注账号。')
    }
    if (autoCreateCarrier && !createCarrierAccount) {
      throw new Error('已开启自动建频道占位，但当前没有可用建池账号。')
    }
    if (payload.autoClaim && poolRefs.length === 0 && !autoCreateCarrier) {
      throw new Error('已开启自动抢注，但还没有填写池子载体，也没开启自动建频道占位。')
    }
    if ((payload.postType ?? 'none') === 'photo' && !(payload.postImageData ?? '').trim()) {
      throw new Error('你选了图文首帖，但还没上传图片。')
    }
    if ((payload.postType ?? 'none') !== 'none' && !(payload.postText ?? '').trim() && !((payload.postType ?? 'none') === 'photo' && (payload.postImageData ?? '').trim())) {
      throw new Error('你已开启自动发首帖，但还没填内容。')
    }

    const includeKeywords = normalizeKeywordSet(payload.includeKeywords)
    const excludeKeywords = normalizeKeywordSet(payload.excludeKeywords)
    const sourceLimit = Math.max(1, Math.min(100, Math.trunc(payload.sourceMessageLimit || 20)))
    const candidateLimit = Math.max(1, Math.min(500, Math.trunc(payload.candidateLimit || 100)))

    const scanClient = scanSelection.client
    let claimClient = claimSelection?.client ?? null
    let createCarrierClient = createCarrierSelection?.client ?? null
    const subscribeClients = new Map<number, TelegramClient>()

    try {
      const items: OtherToolsSniperCandidateItem[] = []
      const subscribeItems: OtherToolsSourceSubscribeItem[] = []
      const logs: OtherToolsSniperListenerLogEntry[] = []
      const pushRunLog = (entry: Omit<OtherToolsSniperListenerLogEntry, 'id' | 'createdAt'>) => {
        logs.unshift(createSniperLogEntry(entry))
        if (logs.length > 120) logs.length = 120
      }
      const seenCandidates = new Set<string>()
      const createCarrierSuccessCountByAccount = new Map<number, number>()
      let inspectedMessageCount = 0
      let expandedSourceCount = 0
      let chatlistJoinCount = 0

      pushRunLog({
        level: 'info',
        message: `开始巡检：${readCheckResultTitle(scanAccount)} 正在检查 ${sourceRefs.length} 个来源。`,
        accountId: scanAccount.id,
        accountLabel: readCheckResultTitle(scanAccount)
      })
      pushRunLog({
        level: 'info',
        message: `本次任务只会使用你选中的 ${taskAccounts.length} 个账号，不会去动账号列表里的其他号。`
      })
      if (!payload.scanAccountId || (payload.autoClaim && !payload.claimAccountId) || (autoCreateCarrier && !payload.createCarrierAccountId)) {
        pushRunLog({
          level: 'info',
          message: `账号未手动指定的部分，已从这 ${taskAccounts.length} 个任务账号里自动选择：监听 ${readCheckResultTitle(scanAccount)}${claimAccount ? `，抢注 ${readCheckResultTitle(claimAccount)}` : ''}${createCarrierAccount ? `，建频道 ${readCheckResultTitle(createCarrierAccount)}` : ''}。`
        })
      }

      const switchRunRoleAccount = async (role: 'claim' | 'createCarrier', reason: string) => {
        const previousAccount = role === 'claim' ? claimAccount : createCarrierAccount
        const previousClient = role === 'claim' ? claimClient : createCarrierClient
        if (!previousAccount) return false

        const next = await this.resolveSniperAccountClient({
          accounts: taskAccounts,
          preferredIds: role === 'claim'
            ? [payload.claimAccountId ?? null, payload.scanAccountId ?? null]
            : [payload.createCarrierAccountId ?? null, payload.claimAccountId ?? null, payload.scanAccountId ?? null],
          roleLabel: role === 'claim' ? '抢注' : '建池',
          existing: [
            { account: scanAccount, client: scanClient },
            ...(role !== 'claim' && claimAccount && claimClient ? [{ account: claimAccount, client: claimClient }] : []),
            ...(role !== 'createCarrier' && createCarrierAccount && createCarrierClient ? [{ account: createCarrierAccount, client: createCarrierClient }] : [])
          ],
          excludeIds: [previousAccount.id]
        })

        if (role === 'claim') {
          if (previousClient && previousClient !== next.client && previousClient !== scanClient && previousClient !== createCarrierClient) {
            await this.clientManager.destroyClient(previousClient).catch(() => undefined)
          }
          claimAccount = next.account
          claimClient = next.client
        } else {
          if (previousClient && previousClient !== next.client && previousClient !== scanClient && previousClient !== claimClient) {
            await this.clientManager.destroyClient(previousClient).catch(() => undefined)
          }
          createCarrierAccount = next.account
          createCarrierClient = next.client
        }

        pushRunLog({
          level: 'warning',
          message: `${role === 'claim' ? '抢注' : '建频道'}账号 ${readCheckResultTitle(previousAccount)} 已不可继续使用，已切到 ${readCheckResultTitle(next.account)}。原因：${reason}`,
          accountId: next.account.id,
          accountLabel: readCheckResultTitle(next.account)
        })
        return true
      }

      if (payload.autoSubscribeSources && subscribeAccounts.length > 0) {
        for (const account of subscribeAccounts) {
          try {
            const client = account.id === scanAccount.id ? scanClient : await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
            if (client !== scanClient) {
              subscribeClients.set(account.id, client)
            }
            const accountItems = await subscribeSourcesForAccount(client, account, sourceRefs)
            subscribeItems.push(...accountItems)
            const joinedCount = accountItems.filter((item) => item.status === 'joined').length
            const skippedCount = accountItems.filter((item) => item.status === 'skipped' || item.status === 'already').length
            const failedCount = accountItems.filter((item) => item.status === 'failed').length
            pushRunLog({
              level: failedCount > 0 ? 'warning' : 'success',
              message: `${readCheckResultTitle(account)} 来源订阅完成：成功 ${joinedCount}，跳过 ${skippedCount}，失败 ${failedCount}。`,
              accountId: account.id,
              accountLabel: readCheckResultTitle(account)
            })
            for (const failedItem of accountItems.filter((item) => item.status === 'failed')) {
              pushRunLog({
                level: 'warning',
                message: `${readCheckResultTitle(account)} 订阅失败：${readSubscribeSourceKindLabel(failedItem.sourceKind)} ${failedItem.sourceTitle}｜${failedItem.message}`,
                accountId: account.id,
                accountLabel: readCheckResultTitle(account),
                sourceRef: failedItem.sourceRef,
                sourceTitle: failedItem.sourceTitle
              })
            }
          } catch (error) {
            pushRunLog({
              level: 'error',
              message: `${readCheckResultTitle(account)} 来源订阅失败：${formatSourceSubscribeError(error)}`,
              accountId: account.id,
              accountLabel: readCheckResultTitle(account)
            })
            subscribeItems.push({
              id: createId('subscribe-item'),
              accountId: account.id,
              accountLabel: readCheckResultTitle(account),
              sourceRef: '批量订阅',
              sourceTitle: '批量订阅',
              sourceKind: 'unknown',
              status: 'failed',
              message: formatSourceSubscribeError(error)
            })
          }
        }
      }

      let expandedSourceEntries: ExpandedSource[] = []
      try {
        const shouldJoinChatlistsForScan = !payload.autoSubscribeSources || !subscribeAccounts.some((account) => account.id === scanAccount.id)
        const expanded = await expandSourceRefsWithChatlists(scanClient, sourceRefs, { joinChatlists: shouldJoinChatlistsForScan })
        expandedSourceEntries = expanded.sources
        expandedSourceCount = expanded.sources.length
        chatlistJoinCount = expanded.chatlistJoinCount
        pushRunLog({
          level: 'success',
          message: `来源展开完成：${sourceRefs.length} 个入口共得到 ${expandedSourceEntries.length} 个实际来源。${chatlistJoinCount > 0 ? ` 其中 addlist 导入 ${chatlistJoinCount} 个。` : ''}`,
          accountId: scanAccount.id,
          accountLabel: readCheckResultTitle(scanAccount)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        pushRunLog({
          level: 'error',
          message: `分组链接展开失败：${message}`,
          accountId: scanAccount.id,
          accountLabel: readCheckResultTitle(scanAccount)
        })
        items.push({
          id: createId('sniper-item'),
          raw: 'addlist',
          normalized: 'addlist',
          kind: 'link',
          category: 'uncertain',
          entityType: 'unknown',
          reason: `分组链接处理失败：${message}`,
          sourceRef: 'addlist',
          sourceTitle: '分组链接',
          sourceExcerpt: '这次分组链接没有成功导入。',
          sourceMessageId: '',
          sourceDate: new Date().toISOString(),
          claimStatus: null,
          claimMessage: '',
          claimTargetRef: '',
          claimTargetTitle: '',
          checkedAccountId: scanAccount.id,
          checkedAccountLabel: readCheckResultTitle(scanAccount)
        })
      }

      for (const sourceEntry of expandedSourceEntries) {
        try {
          const messages = await scanClient.getMessages(sourceEntry.entity as never, { limit: sourceLimit })
          for (const message of messages) {
            const blob = readSourceBlob(message)
            if (!blob || !matchesKeywords(blob, includeKeywords, excludeKeywords)) continue
            inspectedMessageCount += 1
            const extracted = extractCandidatesFromText(blob)
            for (const found of extracted) {
              const normalized = normalizeCandidate(found)
              if (!normalized.candidate) continue
              const dedupeKey = normalized.normalized.toLowerCase()
              if (seenCandidates.has(dedupeKey)) continue
              const resolved = await resolveUsernameState(scanClient, normalized)
              const item = buildCandidateItem({
                raw: normalized.raw,
                normalized: normalized.normalized,
                kind: normalized.kind,
                category: resolved.category,
                reason: resolved.reason,
                entityType: resolved.entityType,
                sourceRef: sourceEntry.ref,
                sourceTitle: sourceEntry.title,
                sourceExcerpt: makeExcerpt(readMessageText(message), found),
                sourceMessageId: readMessageId(message),
                sourceDate: readMessageDate(message)
              })
              item.checkedAccountId = scanAccount.id
              item.checkedAccountLabel = readCheckResultTitle(scanAccount)
              items.push(item)
              seenCandidates.add(dedupeKey)
              if (items.length >= candidateLimit) break
            }
            if (items.length >= candidateLimit) break
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          pushRunLog({
            level: 'error',
            message: `读取来源 ${sourceEntry.title || sourceEntry.ref} 失败：${message}`,
            sourceRef: sourceEntry.ref,
            sourceTitle: sourceEntry.title || sourceEntry.ref,
            accountId: scanAccount.id,
            accountLabel: readCheckResultTitle(scanAccount)
          })
          items.push({
            id: createId('sniper-item'),
            raw: sourceEntry.ref,
            normalized: sourceEntry.ref,
            kind: 'link',
            category: 'uncertain',
            entityType: 'unknown',
            reason: `来源读取失败：${message}`,
            sourceRef: sourceEntry.ref,
            sourceTitle: sourceEntry.title || sourceEntry.ref,
            sourceExcerpt: '这个来源本轮没有成功读取。',
            sourceMessageId: '',
            sourceDate: new Date().toISOString(),
            claimStatus: null,
            claimMessage: '',
            claimTargetRef: '',
            claimTargetTitle: '',
            checkedAccountId: scanAccount.id,
            checkedAccountLabel: readCheckResultTitle(scanAccount)
          })
        }
        if (items.length >= candidateLimit) break
      }

      const claimableItems = items.filter((item) => item.category === 'claimable')
      let carriers: PoolCarrier[] = []
      if (payload.autoClaim) {
        if (poolRefs.length > 0 && claimClient) {
          carriers = await readPoolCarriers(claimClient, poolRefs)
          pushRunLog({
            level: 'info',
            message: `本轮可用抢注池子 ${carriers.length} 个。`,
            accountId: claimAccount?.id ?? null,
            accountLabel: readCheckResultTitle(claimAccount)
          })
        } else if (autoCreateCarrier) {
          pushRunLog({
            level: 'info',
            message: '这次没填池子载体，命中后会直接自动创建频道占位。',
            accountId: createCarrierAccount?.id ?? null,
            accountLabel: readCheckResultTitle(createCarrierAccount)
          })
        }

        let carrierIndex = 0
        let createdCarrierIndex = 0
        for (const item of claimableItems) {
          try {
            let claimed: ListenerClaimResult | null = null
            let claimByAccount: AccountRecord | null = claimAccount

            while (true) {
              if (carrierIndex < carriers.length && claimClient && claimAccount) {
                const carrier = carriers[carrierIndex]
                try {
                  const poolClaimed = await claimCandidateWithPool(claimClient, carrier, item)
                  claimed = {
                    claimTargetTitle: poolClaimed.claimTargetTitle,
                    claimTargetRef: poolClaimed.claimTargetRef,
                    claimMessage: poolClaimed.claimMessage,
                    createdCarrier: false
                  }
                  carrierIndex += 1
                  break
                } catch (error) {
                  if (isPublicLinkLimitError(error)) {
                    pushRunLog({
                      level: 'warning',
                      message: `抢注账号 ${readCheckResultTitle(claimAccount)} 的公开链接槽位已经满了，正在切下一个号继续。`,
                      sourceRef: item.sourceRef,
                      sourceTitle: item.sourceTitle,
                      candidate: item.normalized,
                      accountId: claimAccount.id,
                      accountLabel: readCheckResultTitle(claimAccount)
                    })
                    const switched = await switchRunRoleAccount('claim', '公开链接槽位已满')
                    if (!switched) {
                      throw new Error('当前这批任务账号的公开链接槽位都满了，没法继续抢注。')
                    }
                    claimByAccount = claimAccount
                    continue
                  }
                  throw error
                }
              } else if (autoCreateCarrier && createCarrierClient && createCarrierAccount) {
                const usedCount = createCarrierSuccessCountByAccount.get(createCarrierAccount.id) ?? 0
                if (usedCount >= MAX_PUBLIC_LINKS_PER_ACCOUNT) {
                  pushRunLog({
                    level: 'warning',
                    message: `建频道账号 ${readCheckResultTitle(createCarrierAccount)} 在本次任务里已经创建了 ${MAX_PUBLIC_LINKS_PER_ACCOUNT} 个公开链接，正在切下一个号继续。`,
                    sourceRef: item.sourceRef,
                    sourceTitle: item.sourceTitle,
                    candidate: item.normalized,
                    accountId: createCarrierAccount.id,
                    accountLabel: readCheckResultTitle(createCarrierAccount)
                  })
                  const switched = await switchRunRoleAccount('createCarrier', `本次任务已创建满 ${MAX_PUBLIC_LINKS_PER_ACCOUNT} 个公开链接`)
                  if (!switched) {
                    throw new Error('当前这批任务账号都已经建满公开链接了，没法继续自动建频道抢注。')
                  }
                  continue
                }

                try {
                  claimed = await createCarrierAndClaim(createCarrierClient, item, payload as unknown as OtherToolsSniperListenerPayload, createCarrierAccount.id, createdCarrierIndex)
                  createdCarrierIndex += 1
                  createCarrierSuccessCountByAccount.set(createCarrierAccount.id, usedCount + 1)
                  claimByAccount = createCarrierAccount
                  break
                } catch (error) {
                  if (isPublicLinkLimitError(error)) {
                    pushRunLog({
                      level: 'warning',
                      message: `建频道账号 ${readCheckResultTitle(createCarrierAccount)} 的公开链接槽位已经满了，正在切下一个号继续。`,
                      sourceRef: item.sourceRef,
                      sourceTitle: item.sourceTitle,
                      candidate: item.normalized,
                      accountId: createCarrierAccount.id,
                      accountLabel: readCheckResultTitle(createCarrierAccount)
                    })
                    const switched = await switchRunRoleAccount('createCarrier', '公开链接槽位已满')
                    if (!switched) {
                      throw new Error('当前这批任务账号都已经建满公开链接了，没法继续自动建频道抢注。')
                    }
                    continue
                  }
                  throw error
                }
              } else {
                item.claimStatus = 'skipped'
                item.claimMessage = carriers.length > 0
                  ? '当前池子载体已经用完了，剩余可抢名先保留在结果里。'
                  : '当前没有池子载体，也没开自动建频道占位。'
                pushRunLog({
                  level: 'warning',
                  message: carriers.length > 0
                    ? `${item.normalized} 可抢，但池子已经用完，先跳过。`
                    : `${item.normalized} 可抢，但没有可用池子/建池账号，先跳过。`,
                  sourceRef: item.sourceRef,
                  sourceTitle: item.sourceTitle,
                  candidate: item.normalized
                })
                break
              }
            }
            if (!claimed) {
              continue
            }

            item.claimStatus = 'claimed'
            item.claimMessage = claimed.claimMessage
            item.claimTargetRef = claimed.claimTargetRef
            item.claimTargetTitle = claimed.claimTargetTitle
            item.claimAccountId = claimByAccount?.id ?? null
            item.claimAccountLabel = readCheckResultTitle(claimByAccount)
            pushRunLog({
              level: 'success',
              message: claimed.createdCarrier
                ? claimed.postFailureMessage
                  ? `${item.normalized} 已自动建频道并抢到，但首帖发送失败：${claimed.postFailureMessage}`
                  : (payload.postType ?? 'none') !== 'none' && claimed.postSent
                    ? `${item.normalized} 已自动建频道、抢到并发出首帖。`
                    : `${item.normalized} 已自动建频道并抢到。`
                : `${item.normalized} 已抢到：${claimed.claimTargetRef}`,
              sourceRef: item.sourceRef,
              sourceTitle: item.sourceTitle,
              candidate: item.normalized,
              targetRef: claimed.claimTargetRef,
              accountId: claimByAccount?.id ?? null,
              accountLabel: readCheckResultTitle(claimByAccount)
            })
          } catch (error) {
            const fatal = isFatalAccountError(error)
            const fatalAccount = createCarrierAccount ?? claimAccount
            if (fatal && fatalAccount) {
              this.repository.updateStatus([fatalAccount.id], fatal.status)
            }
            item.claimStatus = 'failed'
            item.claimMessage = fatal ? `抢注账号已自动停用：${fatal.message}` : formatSniperClaimError(error)
            item.claimAccountId = (createCarrierAccount ?? claimAccount)?.id ?? null
            item.claimAccountLabel = readCheckResultTitle(createCarrierAccount ?? claimAccount)
            pushRunLog({
              level: 'error',
              message: `${item.normalized} 抢注失败：${item.claimMessage}`,
              sourceRef: item.sourceRef,
              sourceTitle: item.sourceTitle,
              candidate: item.normalized,
              accountId: (createCarrierAccount ?? claimAccount)?.id ?? null,
              accountLabel: readCheckResultTitle(createCarrierAccount ?? claimAccount)
            })
            if (fatal) {
              for (const rest of claimableItems.slice(claimableItems.indexOf(item) + 1)) {
                if (!rest.claimStatus) {
                  rest.claimStatus = 'skipped'
                  rest.claimMessage = '抢注账号已停用，本轮后续候选未继续抢。'
                }
              }
              break
            }
          }
        }
      }

      const occupied = items.filter((item) => item.category === 'occupied')
      const claimable = items.filter((item) => item.category === 'claimable')
      const forbidden = items.filter((item) => item.category === 'forbidden')
      const uncertain = items.filter((item) => item.category === 'uncertain')
      const claimed = items.filter((item) => item.claimStatus === 'claimed')
      const subscribeJoinedCount = subscribeItems.filter((item) => item.status === 'joined').length
      const subscribeAlreadyCount = subscribeItems.filter((item) => item.status === 'already').length
      const subscribeFailedCount = subscribeItems.filter((item) => item.status === 'failed').length
      const subscribeSkippedCount = subscribeItems.filter((item) => item.status === 'skipped' || item.status === 'already').length

      const summaryParts = [
        `已处理 ${sourceRefs.length} 个白名单来源`,
        `展开成 ${expandedSourceCount} 个实际频道/群/机器人来源`,
        `命中 ${items.filter((item) => item.sourceMessageId).length} 条候选`,
        `可抢 ${claimable.length} 条`
      ]
      if (payload.autoSubscribeSources && subscribeAccounts.length > 0) {
        summaryParts.push(`订阅账号 ${subscribeAccounts.length} 个，成功 ${subscribeJoinedCount}，跳过 ${subscribeSkippedCount}，失败 ${subscribeFailedCount}`)
      }
      if (chatlistJoinCount > 0) {
        summaryParts.push(`监听账号经分组链接导入 ${chatlistJoinCount} 个目标`)
      }
      if (payload.autoClaim) {
        summaryParts.push(`已抢到 ${claimed.length} 条`)
      }

      pushRunLog({
        level: 'success',
        message: `${summaryParts.join('，')}。`,
        accountId: scanAccount.id,
        accountLabel: readCheckResultTitle(scanAccount)
      })

      return {
        scanAccountId: scanAccount.id,
        scanAccountLabel: readCheckResultTitle(scanAccount),
        claimAccountId: claimAccount?.id ?? null,
        claimAccountLabel: readCheckResultTitle(claimAccount),
        sourceCount: sourceRefs.length,
        poolCount: carriers.length,
        inspectedMessageCount,
        candidateCount: items.length,
        subscribeAccountCount: subscribeAccounts.length,
        subscribeJoinedCount,
        subscribeAlreadyCount,
        subscribeFailedCount,
        subscribeSkippedCount,
        subscribeItems,
        occupied,
        claimable,
        forbidden,
        uncertain,
        claimed,
        items,
        logs,
        message: `${summaryParts.join('，')}。`
      }
    } finally {
      await this.clientManager.destroyClient(scanClient)
      if (claimClient && claimClient !== scanClient) {
        await this.clientManager.destroyClient(claimClient)
      }
      if (createCarrierClient && createCarrierClient !== scanClient && createCarrierClient !== claimClient) {
        await this.clientManager.destroyClient(createCarrierClient)
      }
      await Promise.all(Array.from(subscribeClients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    }
  }
}
