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

  await client.connect()
  const authorized = await client.isUserAuthorized()
  if (!authorized) {
    await clientManager.destroyClient(client)
    throw new Error('AUTH_KEY_UNREGISTERED')
  }

  return client
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

interface ActiveSniperListenerTask {
  id: string
  cancelled: boolean
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

function isFatalAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) {
    return { status: 'session_expired' as const, message: '登录失效' }
  }
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) {
    return { status: 'banned' as const, message: '账号封禁' }
  }
  if (/ACCOUNT_RESTRICTED/i.test(message)) {
    return { status: 'not_logged_in' as const, message: '账号受限' }
  }
  return null
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

function formatSniperPostError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(message)) return '图片格式不对，Telegram 没收下。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(message)) return '文案太长了，发不出去。'
  if (/CHAT_SEND_MEDIA_FORBIDDEN/i.test(message)) return '这个频道当前不允许发媒体。'
  if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED/i.test(message)) return '这个频道当前没有发帖权限。'
  return `首帖发送失败：${message}`
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
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) return '抢注账号登录失效了。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) return '抢注账号已经封禁了。'
  if (/ACCOUNT_RESTRICTED/i.test(message)) return '抢注账号当前受限，不能继续占位。'
  if (/CHAT_ADMIN_REQUIRED/i.test(message)) return '这个池子载体不是当前账号真正可控的管理员对象。'
  return `抢注失败：${message}`
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
      status: 'already' as const,
      source: resolved,
      message: '这个账号已经在该频道/群里了。'
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
  if (/USER_ALREADY_PARTICIPANT/i.test(message)) return '这个账号已经在目标里了。'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(message)) return '这个账号加入得太多了，Telegram 不让继续加。'
  if (/INVITE_SLUG_EXPIRED|SLUG_EXPIRED/i.test(message)) return '这个分组分享链接已经失效了。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) return '这个账号登录已经失效。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) return '这个账号已经被封。'
  if (/ACCOUNT_RESTRICTED/i.test(message)) return '这个账号当前受限。'
  return `加入失败：${message}`
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
          items.push({
            id: createId('subscribe-item'),
            accountId: account.id,
            accountLabel: readCheckResultTitle(account),
            sourceRef: ref,
            sourceTitle: '分组分享链接',
            sourceKind: 'chatlist',
            status: 'already',
            message: '这个账号已经导入过该分组里的目标，当前没有新的频道/群需要加入。'
          })
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
      pollIntervalSeconds: 15,
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
    task.state.logs = [next, ...task.state.logs].slice(0, 80)
    task.state.message = next.message
    this.emitSniperListenerState(task)
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
    const scanAccount = pickCheckAccount(accounts, payload.scanAccountId ?? null)
    if (!scanAccount) {
      throw new Error('当前没有可用监听账号。')
    }

    const claimAccount = payload.autoClaim
      ? pickCheckAccount(accounts, payload.claimAccountId ?? payload.scanAccountId ?? null)
      : null
    if (payload.autoClaim && !claimAccount && !payload.autoCreateCarrier) {
      throw new Error('当前没有可用抢注账号。')
    }

    const createCarrierAccount = payload.autoCreateCarrier
      ? pickCheckAccount(accounts, payload.createCarrierAccountId ?? payload.claimAccountId ?? payload.scanAccountId ?? null)
      : null
    if (payload.autoCreateCarrier && !createCarrierAccount) {
      throw new Error('已开启自动建频道占位，但当前没有可用建池账号。')
    }

    const subscribeAccountIds = Array.from(new Set((payload.subscribeAccountIds ?? []).filter((item): item is number => typeof item === 'number')))
    const subscribeAccounts = payload.autoSubscribeSources
      ? accounts.filter((account) => subscribeAccountIds.includes(account.id) && !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
      : []
    const pollIntervalSeconds = Math.max(5, Math.min(300, Math.trunc(payload.pollIntervalSeconds || 15)))
    const sourceLimit = Math.max(1, Math.min(100, Math.trunc(payload.sourceMessageLimit || 20)))
    const candidateLimit = Math.max(1, Math.min(500, Math.trunc(payload.candidateLimit || 100)))
    const includeKeywords = normalizeKeywordSet(payload.includeKeywords)
    const excludeKeywords = normalizeKeywordSet(payload.excludeKeywords)

    const task: ActiveSniperListenerTask = {
      id: createId('sniper-listener'),
      cancelled: false,
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
      scanClient: null,
      claimClient: null,
      createCarrierClient: null,
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

        if (payload.autoSubscribeSources && subscribeAccounts.length > 0) {
          for (const account of subscribeAccounts) {
            let client = task.subscribeClients.get(account.id) ?? null
            if (!client) {
              client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
              task.subscribeClients.set(account.id, client)
            }
            const subscribeItems = await subscribeSourcesForAccount(client, account, sourceRefs)
            const joinedCount = subscribeItems.filter((item) => item.status === 'joined').length
            const failedCount = subscribeItems.filter((item) => item.status === 'failed').length
            if (joinedCount > 0) {
              this.pushSniperListenerLog(task, {
                level: 'success',
                message: `${readCheckResultTitle(account)} 已预先订阅 ${joinedCount} 个来源目标。`,
                accountId: account.id,
                accountLabel: readCheckResultTitle(account)
              })
            }
            if (failedCount > 0) {
              this.pushSniperListenerLog(task, {
                level: 'warning',
                message: `${readCheckResultTitle(account)} 订阅来源时有 ${failedCount} 条失败。`,
                accountId: account.id,
                accountLabel: readCheckResultTitle(account)
              })
            }
          }
        }

        task.state.message = '监听已启动，正在进入 Telethon 主链路…'
        this.pushSniperListenerLog(task, {
          level: 'success',
          message: `监听已启动：${readCheckResultTitle(scanAccount)} 已切到 Telethon 主链路。`,
          accountId: scanAccount.id,
          accountLabel: readCheckResultTitle(scanAccount)
        })

        while (!task.cancelled) {
          task.state.lastTickAt = new Date().toISOString()
          this.emitSniperListenerState(task)

          const scanResult = await this.telethonSniperService.scanSources({
            sessionPath: scanAccount.sessionPath,
            sourceRefs,
            sourceMessageLimit: sourceLimit,
            includeKeywords,
            excludeKeywords,
            seenMessageKeys: Array.from(task.seenMessageKeys),
            handledCandidateKeys: Array.from(task.handledCandidateKeys),
            joinChatlists: joinChatlistsOnFirstTick,
            proxy: readCurrentProxyOrThrow(this.proxyPoolService)
          })
          joinChatlistsOnFirstTick = false

          task.state.expandedSourceCount = scanResult.expandedSourceCount
          task.state.checkedMessageCount += scanResult.checkedMessageCount
          task.state.candidateCount += scanResult.candidateCount
          for (const key of scanResult.newSeenMessageKeys) {
            task.seenMessageKeys.add(key)
          }
          task.state.seenMessageCount = task.seenMessageKeys.size
          task.state.message = `监听运行中：当前盯着 ${scanResult.expandedSourceCount} 个实际来源。`

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

            try {
              let claimed: ListenerClaimResult | null = null
              let claimByAccount: AccountRecord | null = claimAccount
              const proxy = readCurrentProxyOrThrow(this.proxyPoolService)

              if (carrierIndex < poolRefs.length && claimAccount) {
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
              } else if (payload.autoCreateCarrier && createCarrierAccount) {
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
                const fatalAccountId = createCarrierAccount?.id ?? claimAccount?.id ?? null
                if (fatalAccountId) {
                  this.repository.updateStatus([fatalAccountId], fatal.status)
                }
              }
              this.pushSniperListenerLog(task, {
                level: 'error',
                message: `命中 ${item.normalized} 但抢注失败：${fatal ? `账号已停用（${fatal.message}）` : formatSniperClaimError(error)}`,
                sourceRef: item.sourceRef,
                sourceTitle: item.sourceTitle,
                candidate: item.normalized,
                accountId: createCarrierAccount?.id ?? claimAccount?.id ?? null,
                accountLabel: readCheckResultTitle(createCarrierAccount ?? claimAccount)
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
          message: `监听启动失败：${error instanceof Error ? error.message : String(error)}`
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
    const scanAccount = pickCheckAccount(accounts, payload.scanAccountId ?? null)
    if (!scanAccount) {
      throw new Error('当前没有可用监听账号，没法去白名单来源里巡检。')
    }

    const claimAccount = payload.autoClaim
      ? pickCheckAccount(accounts, payload.claimAccountId ?? payload.scanAccountId ?? null)
      : null
    const autoCreateCarrier = Boolean(payload.autoCreateCarrier)
    const createCarrierAccount = autoCreateCarrier
      ? pickCheckAccount(accounts, payload.createCarrierAccountId ?? payload.claimAccountId ?? payload.scanAccountId ?? null)
      : null
    const subscribeAccountIds = Array.from(new Set((payload.subscribeAccountIds ?? []).filter((item): item is number => typeof item === 'number')))
    const subscribeAccounts = payload.autoSubscribeSources
      ? accounts.filter((account) => subscribeAccountIds.includes(account.id) && !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
      : []
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

    const scanClient = await ensureAuthorizedClient(scanAccount, this.sessionLoader, this.clientManager, this.proxyPoolService)
    const claimClient = payload.autoClaim && claimAccount
      ? (claimAccount.id === scanAccount.id ? scanClient : await ensureAuthorizedClient(claimAccount as AccountRecord, this.sessionLoader, this.clientManager, this.proxyPoolService))
      : null
    const createCarrierClient = autoCreateCarrier && createCarrierAccount
      ? (createCarrierAccount.id === scanAccount.id
        ? scanClient
        : claimClient && createCarrierAccount.id === claimAccount?.id
          ? claimClient
          : await ensureAuthorizedClient(createCarrierAccount, this.sessionLoader, this.clientManager, this.proxyPoolService))
      : null
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
      let inspectedMessageCount = 0
      let expandedSourceCount = 0
      let chatlistJoinCount = 0

      pushRunLog({
        level: 'info',
        message: `开始巡检：${readCheckResultTitle(scanAccount)} 正在检查 ${sourceRefs.length} 个来源。`,
        accountId: scanAccount.id,
        accountLabel: readCheckResultTitle(scanAccount)
      })

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
            const alreadyCount = accountItems.filter((item) => item.status === 'already').length
            const failedCount = accountItems.filter((item) => item.status === 'failed').length
            pushRunLog({
              level: failedCount > 0 ? 'warning' : 'success',
              message: `${readCheckResultTitle(account)} 来源订阅完成：成功 ${joinedCount}，已在内 ${alreadyCount}，失败 ${failedCount}。`,
              accountId: account.id,
              accountLabel: readCheckResultTitle(account)
            })
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
            let claimed: ListenerClaimResult
            let claimByAccount: AccountRecord | null = claimAccount

            if (carrierIndex < carriers.length && claimClient) {
              const carrier = carriers[carrierIndex]
              const poolClaimed = await claimCandidateWithPool(claimClient, carrier, item)
              claimed = {
                claimTargetTitle: poolClaimed.claimTargetTitle,
                claimTargetRef: poolClaimed.claimTargetRef,
                claimMessage: poolClaimed.claimMessage,
                createdCarrier: false
              }
              carrierIndex += 1
            } else if (autoCreateCarrier && createCarrierClient && createCarrierAccount) {
              claimed = await createCarrierAndClaim(createCarrierClient, item, payload as OtherToolsSniperListenerPayload, createCarrierAccount.id, createdCarrierIndex)
              createdCarrierIndex += 1
              claimByAccount = createCarrierAccount
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
      const subscribeSkippedCount = subscribeItems.filter((item) => item.status === 'skipped').length

      const summaryParts = [
        `已处理 ${sourceRefs.length} 个白名单来源`,
        `展开成 ${expandedSourceCount} 个实际频道/群/机器人来源`,
        `命中 ${items.filter((item) => item.sourceMessageId).length} 条候选`,
        `可抢 ${claimable.length} 条`
      ]
      if (payload.autoSubscribeSources && subscribeAccounts.length > 0) {
        summaryParts.push(`订阅账号 ${subscribeAccounts.length} 个，成功 ${subscribeJoinedCount}，已在内 ${subscribeAlreadyCount}，失败 ${subscribeFailedCount}`)
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
