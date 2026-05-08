import type { AccountRepository } from './account-repository'
import type { CheckResultInput, StatusUpdateResult } from '../types'
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

  applyCheckResults(items: CheckResultInput[]): StatusUpdateResult {
    const normalizedItems = items.filter((item) => Number.isFinite(item.id))
    const accounts = this.repository.applyCheckResults(normalizedItems)
    const status = normalizedItems.length > 0 ? normalizedItems[0].status : 'unknown'

    return {
      updatedCount: normalizedItems.length,
      status,
      accounts
    }
  }
}
