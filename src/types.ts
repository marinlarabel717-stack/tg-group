export type ModuleKey =
  | 'dashboard'
  | 'accounts'
  | 'automation'
  | 'proxy-pool'
  | 'session-manager'
  | 'logs'

export type AccountStatus =
  | 'alive'
  | 'frozen'
  | 'banned'
  | 'limited'
  | 'temporary_limited'
  | 'session_expired'
  | 'multi_ip'
  | 'timeout_unchecked'
  | 'checking'
  | 'unknown'

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
  spamblock?: string | null
  session_file?: string
  last_connect_date?: string | null
  session_created_date?: string | null
  register_time?: number | string | null
  last_check_time?: number | string | null
  proxy?: string | null
  ipv6?: boolean
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
  profileSource: 'json_import' | 'login_check'
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
