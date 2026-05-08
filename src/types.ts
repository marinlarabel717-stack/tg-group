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
