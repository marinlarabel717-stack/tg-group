export const ACCOUNT_STATUS_VALUES = [
  'alive',
  'banned',
  'limited',
  'temporary_limited',
  'session_expired',
  'not_logged_in',
  'multi_ip',
  'timeout',
  'checking',
  'unknown'
] as const

export type AccountStatus = (typeof ACCOUNT_STATUS_VALUES)[number]
export type ProfileSource = 'json_import' | 'login_check'
export type CheckLogLevel = 'info' | 'success' | 'warning' | 'error'

export interface AccountJsonProfile extends Record<string, unknown> {
  app_id?: number
  app_hash?: string
  sdk?: string
  device?: string
  app_version?: string
  lang_pack?: string
  system_lang_pack?: string
  twoFA?: string | null
  role?: string | null
  id?: number | string
  phone?: string
  username?: string | null
  date_of_birth?: number | string | null
  date_of_birth_integrity?: string | null
  is_premium?: boolean
  premium_expiry?: string | number | null
  first_name?: string | null
  last_name?: string | null
  bio?: string | null
  has_profile_pic?: boolean
  spamblock?: string | null
  spamblock_end_date?: string | number | null
  spambot_reply?: string | null
  session_file?: string
  stats_spam_count?: number
  stats_invites_count?: number
  last_connect_date?: string | null
  session_created_date?: string | null
  app_config_hash?: string | null
  extra_params?: string | null
  register_time?: number | string | null
  last_check_time?: number | string | null
  avatar?: string | null
  sex?: string | null
  proxy?: string | null
  ipv6?: boolean
  userId?: string
  country?: string
  check_error?: string | null
  check_status?: AccountStatus
  check_duration_ms?: number
}

export interface AccountRecord {
  id: number
  phone: string
  username: string
  userId: string
  country: string
  sessionPath: string
  jsonPath: string
  status: AccountStatus
  profile: AccountJsonProfile
  profileSource: ProfileSource
  lastCheckTime: string | null
  lastOnlineTime: string | null
  createdAt: string
  updatedAt: string
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
  profile: AccountJsonProfile
  profileSource: ProfileSource
  lastCheckTime: string | null
  lastOnlineTime: string | null
}

export interface CheckResultInput {
  id: number
  profile: AccountJsonProfile
  status: AccountStatus
  phone?: string
  username?: string
  userId?: string
  country?: string
  lastCheckTime?: string | null
  lastOnlineTime?: string | null
}

export interface StatusUpdateResult {
  updatedCount: number
  status: AccountStatus
  accounts: AccountRecord[]
}

export interface CheckLogEntry {
  id: string
  accountId: number | null
  level: CheckLogLevel
  message: string
  createdAt: string
  attempt?: number
}

export interface CheckQueueState {
  running: boolean
  concurrency: number
  timeoutMs: number
  retryLimit: number
  pendingCount: number
  activeCount: number
  completedCount: number
  failedCount: number
  totalCount: number
  queuedAccountIds: number[]
  activeAccountIds: number[]
  logs: CheckLogEntry[]
  lastUpdatedAt: string | null
}

export interface AccountCheckResult {
  accountId: number
  status: AccountStatus
  profile: AccountJsonProfile
  phone: string
  username: string
  userId: string
  country: string
  lastCheckTime: string | null
  lastOnlineTime: string | null
  durationMs: number
  retryable: boolean
  errorMessage?: string
}
