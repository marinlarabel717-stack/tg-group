export type ModuleKey =
  | 'dashboard'
  | 'accounts'
  | 'automation'
  | 'auto-join'
  | 'direct-message'
  | 'proxy-pool'
  | 'session-manager'
  | 'logs'
  | 'settings'

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
export type CheckAction = 'account-status' | 'account-survival' | 'profile-refresh' | 'proxy-health'
export type ProxyType = 'http' | 'https' | 'socks5'
export type ProxyIpVersion = 'ipv4' | 'ipv6'
export type ProxyStatus = 'idle' | 'checking' | 'alive' | 'dead'

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
  avatar?: string | null
  is_premium?: boolean
  premium_expiry?: string | number | null
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
  proxy?: boolean | string | null
  account_ttl_days?: number | null
  check_mode?: 'account-status' | 'account-survival' | null
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
  proxyDisplay: string | null
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

export interface ProxyRecord {
  id: string
  value: string
  type: ProxyType
  ipVersion: ProxyIpVersion
  host: string
  port: number
  username: string | null
  password: string | null
  status: ProxyStatus
  latencyMs: number | null
  lastCheckedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface ProxyPoolSettings {
  enabled: boolean
  defaultType: ProxyType
  ipVersion: ProxyIpVersion
  randomize: boolean
}

export interface ProxyCheckLogEntry {
  id: string
  level: CheckLogLevel
  message: string
  createdAt: string
  proxyId: string | null
}

export interface ProxyCheckState {
  running: boolean
  totalCount: number
  checkedCount: number
  aliveCount: number
  deadCount: number
  removedCount: number
  logs: ProxyCheckLogEntry[]
  lastUpdatedAt: string | null
}

export interface ProxyPoolState {
  proxies: ProxyRecord[]
  settings: ProxyPoolSettings
  checkState: ProxyCheckState
}

export interface PremiumExpiryReadResult {
  ok: boolean
  premiumExpiry: string | null
  message: string
  rawText?: string | null
  screenshotPath?: string | null
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
  runMode: 'account-status' | 'account-survival'
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
    multi_ip: number
    timeout: number
    unknown: number
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
  startCheck: (payload: { ids: number[]; actions: CheckAction[] }) => Promise<CheckQueueState>
  getCheckState: () => Promise<CheckQueueState>
  clearCheckLogs: () => Promise<CheckQueueState>
  onCheckState: (callback: (state: CheckQueueState) => void) => () => void
  onAccountsUpdated: (callback: (accounts: AccountRecord[]) => void) => () => void
  onImportProgress: (callback: (payload: ImportProgressPayload) => void) => () => void
  exportByIds: (ids: number[]) => Promise<ExportAccountsResult>
  revealPath: (targetPath: string) => Promise<boolean>
  openTelegramWeb: (accountId: number) => Promise<boolean>
  readPremiumExpiryFromDesktop: (accountId: number) => Promise<PremiumExpiryReadResult>
}

export interface DesktopAppSettings {
  checkConcurrency: number
  licenseApiBaseUrl: string
  licenseOfflineGraceDays: number
}

export interface DesktopLicenseState {
  status: 'missing' | 'valid' | 'expired' | 'invalid' | 'grace'
  canEnter: boolean
  machineId: string
  appVersion: string
  isPackaged: boolean
  devBypassAvailable: boolean
  apiConfigured: boolean
  apiBaseUrl: string
  cardKeyMasked: string | null
  expireAt: string | null
  activatedAt: string | null
  lastValidatedAt: string | null
  offlineGraceUntil: string | null
  message: string
}

export interface DesktopLicenseActivateResult {
  ok: boolean
  message: string
  snapshot: DesktopLicenseState
}

export interface DesktopLicenseValidateResult {
  ok: boolean
  message: string
  snapshot: DesktopLicenseState
}

export interface BroadcastCreativePayload {
  id: string
  title: string
  kind: 'text' | 'image' | 'image_text' | 'image_button' | 'channel_forward'
  text: string
  imageUrl: string
  dailyQuota: number
  weight: number
  enabled: boolean
  buttonText: string
  buttonUrl: string
  sourceLink: string
  note: string
}

export interface BroadcastGroupPayload {
  id: string
  title: string
  username: string
  targetRef: string
  memberCount: number
  enabled: boolean
  accountIds: number[]
}

export interface BroadcastPreviewSyncItem {
  id: string
  taskId: string
  scheduledAt: string
  accountId: number | null
  groupId: string
  creativeId: string | null
  repeatPeriodSeconds?: number | null
  status: 'queued' | 'scheduled' | 'failed'
  errorMessage: string
  remoteMessageId?: number | null
  syncedAt?: string | null
}

export interface BroadcastPushSchedulePayload {
  items: BroadcastPreviewSyncItem[]
  creatives: BroadcastCreativePayload[]
  groups: BroadcastGroupPayload[]
}

export interface BroadcastPushScheduleResultItem {
  previewItemId: string
  status: 'queued' | 'scheduled' | 'failed'
  errorMessage: string
  remoteMessageId: number | null
  syncedAt: string | null
  accountId: number | null
  groupId: string
  creativeId: string | null
}

export interface BroadcastPushScheduleResult {
  total: number
  successCount: number
  failedCount: number
  items: BroadcastPushScheduleResultItem[]
  message: string
}

export interface BroadcastStopResult {
  stopped: boolean
  message: string
}

export interface BroadcastScheduledMessageItem {
  messageId: number
  scheduledAt: string | null
  text: string
  hasMedia: boolean
  mediaLabel: string
  hasButtons: boolean
  isForwarded: boolean
  forwardLabel: string
}

export interface BroadcastScheduledMessageListResult {
  total: number
  items: BroadcastScheduledMessageItem[]
  message: string
}

export interface BroadcastDeleteScheduledMessagesPayload {
  accountId: number
  groupRef: string
  messageIds: number[]
}

export interface BroadcastDeleteScheduledMessagesResult {
  deletedCount: number
  message: string
}

export interface BroadcastPushScheduleProgress {
  total: number
  completed: number
  successCount: number
  failedCount: number
  item: BroadcastPushScheduleResultItem
  message: string
}

export interface BroadcastJoinedGroup {
  peerId: string
  title: string
  username: string
  targetRef: string
  memberCount: number
  type: 'group' | 'supergroup'
}

export interface DirectMessageSendPayloadItem {
  id: string
  targetId: string
  targetValue: string
  accountId: number | null
  waitSeconds: number
  batchIndex: number
  status: 'queued' | 'sent' | 'failed'
  errorMessage?: string
  remoteMessageId?: number | null
  sentAt?: string | null
}

export interface DirectMessageSendPayload {
  items: DirectMessageSendPayloadItem[]
  messageType: 'text' | 'channel_forward' | 'hidden_channel_forward' | 'postbot_code'
  messageText: string
  imageUrl: string
  sourceLink: string
  postbotCode: string
  concurrency?: number
}

export interface DirectMessageSendResultItem {
  previewItemId: string
  targetId: string
  targetValue: string
  status: 'sent' | 'failed'
  errorMessage: string
  remoteMessageId: number | null
  sentAt: string | null
  accountId: number | null
}

export interface DirectMessageSendResult {
  total: number
  successCount: number
  failedCount: number
  items: DirectMessageSendResultItem[]
  message: string
}

export interface DirectMessageStopResult {
  stopped: boolean
  message: string
}

export interface DirectMessageSendProgress {
  total: number
  completed: number
  successCount: number
  failedCount: number
  item?: DirectMessageSendResultItem | null
  message: string
  waitSeconds?: number | null
}

export interface DirectMessageCollectedUserPayload {
  value: string
  normalizedValue: string
  sourceLabel: string
  userId: string
  username: string
  phone: string
}

export interface DirectMessageCollectPayload {
  accountId: number
  mode: 'contact' | 'group_members' | 'comment_users' | 'react_users'
  source: string
  limit?: number
}

export interface DirectMessageCollectResult {
  total: number
  added: number
  skipped: number
  items: DirectMessageCollectedUserPayload[]
  message: string
}

export interface DirectMessageAutoReplyRulePayload {
  id: string
  keyword: string
  replyText: string
  enabled: boolean
  matchMode: 'contains' | 'exact'
  cooldownSeconds: number
}

export interface DirectMessageAutoReplyPayload {
  accountIds: number[]
  enabled: boolean
  rules: DirectMessageAutoReplyRulePayload[]
}

export interface DirectMessageAutoReplyState {
  enabled: boolean
  accountIds: number[]
  activeCount: number
  ruleCount: number
  startedAt: string | null
}

export interface DirectMessageAutoReplyEvent {
  accountId: number
  accountLabel: string
  senderId: string
  senderLabel: string
  messageText: string
  matchedKeyword: string
  replyText: string
  status: 'replied' | 'failed'
  errorMessage: string
  createdAt: string
}

export interface AutoJoinPayloadItem {
  id: string
  raw: string
  normalized: string
  kind: 'invite' | 'username'
}

export interface AutoJoinPayload {
  taskId: string
  accountIds: number[]
  items: AutoJoinPayloadItem[]
  concurrency: number
  intervalSeconds: number
  retryLimit: number
  autoRetryOnFloodWait: boolean
}

export interface AutoJoinResultItem {
  itemId: string
  raw: string
  normalized: string
  status: 'joined' | 'already' | 'failed'
  errorMessage: string
  accountId: number | null
  accountLabel: string
  groupTitle: string
  joinedAt: string | null
  attempt: number
}

export interface AutoJoinTaskResult {
  taskId: string
  total: number
  successCount: number
  alreadyCount: number
  failedCount: number
  items: AutoJoinResultItem[]
  message: string
}

export interface AutoJoinStopResult {
  stopped: boolean
  message: string
}

export interface AutoJoinProgress {
  taskId: string
  total: number
  completed: number
  successCount: number
  alreadyCount: number
  failedCount: number
  running: boolean
  item?: AutoJoinResultItem | null
  message: string
  waitSeconds?: number | null
}

export interface DesktopSettingsApi {
  get: () => Promise<DesktopAppSettings>
  update: (patch: Partial<DesktopAppSettings>) => Promise<DesktopAppSettings>
}

export interface DesktopProxyPoolApi {
  getState: () => Promise<ProxyPoolState>
  replaceProxyList: (text: string) => Promise<ProxyPoolState>
  updateSettings: (patch: Partial<ProxyPoolSettings>) => Promise<ProxyPoolState>
  clearLogs: () => Promise<ProxyPoolState>
  startCheck: () => Promise<ProxyPoolState>
  onState: (callback: (state: ProxyPoolState) => void) => () => void
}

export interface DesktopLicenseApi {
  getState: () => Promise<DesktopLicenseState>
  activate: (cardKey: string) => Promise<DesktopLicenseActivateResult>
  validate: () => Promise<DesktopLicenseValidateResult>
  clear: () => Promise<DesktopLicenseState>
}

export interface DesktopBroadcastApi {
  pushSchedule: (payload: BroadcastPushSchedulePayload) => Promise<BroadcastPushScheduleResult>
  stopPushSchedule: () => Promise<BroadcastStopResult>
  listJoinedGroups: (accountId: number) => Promise<BroadcastJoinedGroup[]>
  listScheduledMessages: (accountId: number, groupRef: string) => Promise<BroadcastScheduledMessageListResult>
  deleteScheduledMessages: (payload: BroadcastDeleteScheduledMessagesPayload) => Promise<BroadcastDeleteScheduledMessagesResult>
  onPushProgress: (callback: (payload: BroadcastPushScheduleProgress) => void) => () => void
}

export interface DesktopDirectMessageApi {
  sendMessages: (payload: DirectMessageSendPayload) => Promise<DirectMessageSendResult>
  stopSend: () => Promise<DirectMessageStopResult>
  collectUsers: (payload: DirectMessageCollectPayload) => Promise<DirectMessageCollectResult>
  configureAutoReply: (payload: DirectMessageAutoReplyPayload) => Promise<DirectMessageAutoReplyState>
  getAutoReplyState: () => Promise<DirectMessageAutoReplyState>
  onSendProgress: (callback: (payload: DirectMessageSendProgress) => void) => () => void
  onAutoReplyEvent: (callback: (payload: DirectMessageAutoReplyEvent) => void) => () => void
}

export interface DesktopAutoJoinApi {
  start: (payload: AutoJoinPayload) => Promise<AutoJoinTaskResult>
  stop: () => Promise<AutoJoinStopResult>
  onProgress: (callback: (payload: AutoJoinProgress) => void) => () => void
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
    desktopSettings?: DesktopSettingsApi
    desktopProxyPool?: DesktopProxyPoolApi
    desktopLicense?: DesktopLicenseApi
    desktopBroadcast?: DesktopBroadcastApi
    desktopDirectMessage?: DesktopDirectMessageApi
    desktopAutoJoin?: DesktopAutoJoinApi
    desktopWindow?: DesktopWindowApi
    desktopInfo?: {
      appName: string
      platform: string
      version: string
    }
  }
}
