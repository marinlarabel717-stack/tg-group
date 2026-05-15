import { contextBridge, ipcRenderer } from 'electron'
import type { AccountRecord, AppUpdaterState, AutoJoinPayload, AutoJoinProgress, AutoJoinStopResult, AutoJoinTaskResult, BotCenterConfig, BotCenterState, BroadcastDeleteScheduledMessagesPayload, BroadcastDeleteScheduledMessagesResult, BroadcastPushSchedulePayload, BroadcastPushScheduleProgress, BroadcastScheduledMessageListResult, BroadcastStopResult, CheckAction, CheckQueueState, CheckResultInput, DesktopLicenseActivateResult, DesktopLicenseState, DesktopLicenseValidateResult, DirectMessageAutoReplyEvent, DirectMessageAutoReplyPayload, DirectMessageAutoReplyState, DirectMessageCollectPayload, DirectMessageCollectResult, DirectMessageSendPayload, DirectMessageSendProgress, DirectMessageStopResult, GroupCollectorPayload, GroupCollectorResult, GroupCollectorTaskPayload, GroupCollectorTaskProgress, GroupCollectorTaskStartResult, GroupCollectorTaskStopResult, ImportProgressPayload, ProxyPoolSettings, ProxyPoolState, TwoFactorOperationPayload, TwoFactorOperationResult, TwoFactorProgressState, TwoFactorStopResult } from '../src/types'

contextBridge.exposeInMainWorld('desktopInfo', {
  appName: 'TG-Matrix',
  platform: process.platform,
  version: process.env.npm_package_version || '0.0.45'
})

contextBridge.exposeInMainWorld('desktopWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  setMode: (mode: 'license' | 'app') => ipcRenderer.invoke('window:set-mode', mode),
  openExternal: (url: string) => ipcRenderer.invoke('window:open-external', url)
})

contextBridge.exposeInMainWorld('desktopUpdater', {
  getState: () => ipcRenderer.invoke('app-updater:get-state') as Promise<AppUpdaterState>,
  checkForUpdates: () => ipcRenderer.invoke('app-updater:check') as Promise<AppUpdaterState>,
  downloadUpdate: () => ipcRenderer.invoke('app-updater:download') as Promise<AppUpdaterState>,
  quitAndInstall: () => ipcRenderer.invoke('app-updater:quit-and-install') as Promise<boolean>,
  onState: (callback: (state: AppUpdaterState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppUpdaterState) => callback(state)
    ipcRenderer.on('app-updater:state', listener)
    return () => ipcRenderer.removeListener('app-updater:state', listener)
  }
})

