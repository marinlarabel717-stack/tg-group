import type { AccountRepository } from './account-repository'
import type { StatusUpdateResult } from '../types'
import { parseSpamBotStatus } from './spam-bot-status-parser'

export class AccountStatusService {
  constructor(private readonly repository: AccountRepository) {}

  markChecking(ids: number[]): StatusUpdateResult {
    const accounts = this.repository.updateStatus(ids, 'checking')
    return {
      updatedCount: ids.length,
      status: 'checking',
      accounts
    }
  }

  applySpamBotReply(ids: number[], replyText: string): StatusUpdateResult {
    const status = parseSpamBotStatus(replyText)
    const accounts = this.repository.updateStatus(ids, status)

    return {
      updatedCount: ids.length,
      status,
      accounts
    }
  }
}
