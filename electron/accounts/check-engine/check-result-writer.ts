import type { AccountRecord, CheckResultInput } from '../types'
import type { AccountRepository } from '../services/account-repository'

interface CheckResultWriterOptions {
  onWrite?: (accounts: AccountRecord[]) => void
}

const CHECK_RESULT_WRITE_BATCH_SIZE = 25
const CHECK_RESULT_WRITE_DELAY_MS = 180

export class CheckResultWriter {
  private readonly onWrite?: (accounts: AccountRecord[]) => void
  private pendingResults: CheckResultInput[] = []
  private flushTimer: NodeJS.Timeout | null = null

  constructor(private readonly repository: AccountRepository, options: CheckResultWriterOptions = {}) {
    this.onWrite = options.onWrite
  }

  write(result: CheckResultInput) {
    this.pendingResults.push(result)

    if (this.pendingResults.length >= CHECK_RESULT_WRITE_BATCH_SIZE) {
      return this.flush()
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, CHECK_RESULT_WRITE_DELAY_MS)
    }

    return []
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.pendingResults.length === 0) {
      return []
    }

    const batch = this.pendingResults
    this.pendingResults = []

    if (this.onWrite) {
      const accounts = this.repository.applyCheckResults(batch)
      this.onWrite(accounts)
      return accounts
    }

    this.repository.applyCheckResults(batch, { returnAccounts: false })
    return []
  }
}