contextBridge.exposeInMainWorld('desktopAccounts', {
  list: () => ipcRenderer.invoke('accounts:list'),
  pickImportFiles: () => ipcRenderer.invoke('accounts:pick-import-files'),
  pickImportFolder: () => ipcRenderer.invoke('accounts:pick-import-folder'),
  scanFolder: (folderPath: string) => ipcRenderer.invoke('accounts:scan-folder', folderPath),
  importDroppedPaths: (paths: string[]) => ipcRenderer.invoke('accounts:import-dropped-paths', paths),
  deleteByIds: (ids: number[]) => ipcRenderer.invoke('accounts:delete', ids),
  deleteAll: () => ipcRenderer.invoke('accounts:delete-all'),
  markChecking: (ids: number[]) => ipcRenderer.invoke('accounts:mark-checking', ids),
  applySpamBotReply: (payload: { ids: number[]; replyText: string }) => ipcRenderer.invoke('accounts:apply-spambot-reply', payload),
  applyCheckResults: (items: CheckResultInput[]) => ipcRenderer.invoke('accounts:apply-check-results', items),
  startCheck: (payload: { ids: number[]; actions: CheckAction[] }) => ipcRenderer.invoke('accounts:start-check', payload),
  stopCheck: () => ipcRenderer.invoke('accounts:stop-check'),
  getCheckState: () => ipcRenderer.invoke('accounts:get-check-state'),
  clearCheckLogs: () => ipcRenderer.invoke('accounts:clear-check-logs'),
  onCheckState: (callback: (state: CheckQueueState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: CheckQueueState) => callback(state)
    ipcRenderer.on('accounts:check-state', listener)
    return () => ipcRenderer.removeListener('accounts:check-state', listener)
  },
  onAccountsUpdated: (callback: (accounts: AccountRecord[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, accounts: AccountRecord[]) => callback(accounts)
    ipcRenderer.on('accounts:updated', listener)
    return () => ipcRenderer.removeListener('accounts:updated', listener)
  },
  onImportProgress: (callback: (payload: ImportProgressPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ImportProgressPayload) => callback(payload)
    ipcRenderer.on('accounts:import-progress', listener)
    return () => ipcRenderer.removeListener('accounts:import-progress', listener)
  },
  exportByIds: (ids: number[]) => ipcRenderer.invoke('accounts:export', ids),
  revealPath: (targetPath: string) => ipcRenderer.invoke('accounts:reveal-path', targetPath),
  openTelegramWeb: (accountId: number) => ipcRenderer.invoke('accounts:open-telegram-web', accountId),
  readPremiumExpiryFromDesktop: (accountId: number) => ipcRenderer.invoke('accounts:read-premium-expiry-from-desktop', accountId),
  manageTwoFactor: (payload: TwoFactorOperationPayload) => ipcRenderer.invoke('accounts:manage-two-factor', payload) as Promise<TwoFactorOperationResult>,
  stopTwoFactor: () => ipcRenderer.invoke('accounts:stop-two-factor') as Promise<TwoFactorStopResult>,
  onTwoFactorProgress: (callback: (state: TwoFactorProgressState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TwoFactorProgressState) => callback(state)
    ipcRenderer.on('accounts:two-factor-progress', listener)
    return () => ipcRenderer.removeListener('accounts:two-factor-progress', listener)
  }
})

contextBridge.exposeInMainWorld('desktopSettings', {
  get: () => ipcRenderer.invoke('app-settings:get'),
  update: (patch: { checkConcurrency?: number; licenseApiBaseUrl?: string; licenseOfflineGraceDays?: number }) => ipcRenderer.invoke('app-settings:update', patch)
})

contextBridge.exposeInMainWorld('desktopBotCenter', {
  getState: () => ipcRenderer.invoke('bot-center:get-state') as Promise<BotCenterState>,
  addBot: () => ipcRenderer.invoke('bot-center:add-bot') as Promise<BotCenterState>,
  removeBot: (botId: string) => ipcRenderer.invoke('bot-center:remove-bot', botId) as Promise<BotCenterState>,
  selectBot: (botId: string) => ipcRenderer.invoke('bot-center:select-bot', botId) as Promise<BotCenterState>,
  saveConfig: (botId: string, patch: Partial<BotCenterConfig>) => ipcRenderer.invoke('bot-center:save-config', botId, patch) as Promise<BotCenterState>,
  refreshProfile: (botId: string) => ipcRenderer.invoke('bot-center:refresh-profile', botId) as Promise<BotCenterState>,
  start: (botId: string) => ipcRenderer.invoke('bot-center:start', botId) as Promise<BotCenterState>,
  stop: (botId: string) => ipcRenderer.invoke('bot-center:stop', botId) as Promise<BotCenterState>,
  clearLogs: (botId: string) => ipcRenderer.invoke('bot-center:clear-logs', botId) as Promise<BotCenterState>,
  onState: (callback: (state: BotCenterState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: BotCenterState) => callback(state)
    ipcRenderer.on('bot-center:state', listener)
    return () => ipcRenderer.removeListener('bot-center:state', listener)
  }
})

contextBridge.exposeInMainWorld('desktopProxyPool', {
  getState: () => ipcRenderer.invoke('proxy-pool:get-state'),
  replaceProxyList: (text: string) => ipcRenderer.invoke('proxy-pool:replace-list', text),
  updateSettings: (patch: Partial<ProxyPoolSettings>) => ipcRenderer.invoke('proxy-pool:update-settings', patch),
  clearLogs: () => ipcRenderer.invoke('proxy-pool:clear-logs'),
  startCheck: () => ipcRenderer.invoke('proxy-pool:start-check'),
  onState: (callback: (state: ProxyPoolState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ProxyPoolState) => callback(state)
    ipcRenderer.on('proxy-pool:state', listener)
    return () => ipcRenderer.removeListener('proxy-pool:state', listener)
  }
})

contextBridge.exposeInMainWorld('desktopLicense', {
  getState: () => ipcRenderer.invoke('license:get-state') as Promise<DesktopLicenseState>,
  activate: (cardKey: string) => ipcRenderer.invoke('license:activate', cardKey) as Promise<DesktopLicenseActivateResult>,
  validate: () => ipcRenderer.invoke('license:validate') as Promise<DesktopLicenseValidateResult>,
  clear: () => ipcRenderer.invoke('license:clear') as Promise<DesktopLicenseState>
})

contextBridge.exposeInMainWorld('desktopBroadcast', {
  pushSchedule: (payload: BroadcastPushSchedulePayload) => ipcRenderer.invoke('broadcast:push-schedule', payload),
  stopPushSchedule: () => ipcRenderer.invoke('broadcast:stop-push-schedule') as Promise<BroadcastStopResult>,
  listJoinedGroups: (accountId: number) => ipcRenderer.invoke('broadcast:list-joined-groups', accountId),
  listScheduledMessages: (accountId: number, groupRef: string) => ipcRenderer.invoke('broadcast:list-scheduled-messages', { accountId, groupRef }) as Promise<BroadcastScheduledMessageListResult>,
  deleteScheduledMessages: (payload: BroadcastDeleteScheduledMessagesPayload) => ipcRenderer.invoke('broadcast:delete-scheduled-messages', payload) as Promise<BroadcastDeleteScheduledMessagesResult>,
  onPushProgress: (callback: (payload: BroadcastPushScheduleProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: BroadcastPushScheduleProgress) => callback(payload)
    ipcRenderer.on('broadcast:push-progress', listener)
    return () => ipcRenderer.removeListener('broadcast:push-progress', listener)
  }
})

contextBridge.exposeInMainWorld('desktopDirectMessage', {
  sendMessages: (payload: DirectMessageSendPayload) => ipcRenderer.invoke('direct-message:send', payload),
  stopSend: () => ipcRenderer.invoke('direct-message:stop-send') as Promise<DirectMessageStopResult>,
  collectUsers: (payload: DirectMessageCollectPayload) => ipcRenderer.invoke('direct-message:collect-users', payload) as Promise<DirectMessageCollectResult>,
  collectGroupUsers: (payload: GroupCollectorPayload) => ipcRenderer.invoke('direct-message:collect-group-users', payload) as Promise<GroupCollectorResult>,
  startGroupCollectorTask: (payload: GroupCollectorTaskPayload) => ipcRenderer.invoke('direct-message:start-group-collector-task', payload) as Promise<GroupCollectorTaskStartResult>,
  stopGroupCollectorTask: (taskId: string) => ipcRenderer.invoke('direct-message:stop-group-collector-task', taskId) as Promise<GroupCollectorTaskStopResult>,
  configureAutoReply: (payload: DirectMessageAutoReplyPayload) => ipcRenderer.invoke('direct-message:configure-auto-reply', payload) as Promise<DirectMessageAutoReplyState>,
  getAutoReplyState: () => ipcRenderer.invoke('direct-message:get-auto-reply-state') as Promise<DirectMessageAutoReplyState>,
  onSendProgress: (callback: (payload: DirectMessageSendProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DirectMessageSendProgress) => callback(payload)
    ipcRenderer.on('direct-message:send-progress', listener)
    return () => ipcRenderer.removeListener('direct-message:send-progress', listener)
  },
  onGroupCollectorProgress: (callback: (payload: GroupCollectorTaskProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GroupCollectorTaskProgress) => callback(payload)
    ipcRenderer.on('direct-message:group-collector-progress', listener)
    return () => ipcRenderer.removeListener('direct-message:group-collector-progress', listener)
  },
  onAutoReplyEvent: (callback: (payload: DirectMessageAutoReplyEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DirectMessageAutoReplyEvent) => callback(payload)
    ipcRenderer.on('direct-message:auto-reply-event', listener)
    return () => ipcRenderer.removeListener('direct-message:auto-reply-event', listener)
  }
})

contextBridge.exposeInMainWorld('desktopAutoJoin', {
  start: (payload: AutoJoinPayload) => ipcRenderer.invoke('auto-join:start', payload) as Promise<AutoJoinTaskResult>,
  stop: () => ipcRenderer.invoke('auto-join:stop') as Promise<AutoJoinStopResult>,
  onProgress: (callback: (payload: AutoJoinProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AutoJoinProgress) => callback(payload)
    ipcRenderer.on('auto-join:progress', listener)
    return () => ipcRenderer.removeListener('auto-join:progress', listener)
  }
})
