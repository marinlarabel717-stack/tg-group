import { contextBridge, ipcRenderer } from 'electron'
import type { AccountRecord, CheckAction, CheckQueueState, CheckResultInput, ImportProgressPayload } from '../src/types'

contextBridge.exposeInMainWorld('desktopInfo', {
  appName: 'Telegram Multi Account Manager',
  platform: process.platform
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
  update: (patch: { checkConcurrency?: number }) => ipcRenderer.invoke('app-settings:update', patch)
})
