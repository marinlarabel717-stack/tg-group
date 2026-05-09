import { Api, TelegramClient } from 'telegram'
import { parseSpamBotReply, type SpamBotParseResult } from './spam-bot-parser'
import { getHelpersModule } from './gramjs-runtime'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractMessageText(message: unknown) {
  if (!message || typeof message !== 'object') return ''
  const candidate = message as { message?: unknown; text?: unknown }
  if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message.trim()
  if (typeof candidate.text === 'string' && candidate.text.trim()) return candidate.text.trim()
  return ''
}

function readMessageId(message: unknown) {
  if (!message || typeof message !== 'object') return 0
  const candidate = message as { id?: unknown }
  return typeof candidate.id === 'number' ? candidate.id : 0
}

function isIncomingMessage(message: unknown) {
  if (!message || typeof message !== 'object') return false
  const candidate = message as { out?: unknown }
  return !Boolean(candidate.out)
}

export interface SpamBotCheckResult extends SpamBotParseResult {
  replyText: string
  frozenByAppConfig?: boolean
  freezeSince?: string | null
  freezeUntil?: string | null
  freezeAppealUrl?: string | null
}

interface FrozenStateInfo {
  frozen: boolean
  freezeSince: string | null
  freezeUntil: string | null
  freezeAppealUrl: string | null
  errorMessage?: string | null
  reason?: string | null
  appConfigSummary?: string | null
}

const HIGH_CONFIDENCE_FREEZE_TOKENS = [
  'FREEZE_STATE_IN_APP_CONFIG',
  'FROZEN_METHOD_INVALID',
  'FROZEN_PARTICIPANT_MISSING',
  'FROZEN_KEYWORD',
  'FROZEN_RECOVERY',
  'FROZEN_NOTICE',
  'FROZEN_WARNING'
] as const

function extractRpcErrorName(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; name?: unknown; errorMessage?: unknown }
    for (const value of [candidate.errorMessage, candidate.message, candidate.name]) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim().toUpperCase()
      }
    }
  }

  return String(error ?? '').trim().toUpperCase()
}

function isFrozenRpcError(error: unknown) {
  const name = extractRpcErrorName(error)
  return name.includes('FROZEN_METHOD_INVALID') || name.includes('FROZEN_PARTICIPANT_MISSING')
}

function unwrapTlJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (Array.isArray(value)) {
    return value.map((item) => unwrapTlJsonValue(item))
  }

  if (typeof value !== 'object') return value

  const candidate = value as { className?: unknown; value?: unknown; config?: unknown; key?: unknown }
  const className = typeof candidate.className === 'string' ? candidate.className : ''

  if (className === 'help.AppConfig' && 'config' in candidate) {
    return unwrapTlJsonValue(candidate.config)
  }

  if (className === 'JsonObjectValue' && typeof candidate.key === 'string') {
    return {
      [candidate.key]: unwrapTlJsonValue(candidate.value)
    }
  }

  if (className === 'JsonObject' && Array.isArray(candidate.value)) {
    const output: Record<string, unknown> = {}
    for (const entry of candidate.value as Array<{ key?: unknown; value?: unknown }>) {
      if (typeof entry?.key === 'string') {
        output[entry.key] = unwrapTlJsonValue(entry.value)
      }
    }
    return output
  }

  if (className === 'JsonArray' && Array.isArray(candidate.value)) {
    return candidate.value.map((item) => unwrapTlJsonValue(item))
  }

  if (className === 'JsonString' || className === 'JsonNumber' || className === 'JsonBool') {
    return candidate.value
  }

  if (className === 'JsonNull') {
    return null
  }

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = unwrapTlJsonValue(item)
  }
  return output
}

function extractPrimitiveTokens(value: unknown, collector: string[] = []) {
  if (value === null || value === undefined) return collector

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    collector.push(String(value))
    return collector
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractPrimitiveTokens(item, collector)
    }
    return collector
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collector.push(key)
      extractPrimitiveTokens(item, collector)
    }
  }

  return collector
}

