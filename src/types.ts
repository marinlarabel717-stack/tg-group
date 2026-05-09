export type ModuleKey =
  | 'dashboard'
  | 'accounts'
  | 'automation'
  | 'proxy-pool'
  | 'session-manager'
  | 'logs'

export type AccountStatus =
  | 'alive'
  | 'banned'
  | 'limited'
  | 'temporary_limited'
  | 'frozen'
  | 'session_expired'
  | 'not_logged_in'
  | 'multi_ip'
  | 'timeout'
  | 'checking'
  | 'unknown'

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
  first_name?: string | null
  last_name?: string | null
  bio?: string | null
  has_profile_pic?: boolean
  is_premium?: boolean
  spamblock?: string | null
  spamblock_end_date?: string | number | null
  freeze_since_date?: string | number | null
  freeze_until_date?: string | number | null
  freeze_appeal_url?: string | null
  spambot_reply?: string | null
  session_file?: string
  last_connect_date?: string | null
  session_created_date?: string | null
  register_time?: number | string | null
  last_check_time?: number | string | null
  proxy?: string | null
  ipv6?: boolean
  check_error?: string | null
  check_status?: AccountStatus
  check_duration_ms?: number
  [key: string]: unknown
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

export interface StatRecord {
  id: string
  label: string
  value: string
  delta: string
  tone: 'primary' | 'success' | 'danger' | 'warning'
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

export interface ImportProgressPayload {
  phase: 'start' | 'progress' | 'completed'
  total: number
  current: number
  importedCount: number
  generatedJsonCount: number
  skippedCount: number
  message: string
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

export interface ExportAccountsResult {
  exportedCount: number
  targetDirectory: string
}

export interface CheckLogEntry {
  id: string
  accountId: number | null
  level: CheckLogLevel
  message: string
  createdAt: string
  attempt?: number
  phone?: string
  status?: AccountStatus | null
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
  resultSummary: {
    total: number
    alive: number
    limited: number
    temporary_limited: number
    frozen: number
    banned: number
    timeout: number
  }
  lastUpdatedAt: string | null
}

export interface DesktopAccountsApi {
  list: () => Promise<AccountRecord[]>
  pickImportFiles: () => Promise<ImportAccountsResult | null>
  pickImportFolder: () => Promise<ImportAccountsResult | null>
  scanFolder: (folderPath: string) => Promise<ScanResult>
  importDroppedPaths: (paths: string[]) => Promise<ImportAccountsResult>
  deleteByIds: (ids: number[]) => Promise<AccountRecord[]>
  deleteAll: () => Promise<AccountRecord[]>
  markChecking: (ids: number[]) => Promise<StatusUpdateResult>
  applySpamBotReply: (payload: { ids: number[]; replyText: string }) => Promise<StatusUpdateResult>
  applyCheckResults: (items: CheckResultInput[]) => Promise<StatusUpdateResult>
  startCheck: (ids: number[]) => Promise<CheckQueueState>
  getCheckState: () => Promise<CheckQueueState>
  clearCheckLogs: () => Promise<CheckQueueState>
  onCheckState: (callback: (state: CheckQueueState) => void) => () => void
  onAccountsUpdated: (callback: (accounts: AccountRecord[]) => void) => () => void
  onImportProgress: (callback: (payload: ImportProgressPayload) => void) => () => void
  exportByIds: (ids: number[]) => Promise<ExportAccountsResult>
  revealPath: (targetPath: string) => Promise<boolean>
}

export interface DesktopWindowApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

declare global {
  interface Window {
    desktopAccounts?: DesktopAccountsApi
    desktopWindow?: DesktopWindowApi
    desktopInfo?: {
      appName: string
      platform: string
    }
  }
}
