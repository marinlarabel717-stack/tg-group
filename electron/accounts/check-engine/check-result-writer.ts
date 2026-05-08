import type { AccountRecord, CheckResultInput } from '../types'
import type { AccountRepository } from '../services/account-repository'

interface CheckResultWriterOptions {
  onWrite?: (accounts: AccountRecord[]) => void
}

export class CheckResultWriter {
  private readonly onWrite?: (accounts: AccountRecord[]) => void

  constructor(private readonly repository: AccountRepository, options: CheckResultWriterOptions = {}) {
    this.onWrite = options.onWrite
  }

  write(result: CheckResultInput) {
    const accounts = this.repository.applyCheckResults([result])
    this.onWrite?.(accounts)
    return accounts
  }
}
