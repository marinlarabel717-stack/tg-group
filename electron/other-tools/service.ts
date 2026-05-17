import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type { OtherToolsUsernameFilterItem, OtherToolsUsernameFilterPayload, OtherToolsUsernameFilterResult } from '../../src/types'

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

async function resolveUsernameState(client: TelegramClient, item: NormalizedCandidate): Promise<OtherToolsUsernameFilterItem> {
  if (!item.candidate) {
    return buildForbiddenItem(item, item.invalidReason || '当前内容无法识别成公开用户名')
  }

  if (!isCandidatePatternAcceptable(item.candidate)) {
    return buildForbiddenItem(item, '清洗后仍不符合 Telegram 用户名规则，不能继续占位')
  }

  try {
    const entity = await client.getEntity(`https://t.me/${item.candidate}` as never)
    const entityType = readEntityType(entity)
    return {
      raw: item.raw,
      normalized: item.normalized,
      category: 'valid',
      kind: item.kind,
      reason: `已查到真实${readEntityLabel(entityType)}，这个用户名当前是存在的。`,
      entityType
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (!isNotOccupiedError(message) && !isResolvableOccupiedError(message) && !isExplicitlyForbiddenError(message)) {
      return buildForbiddenItem(item, `查询失败：${message}`)
    }

    if (isResolvableOccupiedError(message)) {
      return {
        raw: item.raw,
        normalized: item.normalized,
        category: 'valid',
        kind: item.kind,
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
        raw: item.raw,
        normalized: item.normalized,
        category: 'occupiable',
        kind: item.kind,
        reason: item.cleanedFromRaw
          ? `原值本身不可直接用，但清洗成 ${item.normalized} 后可以继续占位。`
          : '当前没有真实目标占用这个用户名，可以继续占位。',
        entityType: 'unknown'
      }
    }

    return {
      raw: item.raw,
      normalized: item.normalized,
      category: 'valid',
      kind: item.kind,
      reason: '这个用户名当前已被 Telegram 占用，不属于可占位状态。',
      entityType: 'unknown'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isExplicitlyForbiddenError(message)) {
      return buildForbiddenItem(item, '这个用户名属于违禁、保留或不可用状态，不能继续占位。')
    }
    if (isResolvableOccupiedError(message)) {
      return {
        raw: item.raw,
        normalized: item.normalized,
        category: 'valid',
        kind: item.kind,
        reason: '这个用户名当前已被占用，可视为真实存在的公开用户名。',
        entityType: 'unknown'
      }
    }
    return buildForbiddenItem(item, `检查占位状态失败：${message}`)
  }
}

function pickCheckAccount(accounts: AccountRecord[]) {
  const preferred = accounts.find((account) => !['banned', 'frozen', 'session_expired', 'not_logged_in'].includes(account.status))
  return preferred ?? accounts[0] ?? null
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
          ...result,
          checkedAccountId: account.id,
          checkedAccountLabel: account.phone || `ID ${account.id}`
        })
      }

      const valid = items.filter((item) => item.category === 'valid')
      const occupiable = items.filter((item) => item.category === 'occupiable')
      const forbidden = items.filter((item) => item.category === 'forbidden')

      return {
        accountId: account.id,
        accountLabel: account.phone || `ID ${account.id}`,
        total: items.length,
        checkedCount: items.length,
        valid,
        occupiable,
        forbidden,
        items,
        message: `已通过账号 ${account.phone || `ID ${account.id}`} 实查 ${items.length} 条。`
      }
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }
}
