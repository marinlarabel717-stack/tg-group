import { Api, TelegramClient } from 'telegram'
import { parseSpamBotReply, type SpamBotParseResult } from './spam-bot-parser'

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

function normalizeTimestamp(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+$/.test(trimmed)) return normalizeTimestamp(Number(trimmed))

    const normalized = trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

function extractFrozenStateInfo(value: unknown, visited = new Set<object>()) {
  const info: FrozenStateInfo = {
    frozen: false,
    freezeSince: null,
    freezeUntil: null,
    freezeAppealUrl: null
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
  async detectFrozenState(client: TelegramClient) {
    try {
      const appConfig = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }))
      const extracted = extractFrozenStateInfo(appConfig)
      const haystack = extractPrimitiveTokens(appConfig).join(' ').toLowerCase()
      return {
        ...extracted,
        frozen: extracted.frozen || /frozen|freeze_state|freeze/.test(haystack)
      }
    } catch {
      return {
        frozen: false,
        freezeSince: null,
        freezeUntil: null,
        freezeAppealUrl: null
      }
    }
  }

  async check(client: TelegramClient): Promise<SpamBotCheckResult> {
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
        const parsed = parseSpamBotReply(replyText)
        return {
          ...parsed,
          status: frozenState.frozen ? 'frozen' : parsed.status,
          summary: frozenState.frozen ? '账号处于冻结状态' : parsed.summary,
          replyText,
          frozenByAppConfig: frozenState.frozen,
          freezeSince: frozenState.freezeSince,
          freezeUntil: frozenState.freezeUntil,
          freezeAppealUrl: frozenState.freezeAppealUrl
        }
      }
    }

    const fallbackMessages = await client.getMessages(entity, { limit: 5 })
    const fallbackReply = fallbackMessages.find((message) => isIncomingMessage(message) && extractMessageText(message))
    if (fallbackReply) {
      const replyText = extractMessageText(fallbackReply)
      const frozenState = await this.detectFrozenState(client)
      const parsed = parseSpamBotReply(replyText)
      return {
        ...parsed,
        status: frozenState.frozen ? 'frozen' : parsed.status,
        summary: frozenState.frozen ? '账号处于冻结状态' : parsed.summary,
        replyText,
        frozenByAppConfig: frozenState.frozen,
        freezeSince: frozenState.freezeSince,
        freezeUntil: frozenState.freezeUntil,
        freezeAppealUrl: frozenState.freezeAppealUrl
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