function hasHighConfidenceFreezeSignal(value: unknown) {
  const haystack = extractPrimitiveTokens(value).join(' ')
  return HIGH_CONFIDENCE_FREEZE_TOKENS.some((token) => haystack.includes(token))
}

function buildAppConfigSummary(value: unknown) {
  const summary: string[] = []

  const walk = (input: unknown, parentKey = '') => {
    if (!input || typeof input !== 'object' || summary.length >= 8) return

    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key
      const normalizedKey = key.toLowerCase()

      if (normalizedKey.includes('freeze') || normalizedKey.includes('frozen')) {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          summary.push(`${fullKey}=${String(item)}`)
        } else {
          summary.push(fullKey)
        }
      }

      if (item && typeof item === 'object') {
        walk(item, fullKey)
      }

      if (summary.length >= 8) break
    }
  }

  walk(value)
  return summary.length > 0 ? summary.join(', ') : '无冻结字段'
}

function normalizeTimestamp(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return normalizeTimestamp(Number(trimmed))

    const normalized = trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

function safeInt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  return 0
}

function findFreezeField(value: unknown, fieldNames: string[], visited = new Set<object>()): unknown {
  if (value === null || value === undefined) return undefined

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFreezeField(item, fieldNames, visited)
      if (found !== undefined && found !== null && found !== '') return found
    }
    return undefined
  }

  if (typeof value !== 'object') return undefined

  if (visited.has(value as object)) return undefined
  visited.add(value as object)

  const candidate = value as Record<string, unknown>
  for (const [rawKey, item] of Object.entries(candidate)) {
    const key = rawKey.toLowerCase()
    if (fieldNames.includes(key)) {
      return item
    }
  }

  for (const item of Object.values(candidate)) {
    const found = findFreezeField(item, fieldNames, visited)
    if (found !== undefined && found !== null && found !== '') return found
  }

  return undefined
}

function extractFreezeMetadata(value: unknown) {
  const freezeSinceRaw = findFreezeField(value, ['freeze_since_date', 'freeze_since', 'frozen_since_date', 'frozen_since'])
  const freezeUntilRaw = findFreezeField(value, ['freeze_until_date', 'freeze_until', 'frozen_until_date', 'frozen_until'])
  const freezeAppealRaw = findFreezeField(value, ['freeze_appeal_url', 'frozen_appeal_url', 'appeal_url'])

  return {
    freezeSince: normalizeTimestamp(freezeSinceRaw),
    freezeUntil: normalizeTimestamp(freezeUntilRaw),
    freezeAppealUrl: typeof freezeAppealRaw === 'string' && freezeAppealRaw.trim() ? freezeAppealRaw.trim() : null
  }
}

function fetchFreezeMetadataFromConfig(value: unknown) {
  const configMap = unwrapTlJsonValue(value)
  if (!configMap || typeof configMap !== 'object' || Array.isArray(configMap)) {
    return {
      freezeSince: null,
      freezeUntil: null,
      freezeAppealUrl: null,
      hasFreezeDate: false,
      plainConfig: configMap
    }
  }

  const map = configMap as Record<string, unknown>
  const freezeSinceDate = safeInt(map.freeze_since_date)
  const freezeUntilDate = safeInt(map.freeze_until_date)
  const freezeAppealUrl = typeof map.freeze_appeal_url === 'string' && map.freeze_appeal_url.trim()
    ? map.freeze_appeal_url.trim()
    : null

  return {
    freezeSince: normalizeTimestamp(freezeSinceDate),
    freezeUntil: normalizeTimestamp(freezeUntilDate),
    freezeAppealUrl,
    hasFreezeDate: freezeSinceDate > 0 || freezeUntilDate > 0,
    plainConfig: configMap
  }
}

