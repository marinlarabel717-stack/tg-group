import { contextBridge, ipcRenderer } from 'electron'
import type { AccountRecord, BroadcastPushSchedulePayload, BroadcastPushScheduleProgress, CheckAction, CheckQueueState, CheckResultInput, DesktopLicenseActivateResult, DesktopLicenseState, DesktopLicenseValidateResult, ImportProgressPayload, ProxyPoolSettings, ProxyPoolState } from '../src/types'

contextBridge.exposeInMainWorld('desktopInfo', {
  appName: 'Telegram Multi Account Manager',
  platform: process.platform,
  version: process.env.npm_package_version || '0.0.1'
})

contextBridge.exposeInMainWorld('desktopWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized')
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
  readPremiumExpiryFromDesktop: (accountId: number) => ipcRenderer.invoke('accounts:read-premium-expiry-from-desktop', accountId)
})

contextBridge.exposeInMainWorld('desktopSettings', {
  get: () => ipcRenderer.invoke('app-settings:get'),
  update: (patch: { checkConcurrency?: number; licenseApiBaseUrl?: string; licenseOfflineGraceDays?: number }) => ipcRenderer.invoke('app-settings:update', patch)
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
  listJoinedGroups: (accountId: number) => ipcRenderer.invoke('broadcast:list-joined-groups', accountId),
  onPushProgress: (callback: (payload: BroadcastPushScheduleProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: BroadcastPushScheduleProgress) => callback(payload)
    ipcRenderer.on('broadcast:push-progress', listener)
    return () => ipcRenderer.removeListener('broadcast:push-progress', listener)
  }
})
