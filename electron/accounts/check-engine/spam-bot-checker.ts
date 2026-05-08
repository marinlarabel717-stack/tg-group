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

export class SpamBotChecker {
  async detectFrozenState(client: TelegramClient) {
    try {
      const appConfig = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }))
      const haystack = extractPrimitiveTokens(appConfig).join(' ').toLowerCase()
      return /frozen|freeze_state|freeze/.test(haystack)
    } catch {
      return false
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
        const frozenByAppConfig = await this.detectFrozenState(client)
        const parsed = parseSpamBotReply(replyText)
        return {
          ...parsed,
          status: frozenByAppConfig ? 'frozen' : parsed.status,
          summary: frozenByAppConfig ? '账号处于冻结状态' : parsed.summary,
          replyText,
          frozenByAppConfig
        }
      }
    }

    const fallbackMessages = await client.getMessages(entity, { limit: 5 })
    const fallbackReply = fallbackMessages.find((message) => isIncomingMessage(message) && extractMessageText(message))
    if (fallbackReply) {
      const replyText = extractMessageText(fallbackReply)
      const frozenByAppConfig = await this.detectFrozenState(client)
      const parsed = parseSpamBotReply(replyText)
      return {
        ...parsed,
        status: frozenByAppConfig ? 'frozen' : parsed.status,
        summary: frozenByAppConfig ? '账号处于冻结状态' : parsed.summary,
        replyText,
        frozenByAppConfig
      }
    }

    return {
      status: 'timeout',
      normalizedText: '',
      summary: '未在超时时间内收到 SpamBot 回复',
      replyText: '',
      frozenByAppConfig: false
    }
  }

  async getFullProfile(client: TelegramClient) {
    return client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }))
  }
}