function extractFrozenStateInfo(value: unknown, visited = new Set<object>()) {
  const exactMetadata = extractFreezeMetadata(value)
  const info: FrozenStateInfo = {
    frozen: false,
    freezeSince: exactMetadata.freezeSince,
    freezeUntil: exactMetadata.freezeUntil,
    freezeAppealUrl: exactMetadata.freezeAppealUrl
  }

  const walk = (input: unknown) => {
    if (input === null || input === undefined) return

    if (typeof input === 'string') {
      const normalized = input.toLowerCase()
      if (/frozen|freeze_state|freeze/.test(normalized)) {
        info.frozen = true
      }

      if (!info.freezeAppealUrl && /^https?:\/\//i.test(input.trim())) {
        info.freezeAppealUrl = input.trim()
      }
      return
    }

    if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
      return
    }

    if (Array.isArray(input)) {
      for (const item of input) walk(item)
      return
    }

    if (typeof input === 'object') {
      if (visited.has(input as object)) return
      visited.add(input as object)

      for (const [rawKey, item] of Object.entries(input as Record<string, unknown>)) {
        const key = rawKey.toLowerCase()

        if (key.includes('freeze')) {
          info.frozen = true
        }

        if (!info.freezeSince && (key === 'freeze_since_date' || key === 'freeze_since' || key === 'frozen_since_date' || key === 'frozen_since')) {
          info.freezeSince = normalizeTimestamp(item)
        }

        if (!info.freezeUntil && (key === 'freeze_until_date' || key === 'freeze_until' || key === 'frozen_until_date' || key === 'frozen_until')) {
          info.freezeUntil = normalizeTimestamp(item)
        }

        if (!info.freezeAppealUrl && (key === 'freeze_appeal_url' || key === 'frozen_appeal_url' || key === 'appeal_url')) {
          if (typeof item === 'string' && item.trim()) {
            info.freezeAppealUrl = item.trim()
          }
        }

        walk(item)
      }
    }
  }

  walk(value)
  return info
}

export class SpamBotChecker {
  private buildSpamBotResult(replyText: string, frozenState: FrozenStateInfo): SpamBotCheckResult {
    const parsed = parseSpamBotReply(replyText)
    const replyFrozen = parsed.status === 'frozen'
    const finalFrozen = frozenState.frozen || replyFrozen
    const hasFreezeTime = Boolean(frozenState.freezeSince || frozenState.freezeUntil || frozenState.freezeAppealUrl)

    return {
      ...parsed,
      status: finalFrozen ? 'frozen' : parsed.status,
      summary: finalFrozen
        ? hasFreezeTime
          ? '账号处于冻结状态'
          : '账号处于冻结状态（冻结时间未返回）'
        : parsed.summary,
      replyText,
      frozenByAppConfig: frozenState.frozen,
      freezeSince: frozenState.freezeSince ?? null,
      freezeUntil: frozenState.freezeUntil ?? null,
      freezeAppealUrl: frozenState.freezeAppealUrl ?? null
    }
  }

