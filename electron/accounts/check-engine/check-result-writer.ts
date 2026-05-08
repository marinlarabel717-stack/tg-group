import type { CheckResultInput } from '../types'
import type { AccountRepository } from '../services/account-repository'

export class CheckResultWriter {
  constructor(private readonly repository: AccountRepository) {}

  write(result: CheckResultInput) {
    return this.repository.applyCheckResults([result])
  }
}
