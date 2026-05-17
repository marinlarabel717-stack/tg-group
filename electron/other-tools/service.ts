import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type {
  OtherToolsUsernameFilterItem,
  OtherToolsUsernameFilterPayload,
  OtherToolsUsernameFilterResult,
  OtherToolsSniperCandidateItem,
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

function formatSniperClaimError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
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
  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

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

  async scanAndClaim(payload: OtherToolsSniperPayload): Promise<OtherToolsSniperResult> {
    const sourceRefs = splitLines(payload.sourceInput)
    const poolRefs = splitLines(payload.poolInput)
    if (sourceRefs.length === 0) {
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
    const subscribeAccountIds = Array.from(new Set((payload.subscribeAccountIds ?? []).filter((item): item is number => typeof item === 'number')))
    const subscribeAccounts = payload.autoSubscribeSources
      ? accounts.filter((account) => subscribeAccountIds.includes(account.id) && !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
      : []
    if (payload.autoClaim && !claimAccount) {
      throw new Error('当前没有可用抢注账号。')
    }
    if (payload.autoClaim && poolRefs.length === 0) {
      throw new Error('已开启自动抢注，但还没有填写池子载体。')
    }

    const includeKeywords = normalizeKeywordSet(payload.includeKeywords)
    const excludeKeywords = normalizeKeywordSet(payload.excludeKeywords)
    const sourceLimit = Math.max(1, Math.min(100, Math.trunc(payload.sourceMessageLimit || 20)))
    const candidateLimit = Math.max(1, Math.min(500, Math.trunc(payload.candidateLimit || 100)))

    const scanClient = await ensureAuthorizedClient(scanAccount, this.sessionLoader, this.clientManager, this.proxyPoolService)
    const claimClient = payload.autoClaim
      ? (claimAccount && claimAccount.id === scanAccount.id ? scanClient : await ensureAuthorizedClient(claimAccount as AccountRecord, this.sessionLoader, this.clientManager, this.proxyPoolService))
      : null
    const subscribeClients = new Map<number, TelegramClient>()

    try {
      const items: OtherToolsSniperCandidateItem[] = []
      const subscribeItems: OtherToolsSourceSubscribeItem[] = []
      const seenCandidates = new Set<string>()
      let inspectedMessageCount = 0
      let expandedSourceCount = 0
      let chatlistJoinCount = 0

      if (payload.autoSubscribeSources && subscribeAccounts.length > 0) {
        for (const account of subscribeAccounts) {
          try {
            const client = account.id === scanAccount.id ? scanClient : await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
            if (client !== scanClient) {
              subscribeClients.set(account.id, client)
            }
            const accountItems = await subscribeSourcesForAccount(client, account, sourceRefs)
            subscribeItems.push(...accountItems)
          } catch (error) {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
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
      if (payload.autoClaim && claimClient) {
        carriers = await readPoolCarriers(claimClient, poolRefs)
        let carrierIndex = 0
        for (const item of claimableItems) {
          if (carrierIndex >= carriers.length) {
            item.claimStatus = 'skipped'
            item.claimMessage = '当前池子载体已经用完了，剩余可抢名先保留在结果里。'
            continue
          }

          const carrier = carriers[carrierIndex]
          try {
            const claimed = await claimCandidateWithPool(claimClient, carrier, item)
            item.claimStatus = 'claimed'
            item.claimMessage = claimed.claimMessage
            item.claimTargetRef = claimed.claimTargetRef
            item.claimTargetTitle = claimed.claimTargetTitle
            item.claimAccountId = claimAccount?.id ?? null
            item.claimAccountLabel = readCheckResultTitle(claimAccount)
            carrierIndex += 1
          } catch (error) {
            const fatal = isFatalAccountError(error)
            if (fatal && claimAccount) {
              this.repository.updateStatus([claimAccount.id], fatal.status)
            }
            item.claimStatus = 'failed'
            item.claimMessage = fatal ? `抢注账号已自动停用：${fatal.message}` : formatSniperClaimError(error)
            item.claimAccountId = claimAccount?.id ?? null
            item.claimAccountLabel = readCheckResultTitle(claimAccount)
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
        message: `${summaryParts.join('，')}。`
      }
    } finally {
      await this.clientManager.destroyClient(scanClient)
      if (claimClient && claimClient !== scanClient) {
        await this.clientManager.destroyClient(claimClient)
      }
      await Promise.all(Array.from(subscribeClients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    }
  }
}
