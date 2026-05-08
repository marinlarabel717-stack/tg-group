import type { AccountStatus } from '../types'
import { parseSpamBotReply } from '../check-engine/spam-bot-parser'

export function parseSpamBotStatus(replyText: string): AccountStatus {
  return parseSpamBotReply(replyText).status
}
