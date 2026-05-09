import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { CheckAction, CheckResultInput, ImportProgressPayload } from './types'
import type { AccountImportService } from './services/account-import-service'
import type { AccountRepository } from './services/account-repository'
import type { AccountStatusService } from './services/account-status-service'
import type { CheckQueue } from './check-engine/check-queue'
import type { AppSettingsStore } from '../app-settings-store'
import type { TelegramWebService } from './telegram-web-service'
import type { TelegramDesktopPremiumService } from './telegram-desktop-premium-service'

interface RegisterAccountIpcOptions {
  getMainWindow: () => BrowserWindow | null
  accountRepository: AccountRepository
  accountImportService: AccountImportService
  accountStatusService: AccountStatusService
  checkQueue: CheckQueue
  appSettingsStore: AppSettingsStore
  telegramWebService: TelegramWebService
  telegramDesktopPremiumService: TelegramDesktopPremiumService
  emitAccountsUpdated: (accounts: ReturnType<AccountRepository['list']>) => void
}

export function registerAccountIpc(options: RegisterAccountIpcOptions) {
  const { getMainWindow, accountRepository, accountImportService, accountStatusService, checkQueue, appSettingsStore, telegramWebService, telegramDesktopPremiumService, emitAccountsUpdated } = options

  const showOpenDialog = (dialogOptions: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow()
    return mainWindow ? dialog.showOpenDialog(mainWindow, dialogOptions) : dialog.showOpenDialog(dialogOptions)
  }

  const emitCheckState = () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:check-state', checkQueue.getState())
  }

  const emitImportProgress = (payload: ImportProgressPayload) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:import-progress', payload)
  }

  checkQueue.on('state', emitCheckState)

  ipcMain.handle('accounts:list', async () => {
    await accountImportService.syncManagedSessions()
    return accountRepository.list()
  })
  ipcMain.handle('accounts:get-check-state', () => checkQueue.getState())
  ipcMain.handle('app-settings:get', () => appSettingsStore.get())
  ipcMain.handle('app-settings:update', (_event, patch: { checkConcurrency?: number }) => {
    const next = appSettingsStore.update(patch)
    checkQueue.updateOptions({ concurrency: next.checkConcurrency })
    emitCheckState()
    return next
  })
  ipcMain.handle('accounts:clear-check-logs', () => {
    checkQueue.clearLogs()
    return checkQueue.getState()
  })
  ipcMain.handle('accounts:start-check', (_event, payload: number[] | { ids: number[]; actions?: CheckAction[] }) => {
    const ids = Array.isArray(payload) ? payload : payload?.ids ?? []
    const actions: CheckAction[] = Array.isArray(payload)
      ? ['account-status']
      : payload?.actions?.length
        ? payload.actions
        : ['account-status']
    const mode = actions.includes('account-survival') ? 'account-survival' : 'account-status'
    const state = checkQueue.enqueue(ids, mode)
    emitCheckState()
    return state
  })

  ipcMain.handle('accounts:pick-import-files', async () => {
    const result = await showOpenDialog({
      title: '选择 Session / JSON 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Telegram Session', extensions: ['session', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return accountImportService.importFromPaths(result.filePaths, emitImportProgress)
  })

  ipcMain.handle('accounts:pick-import-folder', async () => {
    const result = await showOpenDialog({
      title: '选择账号文件夹',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return accountImportService.importFromFolder(result.filePaths[0], emitImportProgress)
  })

  ipcMain.handle('accounts:scan-folder', async (_event, folderPath: string) => {
    return accountImportService.scanFolder(folderPath)
  })

  ipcMain.handle('accounts:import-dropped-paths', async (_event, inputPaths: string[]) => {
    return accountImportService.importFromPaths(inputPaths, emitImportProgress)
  })

  ipcMain.handle('accounts:delete', async (_event, ids: number[]) => {
    const accounts = accountRepository.getByIds(ids)
    await accountImportService.deleteManagedAccounts(accounts)
    return accountRepository.deleteByIds(ids)
  })

  ipcMain.handle('accounts:delete-all', async () => {
    const accounts = accountRepository.list()
    await accountImportService.deleteManagedAccounts(accounts)
    return accountRepository.deleteAll()
  })

  ipcMain.handle('accounts:mark-checking', (_event, ids: number[]) => {
    return accountStatusService.markChecking(ids)
  })

  ipcMain.handle('accounts:apply-spambot-reply', (_event, payload: { ids: number[]; replyText: string }) => {
    return accountStatusService.applySpamBotReply(payload.ids, payload.replyText)
  })

  ipcMain.handle('accounts:apply-check-results', (_event, items: CheckResultInput[]) => {
    return accountStatusService.applyCheckResults(items)
  })

  ipcMain.handle('accounts:export', async (_event, ids: number[]) => {
    if (ids.length === 0) {
      return { exportedCount: 0, targetDirectory: '' }
    }

    const result = await showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { exportedCount: 0, targetDirectory: '' }
    }

    const targetDirectory = result.filePaths[0]
    const accounts = accountRepository.getByIds(ids)
    const exportedCount = await accountImportService.exportManagedAccounts(accounts, targetDirectory)
    accountRepository.deleteByIds(ids)
    return { exportedCount, targetDirectory }
  })

  ipcMain.handle('accounts:reveal-path', async (_event, targetPath: string) => {
    const resolvedPath = path.resolve(targetPath)
    if (!fs.existsSync(resolvedPath)) return false
    shell.showItemInFolder(resolvedPath)
    return true
  })

  ipcMain.handle('accounts:open-telegram-web', async (_event, accountId: number) => {
    const account = accountRepository.getByIds([accountId])[0]
    if (!account) return false
    return telegramWebService.openAccountWeb(account)
  })

  ipcMain.handle('accounts:read-premium-expiry-from-desktop', async (_event, accountId: number) => {
    const account = accountRepository.getByIds([accountId])[0]
    if (!account) {
      return {
        ok: false,
        premiumExpiry: null,
        message: '账号不存在',
        rawText: null,
        screenshotPath: null
      }
    }

    const result = await telegramDesktopPremiumService.readPremiumExpiry(account)

    if (result.ok && result.premiumExpiry) {
      const accounts = accountRepository.applyCheckResults([{
        id: account.id,
        status: account.status,
        phone: account.phone,
        username: account.username,
        userId: account.userId,
        country: account.country,
        lastCheckTime: account.lastCheckTime,
        lastOnlineTime: account.lastOnlineTime,
        profile: {
          ...account.profile,
          premium_expiry: result.premiumExpiry,
          premium_expiry_source: 'mtproto-premium-promo',
          premium_expiry_synced_at: new Date().toISOString()
        }
      }])
      emitAccountsUpdated(accounts)
    }

    return result
  })
}
