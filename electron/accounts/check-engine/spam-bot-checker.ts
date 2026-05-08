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
}

export class SpamBotChecker {
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
        return {
          ...parseSpamBotReply(replyText),
          replyText
        }
      }
    }

    const fallbackMessages = await client.getMessages(entity, { limit: 5 })
    const fallbackReply = fallbackMessages.find((message) => isIncomingMessage(message) && extractMessageText(message))
    if (fallbackReply) {
      const replyText = extractMessageText(fallbackReply)
      return {
        ...parseSpamBotReply(replyText),
        replyText
      }
    }

    return {
      status: 'timeout',
      normalizedText: '',
      summary: '未在超时时间内收到 SpamBot 回复',
      replyText: ''
    }
  }

  async getFullProfile(client: TelegramClient) {
    return client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }))
  }
}
