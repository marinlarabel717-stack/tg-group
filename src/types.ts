export type ModuleKey =
  | 'dashboard'
  | 'accounts'
  | 'automation'
  | 'bot-center'
  | 'auto-join'
  | 'batch-create'
  | 'other-tools'
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
  | 'geo_restricted'
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
export type TwoFactorAction = 'change-2fa' | 'disable-2fa' | 'reset-2fa'
export type TwoFactorOperationPhase = 'apply' | 'request-recovery' | 'confirm-recovery'
export type ProfileOperationAction =
  | 'random-profile'
  | 'random-avatar'
  | 'random-nickname'
  | 'random-username'
  | 'random-bio'
  | 'custom-avatar'
  | 'custom-nickname'
  | 'custom-username'
  | 'custom-bio'
  | 'remove-username'
  | 'remove-bio'
  | 'clear-all-profile'
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
  accounts?: AccountRecord[]
}

export interface ImportProgressPayload {
  mode?: 'import' | 'export' | 'delete'
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

export type AccountListStatusFilter = 'all' | AccountStatus | 'premium' | 'limited-group' | 'timeout-group'
export type AccountListPremiumFilter = 'all' | 'premium' | 'non-premium'
export type AccountListPresenceFilter = 'all' | 'has' | 'none'

export interface AccountListQuery {
  search: string
  statusFilter: AccountListStatusFilter
  countryFilter: string
  sourceFilter: string
  proxyFilter: string
  premiumFilter: AccountListPremiumFilter
  twoFactorFilter: AccountListPresenceFilter
  avatarFilter: AccountListPresenceFilter
  usernameFilter: AccountListPresenceFilter
  pageIndex: number
  pageSize: number
}

export interface AccountListPageResult {
  accounts: AccountRecord[]
  total: number
}

export interface ExportAccountsResult {
  exportedCount: number
  targetDirectory: string
  accounts?: AccountRecord[]
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

export interface TwoFactorOperationPayload {
  action: TwoFactorAction
  phase?: TwoFactorOperationPhase
  accountIds: number[]
  currentPassword?: string
  newPassword?: string
  hint?: string
  recoveryCode?: string
  recoveryCodes?: Array<{ accountId: number; code: string }>
}

export interface TwoFactorOperationResultItem {
  accountId: number
  phone: string
  success: boolean
  message: string
  nextTwoFA?: string | null
  emailPattern: string | null
}

export interface TwoFactorOperationResult {
  action: TwoFactorAction
  phase: TwoFactorOperationPhase
  total: number
  successCount: number
  failedCount: number
  results: TwoFactorOperationResultItem[]
  message?: string
}

export interface TwoFactorStopResult {
  stopped: boolean
  message: string
}

export interface TwoFactorLogEntry {
  id: string
  accountId: number | null
  phone: string
  level: CheckLogLevel
  message: string
  createdAt: string
}

export interface TwoFactorProgressState {
  running: boolean
  stopRequested: boolean
  action: TwoFactorAction | null
  phase: TwoFactorOperationPhase
  concurrency: number
  total: number
  completed: number
  successCount: number
  failedCount: number
  currentAccountId: number | null
  currentPhone: string | null
  logs: TwoFactorLogEntry[]
  lastUpdatedAt: string | null
}

export interface ProfileOperationPayload {
  action: ProfileOperationAction
  accountIds: number[]
  value?: string
  avatarPath?: string
}

export interface ProfileOperationResultItem {
  accountId: number
  phone: string
  success: boolean
  message: string
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  bio?: string | null
  avatar?: string | null
  hasProfilePhoto?: boolean | null
}

export interface ProfileOperationResult {
  action: ProfileOperationAction
  total: number
  successCount: number
  failedCount: number
  results: ProfileOperationResultItem[]
  message?: string
}

export interface ProfileOperationStopResult {
  stopped: boolean
  message: string
}

export interface ProfileOperationLogEntry {
  id: string
  accountId: number | null
  phone: string
  level: CheckLogLevel
  message: string
  createdAt: string
}

export interface ProfileOperationProgressState {
  running: boolean
  stopRequested: boolean
  action: ProfileOperationAction | null
  concurrency: number
  total: number
  completed: number
  successCount: number
  failedCount: number
  currentAccountId: number | null
  currentPhone: string | null
  logs: ProfileOperationLogEntry[]
  lastUpdatedAt: string | null
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
    geo_restricted: number
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
  listPage: (query: AccountListQuery) => Promise<AccountListPageResult>
  listIds: (query: Omit<AccountListQuery, 'pageIndex' | 'pageSize'>) => Promise<number[]>
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
  stopCheck: () => Promise<CheckQueueState>
  getCheckState: () => Promise<CheckQueueState>
  getCheckLogs: () => Promise<CheckLogEntry[]>
  clearCheckLogs: () => Promise<CheckQueueState>
  onCheckState: (callback: (state: CheckQueueState) => void) => () => void
  onCheckLogs: (callback: (logs: CheckLogEntry[]) => void) => () => void
  onAccountsUpdated: (callback: (accounts: AccountRecord[]) => void) => () => void
  onImportProgress: (callback: (payload: ImportProgressPayload) => void) => () => void
  exportByIds: (ids: number[]) => Promise<ExportAccountsResult>
  revealPath: (targetPath: string) => Promise<boolean>
  openTelegramWeb: (accountId: number) => Promise<boolean>
  readPremiumExpiryFromDesktop: (accountId: number) => Promise<PremiumExpiryReadResult>
  pickProfileAvatar: () => Promise<string | null>
  manageTwoFactor: (payload: TwoFactorOperationPayload) => Promise<TwoFactorOperationResult>
  stopTwoFactor: () => Promise<TwoFactorStopResult>
  getTwoFactorState: () => Promise<TwoFactorProgressState>
  clearTwoFactorLogs: () => Promise<TwoFactorProgressState>
  onTwoFactorProgress: (callback: (state: TwoFactorProgressState) => void) => () => void
  manageProfileOperation: (payload: ProfileOperationPayload) => Promise<ProfileOperationResult>
  stopProfileOperation: () => Promise<ProfileOperationStopResult>
  getProfileOperationState: () => Promise<ProfileOperationProgressState>
  clearProfileOperationLogs: () => Promise<ProfileOperationProgressState>
  onProfileOperationProgress: (callback: (state: ProfileOperationProgressState) => void) => () => void
}

export interface DesktopAppSettings {
  checkConcurrency: number
  licenseApiBaseUrl: string
  licenseOfflineGraceDays: number
}

export type BotCenterLogLevel = 'info' | 'success' | 'warning' | 'error'
export type BotCenterReplyKind = 'text' | 'photo'
export type BotCenterKeywordMatchType = 'contains' | 'equals'
export type BotCenterButtonStyle = 'default' | 'primary' | 'success' | 'danger'

export interface BotCenterReplyButton {
  id: string
  text: string
  url: string
  style: BotCenterButtonStyle
}

export interface BotCenterKeywordRule {
  id: string
  enabled: boolean
  keyword: string
  matchType: BotCenterKeywordMatchType
  replyEnabled: boolean
  replyType: BotCenterReplyKind
  title: string
  text: string
  imageUrl: string
  buttons: BotCenterReplyButton[]
}

export interface BotCenterConfig {
  name: string
  botToken: string
  autoStart: boolean
  guestReplyEnabled: boolean
  guestReplyTitle: string
  guestReplyText: string
  guestReplyType: BotCenterReplyKind
  guestReplyImageUrl: string
  guestReplyButtons: BotCenterReplyButton[]
  keywordRules: BotCenterKeywordRule[]
}

export interface BotCenterProfile {
  id: number | null
  username: string
  firstName: string
  canJoinGroups: boolean
  canReadAllGroupMessages: boolean
  supportsGuestQueries: boolean
  fetchedAt: string | null
  valid: boolean
}

export interface BotCenterStats {
  receivedGuestCount: number
  answeredGuestCount: number
  failedGuestCount: number
  lastGuestAt: string | null
}

export interface BotCenterLogEntry {
  id: string
  createdAt: string
  level: BotCenterLogLevel
  message: string
}

export interface BotCenterBotState {
  id: string
  config: BotCenterConfig
  profile: BotCenterProfile
  stats: BotCenterStats
  running: boolean
  polling: boolean
  startedAt: string | null
  lastPollAt: string | null
  lastActionMessage: string
  lastError: string
  updateOffset: number
  logs: BotCenterLogEntry[]
}

export interface BotCenterState {
  bots: BotCenterBotState[]
  activeBotId: string | null
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
  rememberedCardKey: string | null
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
  repeatPeriodSeconds?: number | null
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
  deleteMode?: 'none' | 'self' | 'both'
  deleteDelaySeconds?: number
  pinAfterSendEnabled?: boolean
  pinDelaySeconds?: number
  welcomeMessageEnabled?: boolean
  welcomeMessageText?: string
  welcomeDelaySeconds?: number
  randomEmojiEnabled?: boolean
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

export type GroupCollectorMode = 'public_members' | 'hidden_history' | 'channel_mentions'
export type GroupCollectorRole = 'owner' | 'admin' | 'member'
export type GroupCollectorLastSeenBucket = 'online' | 'recent' | 'week' | 'month' | 'offline' | 'unknown'

export interface GroupCollectorFilterPayload {
  roleFilters: GroupCollectorRole[]
  onlyBots: boolean
  avatarFilters: Array<'has' | 'none'>
  usernameFilters: Array<'has' | 'none'>
  premiumFilters: Array<'premium' | 'normal'>
  lastSeenFilters: GroupCollectorLastSeenBucket[]
}

export interface GroupCollectorPayload {
  accountId: number
  source: string
  mode: GroupCollectorMode
  participantLimit?: number
  historyLimit?: number
  historyDays?: number
  filters: GroupCollectorFilterPayload
}

export interface GroupCollectorUserPayload {
  userId: string
  displayName: string
  username: string
  phone: string
  targetValue: string
  sourceLabel: string
  role: GroupCollectorRole
  isBot: boolean
  hasAvatar: boolean
  hasUsername: boolean
  isPremium: boolean
  lastSeenBucket: GroupCollectorLastSeenBucket
  lastSeenLabel: string
}

export interface GroupCollectorResult {
  total: number
  matched: number
  filtered: number
  items: GroupCollectorUserPayload[]
  message: string
}

export type GroupCollectorTaskStatus = 'running' | 'completed' | 'stopped' | 'failed'

export interface GroupCollectorTaskPayload {
  taskId: string
  accountIds: number[]
  sources: string[]
  mode: GroupCollectorMode
  participantLimit?: number
  historyLimit?: number
  historyDays?: number
  filters: GroupCollectorFilterPayload
}

export interface GroupCollectorTaskStartResult {
  taskId: string
  accepted: boolean
  message: string
}

export interface GroupCollectorTaskStopResult {
  taskId: string
  stopped: boolean
  message: string
}

export interface GroupCollectorTaskLogEntry {
  id: string
  taskId: string
  level: CheckLogLevel
  createdAt: string
  accountId: number | null
  accountPhone: string
  source: string
  message: string
}

export interface GroupCollectorTaskResult {
  taskId: string
  status: GroupCollectorTaskStatus
  joinedCount: number
  successCount: number
  failedCount: number
  totalGroups: number
  totalAccounts: number
  items: GroupCollectorUserPayload[]
  usernames: string[]
  message: string
}

export interface GroupCollectorTaskProgress {
  taskId: string
  status: GroupCollectorTaskStatus
  totalGroups: number
  processedGroups: number
  totalAccounts: number
  joinedCount: number
  successCount: number
  failedCount: number
  message: string
  log?: GroupCollectorTaskLogEntry | null
  result?: GroupCollectorTaskResult | null
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
  mode: 'join-only' | 'join-and-send' | 'join-then-send'
  speedPreset: 'safe' | 'normal' | 'fast'
  skipChannelsEnabled: boolean
  leaveMutedGroupsEnabled: boolean
  concurrency: number
  accountIntervalMin: number
  accountIntervalMax: number
  joinIntervalMin: number
  joinIntervalMax: number
  sendIntervalMin: number
  sendIntervalMax: number
  floodRestMin: number
  floodRestMax: number
  retryLimit: number
  autoRetryOnFloodWait: boolean
  repeatJoinEnabled: boolean
  loopSendEnabled: boolean
  loopSendIntervalMinutes: number
  dispatchMode: 'random' | 'sequential'
  safeModeEnabled: boolean
  maxJoinsPerAccount: number
  messageText: string
  imageData: string
  buttonText: string
  buttonUrl: string
}

export interface AutoJoinResultItem {
  itemId: string
  raw: string
  normalized: string
  status: 'joined' | 'already' | 'requested' | 'failed'
  joinCategory?: 'speakable' | 'muted' | 'requested' | 'channel-skipped' | null
  errorMessage: string
  accountId: number | null
  accountLabel: string
  groupTitle: string
  joinedAt: string | null
  sendStatus?: 'sent' | 'skipped' | 'failed'
  sendErrorMessage?: string
  sentAt?: string | null
  attempt: number
}

export interface AutoJoinTaskResult {
  taskId: string
  total: number
  successCount: number
  alreadyCount: number
  requestedCount: number
  failedCount: number
  speakableCount: number
  mutedCount: number
  channelSkippedCount: number
  sendSuccessCount: number
  sendSkippedCount: number
  sendFailedCount: number
  items: AutoJoinResultItem[]
  message: string
  stopped?: boolean
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
  requestedCount: number
  failedCount: number
  speakableCount: number
  mutedCount: number
  channelSkippedCount: number
  sendSuccessCount: number
  sendSkippedCount: number
  sendFailedCount: number
  running: boolean
  item?: AutoJoinResultItem | null
  message: string
  waitSeconds?: number | null
}

export type BatchCreateMode = 'group' | 'channel' | 'both'
export type BatchCreatePostType = 'none' | 'text' | 'photo'

export interface BatchCreatePayload {
  taskId: string
  accountIds: number[]
  createMode: BatchCreateMode
  countPerAccount: number
  createIntervalMin: number
  createIntervalMax: number
  autoWaitOnFlood: boolean
  titleTemplate: string
  aboutTemplate: string
  usernameTemplate: string
  randomTitleEnabled: boolean
  randomAboutEnabled: boolean
  randomUsernameEnabled: boolean
  randomLength: number
  postType: BatchCreatePostType
  postText: string
  postImageData: string
}

export interface BatchCreateResultItem {
  id: string
  accountId: number
  accountLabel: string
  entityType: 'group' | 'channel'
  title: string
  about: string
  username: string
  publicLink: string
  status: 'success' | 'failed'
  message: string
  createdAt: string
}

export interface BatchCreateTaskResult {
  taskId: string
  total: number
  completed: number
  successCount: number
  failedCount: number
  groupCount: number
  channelCount: number
  items: BatchCreateResultItem[]
  message: string
  stopped?: boolean
}

export interface BatchCreateStopResult {
  stopped: boolean
  message: string
}

export interface BatchCreateProgress {
  taskId: string
  total: number
  completed: number
  successCount: number
  failedCount: number
  groupCount: number
  channelCount: number
  running: boolean
  item?: BatchCreateResultItem | null
  message: string
  waitSeconds?: number | null
}

export type OtherToolsUsernameFilterCategory = 'valid' | 'occupiable' | 'forbidden'

export interface OtherToolsUsernameFilterPayload {
  input: string
}

export interface OtherToolsUsernameFilterItem {
  raw: string
  normalized: string
  category: OtherToolsUsernameFilterCategory
  kind: 'username' | 'link'
  reason: string
  entityType: 'user' | 'bot' | 'group' | 'channel' | 'unknown'
  checkedAccountId?: number | null
  checkedAccountLabel?: string | null
}

export interface OtherToolsUsernameFilterResult {
  accountId: number | null
  accountLabel: string
  total: number
  checkedCount: number
  valid: OtherToolsUsernameFilterItem[]
  occupiable: OtherToolsUsernameFilterItem[]
  forbidden: OtherToolsUsernameFilterItem[]
  items: OtherToolsUsernameFilterItem[]
  message: string
}

export type OtherToolsSniperCandidateCategory = 'occupied' | 'claimable' | 'forbidden' | 'uncertain'
export type OtherToolsSniperClaimStatus = 'claimed' | 'failed' | 'skipped'

export interface OtherToolsSniperPayload {
  sourceInput: string
  poolInput: string
  includeKeywords: string
  excludeKeywords: string
  scanAccountId?: number | null
  claimAccountId?: number | null
  subscribeAccountIds?: number[]
  sourceMessageLimit: number
  candidateLimit: number
  autoClaim: boolean
  autoSubscribeSources: boolean
}

export interface OtherToolsSniperCandidateItem {
  id: string
  raw: string
  normalized: string
  kind: 'username' | 'link'
  category: OtherToolsSniperCandidateCategory
  entityType: 'user' | 'bot' | 'group' | 'channel' | 'unknown'
  reason: string
  sourceRef: string
  sourceTitle: string
  sourceExcerpt: string
  sourceMessageId: string
  sourceDate: string
  claimStatus: OtherToolsSniperClaimStatus | null
  claimMessage: string
  claimTargetRef: string
  claimTargetTitle: string
  checkedAccountId?: number | null
  checkedAccountLabel?: string | null
  claimAccountId?: number | null
  claimAccountLabel?: string | null
}

export type OtherToolsSourceSubscribeStatus = 'joined' | 'already' | 'failed' | 'skipped'

export interface OtherToolsSourceSubscribeItem {
  id: string
  accountId: number
  accountLabel: string
  sourceRef: string
  sourceTitle: string
  sourceKind: 'channel' | 'group' | 'chatlist' | 'bot' | 'unknown'
  status: OtherToolsSourceSubscribeStatus
  message: string
}

export interface OtherToolsSniperResult {
  scanAccountId: number | null
  scanAccountLabel: string
  claimAccountId: number | null
  claimAccountLabel: string
  sourceCount: number
  poolCount: number
  inspectedMessageCount: number
  candidateCount: number
  subscribeAccountCount: number
  subscribeJoinedCount: number
  subscribeAlreadyCount: number
  subscribeFailedCount: number
  subscribeSkippedCount: number
  subscribeItems: OtherToolsSourceSubscribeItem[]
  occupied: OtherToolsSniperCandidateItem[]
  claimable: OtherToolsSniperCandidateItem[]
  forbidden: OtherToolsSniperCandidateItem[]
  uncertain: OtherToolsSniperCandidateItem[]
  claimed: OtherToolsSniperCandidateItem[]
  items: OtherToolsSniperCandidateItem[]
  message: string
}

export interface OtherToolsSniperListenerPayload extends OtherToolsSniperPayload {
  pollIntervalSeconds: number
  autoCreateCarrier: boolean
  createCarrierAccountId?: number | null
  createCarrierTitleTemplate: string
  createCarrierAboutTemplate: string
}

export interface OtherToolsSniperListenerLogEntry {
  id: string
  level: CheckLogLevel
  message: string
  createdAt: string
  sourceRef?: string | null
  sourceTitle?: string | null
  candidate?: string | null
  targetRef?: string | null
  accountId?: number | null
  accountLabel?: string | null
}

export interface OtherToolsSniperListenerState {
  running: boolean
  scanAccountId: number | null
  scanAccountLabel: string
  claimAccountId: number | null
  claimAccountLabel: string
  createCarrierAccountId: number | null
  createCarrierAccountLabel: string
  pollIntervalSeconds: number
  sourceCount: number
  expandedSourceCount: number
  checkedMessageCount: number
  candidateCount: number
  claimedCount: number
  createdCarrierCount: number
  seenMessageCount: number
  startedAt: string | null
  lastTickAt: string | null
  logs: OtherToolsSniperListenerLogEntry[]
  message: string
}

export interface OtherToolsSniperListenerStopResult {
  stopped: boolean
  message: string
}

export interface DesktopSettingsApi {
  get: () => Promise<DesktopAppSettings>
  update: (patch: Partial<DesktopAppSettings>) => Promise<DesktopAppSettings>
}

export interface DesktopBotCenterApi {
  getState: () => Promise<BotCenterState>
  addBot: () => Promise<BotCenterState>
  removeBot: (botId: string) => Promise<BotCenterState>
  selectBot: (botId: string) => Promise<BotCenterState>
  saveConfig: (botId: string, patch: Partial<BotCenterConfig>) => Promise<BotCenterState>
  refreshProfile: (botId: string) => Promise<BotCenterState>
  start: (botId: string) => Promise<BotCenterState>
  stop: (botId: string) => Promise<BotCenterState>
  clearLogs: (botId: string) => Promise<BotCenterState>
  onState: (callback: (state: BotCenterState) => void) => () => void
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
  collectGroupUsers: (payload: GroupCollectorPayload) => Promise<GroupCollectorResult>
  startGroupCollectorTask: (payload: GroupCollectorTaskPayload) => Promise<GroupCollectorTaskStartResult>
  stopGroupCollectorTask: (taskId: string) => Promise<GroupCollectorTaskStopResult>
  configureAutoReply: (payload: DirectMessageAutoReplyPayload) => Promise<DirectMessageAutoReplyState>
  getAutoReplyState: () => Promise<DirectMessageAutoReplyState>
  onSendProgress: (callback: (payload: DirectMessageSendProgress) => void) => () => void
  onGroupCollectorProgress: (callback: (payload: GroupCollectorTaskProgress) => void) => () => void
  onAutoReplyEvent: (callback: (payload: DirectMessageAutoReplyEvent) => void) => () => void
}

export interface DesktopAutoJoinApi {
  start: (payload: AutoJoinPayload) => Promise<AutoJoinTaskResult>
  stop: () => Promise<AutoJoinStopResult>
  onProgress: (callback: (payload: AutoJoinProgress) => void) => () => void
}

export interface DesktopBatchCreateApi {
  start: (payload: BatchCreatePayload) => Promise<BatchCreateTaskResult>
  stop: () => Promise<BatchCreateStopResult>
  onProgress: (callback: (payload: BatchCreateProgress) => void) => () => void
}

export interface DesktopOtherToolsApi {
  filterUsernames: (payload: OtherToolsUsernameFilterPayload) => Promise<OtherToolsUsernameFilterResult>
  scanAndClaim: (payload: OtherToolsSniperPayload) => Promise<OtherToolsSniperResult>
  startSniperListener: (payload: OtherToolsSniperListenerPayload) => Promise<OtherToolsSniperListenerState>
  stopSniperListener: () => Promise<OtherToolsSniperListenerStopResult>
  getSniperListenerState: () => Promise<OtherToolsSniperListenerState>
  onSniperListenerState: (callback: (state: OtherToolsSniperListenerState) => void) => () => void
}

export type AppUpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'

export interface AppUpdaterState {
  status: AppUpdaterStatus
  currentVersion: string
  availableVersion: string | null
  progressPercent: number
  transferredBytes: number
  totalBytes: number
  bytesPerSecond: number
  message: string
  releaseDate: string | null
}

export interface DesktopUpdaterApi {
  getState: () => Promise<AppUpdaterState>
  checkForUpdates: () => Promise<AppUpdaterState>
  downloadUpdate: () => Promise<AppUpdaterState>
  quitAndInstall: () => Promise<boolean>
  onState: (callback: (state: AppUpdaterState) => void) => () => void
}

export interface DesktopWindowApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  setMode: (mode: 'license' | 'app') => Promise<boolean>
  openExternal?: (url: string) => Promise<boolean>
}

declare global {
  interface Window {
    desktopAccounts?: DesktopAccountsApi
    desktopSettings?: DesktopSettingsApi
    desktopBotCenter?: DesktopBotCenterApi
    desktopProxyPool?: DesktopProxyPoolApi
    desktopLicense?: DesktopLicenseApi
    desktopBroadcast?: DesktopBroadcastApi
    desktopDirectMessage?: DesktopDirectMessageApi
    desktopAutoJoin?: DesktopAutoJoinApi
    desktopBatchCreate?: DesktopBatchCreateApi
    desktopOtherTools?: DesktopOtherToolsApi
    desktopUpdater?: DesktopUpdaterApi
    desktopWindow?: DesktopWindowApi
    desktopInfo?: {
      appName: string
      platform: string
      version: string
    }
  }
}