  async detectFrozenState(client: TelegramClient) {
    try {
      const appConfig = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }))
      const metadata = fetchFreezeMetadataFromConfig(appConfig)
      const plainConfig = metadata.plainConfig
      const extracted = extractFrozenStateInfo(plainConfig)
      const haystack = extractPrimitiveTokens(plainConfig).join(' ').toLowerCase()
      const highConfidenceFrozen = hasHighConfidenceFreezeSignal(plainConfig)
      return {
        ...extracted,
        freezeSince: metadata.freezeSince ?? extracted.freezeSince,
        freezeUntil: metadata.freezeUntil ?? extracted.freezeUntil,
        freezeAppealUrl: metadata.freezeAppealUrl ?? extracted.freezeAppealUrl,
        frozen: metadata.hasFreezeDate || highConfidenceFrozen || extracted.frozen || /frozen|freeze_state|freeze/.test(haystack),
        errorMessage: null,
        reason: metadata.hasFreezeDate ? 'FREEZE_STATE_IN_APP_CONFIG' : highConfidenceFrozen ? 'FREEZE_STATE_IN_APP_CONFIG' : null,
        appConfigSummary: buildAppConfigSummary(plainConfig)
      }
    } catch (error) {
      return {
        frozen: false,
        freezeSince: null,
        freezeUntil: null,
        freezeAppealUrl: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        reason: null,
        appConfigSummary: null
      }
    }
  }

  async probeFrozenBySelfMessage(client: TelegramClient): Promise<FrozenStateInfo> {
    const probeText = '/start'
    const { generateRandomLong } = getHelpersModule()
    const randomId = generateRandomLong(true)

    try {
      const peer = await client.getEntity('SpamBot')
      const message = await client.invoke(new Api.messages.SendMessage({
        peer,
        message: probeText,
        randomId,
        noWebpage: true,
        silent: true,
        clearDraft: true
      }))

      return {
        frozen: false,
        freezeSince: null,
        freezeUntil: null,
        freezeAppealUrl: null,
        errorMessage: null,
        reason: 'SPAMBOT_WRITE_OK',
        appConfigSummary: null
      }
    } catch (error) {
      if (isFrozenRpcError(error)) {
        const metadata = await this.detectFrozenState(client)
        return {
          ...metadata,
          frozen: true,
          errorMessage: null,
          reason: extractRpcErrorName(error)
        }
      }

      return {
        frozen: false,
        freezeSince: null,
        freezeUntil: null,
        freezeAppealUrl: null,
        errorMessage: error instanceof Error ? error.message : String(error),
        reason: extractRpcErrorName(error) || 'SELF_PROBE_FAILED',
        appConfigSummary: null
      }
    }
  }

  async check(client: TelegramClient): Promise<SpamBotCheckResult> {
    const frozenStateBeforeSpamBot = await this.detectFrozenState(client)
    if (frozenStateBeforeSpamBot.frozen) {
      return {
        status: 'frozen',
        normalizedText: '',
        summary: '账号处于冻结状态',
        replyText: '',
        frozenByAppConfig: true,
        freezeSince: frozenStateBeforeSpamBot.freezeSince,
        freezeUntil: frozenStateBeforeSpamBot.freezeUntil,
        freezeAppealUrl: frozenStateBeforeSpamBot.freezeAppealUrl
      }
    }

    const entity = await client.getEntity('SpamBot')
    const beforeMessages = await client.getMessages(entity, { limit: 1 })
    const beforeId = beforeMessages[0] ? readMessageId(beforeMessages[0]) : 0

    await client.sendMessage(entity, { message: '/start' })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sleep(1200)
      const messages = await client.getMessages(entity, { limit: 5 })
      const reply = messages.find((message) => isIncomingMessage(message) && readMessageId(message) > beforeId && extractMessageText(message))

      if (reply) {
        const replyText = extractMessageText(reply)
        const frozenState = await this.detectFrozenState(client)
        return this.buildSpamBotResult(replyText, frozenState)
      }
    }

    const fallbackMessages = await client.getMessages(entity, { limit: 5 })
    const fallbackReply = fallbackMessages.find((message) => isIncomingMessage(message) && extractMessageText(message))
    if (fallbackReply) {
      const replyText = extractMessageText(fallbackReply)
      const frozenState = await this.detectFrozenState(client)
      return this.buildSpamBotResult(replyText, frozenState)
    }

    const frozenStateAfterTimeout = await this.detectFrozenState(client)
    if (frozenStateAfterTimeout.frozen) {
      return {
        status: 'frozen',
        normalizedText: '',
        summary: '账号处于冻结状态',
        replyText: '',
        frozenByAppConfig: true,
        freezeSince: frozenStateAfterTimeout.freezeSince,
        freezeUntil: frozenStateAfterTimeout.freezeUntil,
        freezeAppealUrl: frozenStateAfterTimeout.freezeAppealUrl
      }
    }

    return {
      status: 'timeout',
      normalizedText: '',
      summary: '未在超时时间内收到 SpamBot 回复',
      replyText: '',
      frozenByAppConfig: false,
      freezeSince: null,
      freezeUntil: null,
      freezeAppealUrl: null
    }
  }

  async getFullProfile(client: TelegramClient) {
    return client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }))
  }
}
