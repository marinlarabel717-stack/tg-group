export const ACCOUNT_STATUS_VALUES = [
  'alive',
  'frozen',
  'banned',
  'limited',
  'temporary_limited',
  'session_expired',
  'multi_ip',
  'timeout_unchecked',
  'checking',
  'unknown'
] as const

export type AccountStatus = (typeof ACCOUNT_STATUS_VALUES)[number]

export interface AccountRecord {
  id: number
  phone: string
  username: string
  userId: string
  country: string
  sessionPath: string
  jsonPath: string
  status: AccountStatus
  lastCheckTime: string | null
  lastOnlineTime: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountJsonProfile extends Record<string, unknown> {
  phone?: string
  username?: string
  userId?: string
  country?: string
  sessionName?: string
  sessionFile?: string
  importedAt?: string
  note?: string
  tags?: string[]
}

export interface ScanCandidate {
  baseName: string
  directory: string
  sessionPath: string
  jsonPath: string | null
}

export interface ScanResult {
  folderPath?: string
  candidates: ScanCandidate[]
  ignoredPaths: string[]
}

export interface ImportAccountsResult {
  scannedCount: number
  importedCount: number
  generatedJsonCount: number
  skippedCount: number
  warnings: string[]
  accounts: AccountRecord[]
}

export interface UpsertAccountInput {
  phone: string
  username: string
  userId: string
  country: string
  sessionPath: string
  jsonPath: string
  status: AccountStatus
  lastCheckTime: string | null
  lastOnlineTime: string | null
}

export interface StatusUpdateResult {
  updatedCount: number
  status: AccountStatus
  accounts: AccountRecord[]
}
