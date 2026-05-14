import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { CheckAction, CheckResultInput, ImportProgressPayload, TwoFactorAction, TwoFactorLogEntry, TwoFactorOperationPayload, TwoFactorOperationPhase, TwoFactorOperationResult, TwoFactorOperationResultItem, TwoFactorProgressState } from './types'
import type { AppSettings } from '../app-settings-store'
import type { AccountImportService } from './services/account-import-service'
import type { AccountRepository } from './services/account-repository'
import type { AccountStatusService } from './services/account-status-service'
import type { CheckQueue } from './check-engine/check-queue'
import type { AppSettingsStore } from '../app-settings-store'
import type { TelegramWebService } from './telegram-web-service'
import type { TelegramDesktopPremiumService } from './telegram-desktop-premium-service'
import type { ProxyPoolService } from '../proxy-pool/service'
import type { TelethonTwoFactorService } from './telethon-two-factor-service'

interface RegisterAccountIpcOptions {
  getMainWindow: () => BrowserWindow | null
  accountRepository: AccountRepository
  accountImportService: AccountImportService
  accountStatusService: AccountStatusService
  checkQueue: CheckQueue
  appSettingsStore: AppSettingsStore
  proxyPoolService: ProxyPoolService
  telegramWebService: TelegramWebService
  telegramDesktopPremiumService: TelegramDesktopPremiumService
  telegramTwoFactorService: TelethonTwoFactorService
  emitAccountsUpdated: (accounts: ReturnType<AccountRepository['list']>) => void
  withManagedSessionsWatcherSuspended: <T>(action: () => Promise<T>) => Promise<T>
}

function createEmptyTwoFactorState(): TwoFactorProgressState {
  return {
    running: false,
    action: null,
    phase: 'apply',
    concurrency: 1,
    total: 0,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    currentAccountId: null,
    currentPhone: null,
    logs: [],
    lastUpdatedAt: null
  }
}

function createTwoFactorLogEntry(input: Omit<TwoFactorLogEntry, 'id' | 'createdAt'>): TwoFactorLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

function buildStoredTwoFactor(account: ReturnType<AccountRepository['getByIds']>[number]) {
  const raw = account.profile?.twoFA
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

function buildResolvedCurrentPassword(account: ReturnType<AccountRepository['getByIds']>[number], payload: TwoFactorOperationPayload) {
  const manual = typeof payload.currentPassword === 'string' ? payload.currentPassword.trim() : ''
  if (manual) return manual
  return buildStoredTwoFactor(account)
}

function buildRecoveryCodeMap(payload: TwoFactorOperationPayload) {
  const map = new Map<number, string>()
  for (const item of payload.recoveryCodes ?? []) {
    if (!item || !Number.isFinite(item.accountId)) continue
    const code = typeof item.code === 'string' ? item.code.trim() : ''
    if (!code) continue
    map.set(item.accountId, code)
  }
  return map
}

function buildProfileUpdateItem(account: ReturnType<AccountRepository['getByIds']>[number], nextTwoFA: string | null): CheckResultInput {
  return {
    id: account.id,
    status: account.status,
    phone: account.phone,
    username: account.username,
    userId: account.userId,
    country: account.country,
    proxyDisplay: account.proxyDisplay ?? null,
    lastCheckTime: account.lastCheckTime,
    lastOnlineTime: account.lastOnlineTime,
    profile: {
      ...account.profile,
      twoFA: nextTwoFA
    }
  }
}

function buildProfileUpdateItemWithOptionalTwoFA(account: ReturnType<AccountRepository['getByIds']>[number], nextTwoFA: string | null | undefined): CheckResultInput {
  if (typeof nextTwoFA === 'undefined') {
    return {
      id: account.id,
      status: account.status,
      phone: account.phone,
      username: account.username,
      userId: account.userId,
      country: account.country,
      proxyDisplay: account.proxyDisplay ?? null,
      lastCheckTime: account.lastCheckTime,
      lastOnlineTime: account.lastOnlineTime,
      profile: {
        ...account.profile
      }
    }
  }

  return buildProfileUpdateItem(account, nextTwoFA)
}

export function registerAccountIpc(options: RegisterAccountIpcOptions) {
  const { getMainWindow, accountRepository, accountImportService, accountStatusService, checkQueue, appSettingsStore, proxyPoolService, telegramWebService, telegramDesktopPremiumService, telegramTwoFactorService, emitAccountsUpdated, withManagedSessionsWatcherSuspended } = options
  let twoFactorState = createEmptyTwoFactorState()

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

  const emitTwoFactorProgress = () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:two-factor-progress', twoFactorState)
  }

  const updateTwoFactorState = (patch: Partial<TwoFactorProgressState>) => {
    twoFactorState = {
      ...twoFactorState,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
  }

  const pushTwoFactorLog = (entry: Omit<TwoFactorLogEntry, 'id' | 'createdAt'>) => {
    twoFactorState = {
      ...twoFactorState,
      logs: [...twoFactorState.logs, createTwoFactorLogEntry(entry)].slice(-400),
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
  }

  checkQueue.on('state', emitCheckState)

  ipcMain.handle('accounts:list', async () => {
    await accountImportService.syncManagedSessions()
    return accountRepository.list()
  })
  ipcMain.handle('accounts:get-check-state', () => checkQueue.getState())
  ipcMain.handle('app-settings:get', () => appSettingsStore.get())
  ipcMain.handle('app-settings:update', (_event, patch: Partial<AppSettings>) => {
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

    if (proxyPoolService.isEnabled() && !proxyPoolService.hasAvailableAccountCheckProxy()) {
      throw new Error('当前已开启全局代理，但没有可用代理，无法检查。请先导入代理或关闭全局代理后再试。')
    }

    const mode = actions.includes('account-survival') ? 'account-survival' : 'account-status'
    const state = checkQueue.enqueue(ids, mode)
    emitCheckState()
    return state
  })
  ipcMain.handle('accounts:stop-check', () => {
    const state = checkQueue.stop()
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
    return withManagedSessionsWatcherSuspended(() => accountImportService.importFromPaths(result.filePaths, emitImportProgress))
  })

  ipcMain.handle('accounts:pick-import-folder', async () => {
    const result = await showOpenDialog({
      title: '选择账号文件夹',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return withManagedSessionsWatcherSuspended(() => accountImportService.importFromFolder(result.filePaths[0], emitImportProgress))
  })

  ipcMain.handle('accounts:scan-folder', async (_event, folderPath: string) => {
    return accountImportService.scanFolder(folderPath)
  })

  ipcMain.handle('accounts:import-dropped-paths', async (_event, inputPaths: string[]) => {
    return withManagedSessionsWatcherSuspended(() => accountImportService.importFromPaths(inputPaths, emitImportProgress))
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
      return { exportedCount: 0, targetDirectory: '', accounts: accountRepository.list() }
    }

    const result = await showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { exportedCount: 0, targetDirectory: '', accounts: accountRepository.list() }
    }

    const targetDirectory = result.filePaths[0]
    const accounts = accountRepository.getByIds(ids)
    const emitExportProgress = (payload: ImportProgressPayload) => {
      emitImportProgress({ ...payload, mode: 'export' })
    }
    const exportedCount = await withManagedSessionsWatcherSuspended(() => accountImportService.exportManagedAccounts(accounts, targetDirectory, emitExportProgress))
    const remainingAccounts = accountRepository.deleteByIds(ids)
    return { exportedCount, targetDirectory, accounts: remainingAccounts }
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

  ipcMain.handle('accounts:manage-two-factor', async (_event, payload: TwoFactorOperationPayload): Promise<TwoFactorOperationResult> => {
    const accountIds = Array.isArray(payload?.accountIds) ? payload.accountIds.filter((id) => Number.isFinite(id)) : []
    const action = payload?.action
    const phase: TwoFactorOperationPhase = payload?.phase ?? 'apply'

    if (!action || !['change-2fa', 'disable-2fa', 'reset-2fa'].includes(action)) {
      throw new Error('2FA 操作类型不正确。')
    }
    if (accountIds.length === 0) {
      throw new Error('请先选择要处理的账号。')
    }
    if (twoFactorState.running) {
      throw new Error('当前已经有一个 2FA 任务正在执行，请等它完成后再试。')
    }

    const accounts = accountRepository.getByIds(accountIds)
    const accountMap = new Map(accounts.map((account) => [account.id, account]))
    const orderedAccounts = accountIds
      .map((id) => accountMap.get(id))
      .filter((account): account is NonNullable<typeof account> => Boolean(account))

    if (orderedAccounts.length === 0) {
      throw new Error('没有找到可执行的账号。')
    }

    if (action === 'disable-2fa') {
      const hasAnyPassword = orderedAccounts.some((account) => Boolean(buildResolvedCurrentPassword(account, payload)))
      if (!hasAnyPassword) {
        throw new Error('当前没有可用的旧 2FA，至少要手动填写一个旧 2FA，或者先给账号补上本地 2FA 记录。')
      }
    }

    if (action === 'change-2fa' && !(payload.newPassword?.trim())) {
      throw new Error('请先填写新的 2FA。')
    }

    const recoveryCodeMap = buildRecoveryCodeMap(payload)

    const runtimeConcurrency = Math.max(1, appSettingsStore.get().checkConcurrency)

    twoFactorState = {
      running: true,
      action: action as TwoFactorAction,
      phase,
      concurrency: Math.min(runtimeConcurrency, Math.max(1, orderedAccounts.length)),
      total: orderedAccounts.length,
      completed: 0,
      successCount: 0,
      failedCount: 0,
      currentAccountId: null,
      currentPhone: null,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()

    const results: TwoFactorOperationResultItem[] = []

    try {
      pushTwoFactorLog({
        accountId: null,
        phone: '',
        level: 'info',
        message: action === 'reset-2fa'
          ? `已开始为 ${orderedAccounts.length} 个账号发起 2FA 重置申请，当前按 ${twoFactorState.concurrency} 个并发执行。`
          : `已开始执行 ${orderedAccounts.length} 个账号的 2FA 任务，当前按 ${twoFactorState.concurrency} 个并发执行。`
      })

      const pendingProfileUpdates: CheckResultInput[] = []
      const queue = [...orderedAccounts]
      const workerCount = Math.min(twoFactorState.concurrency, queue.length)

      const runAccount = async (account: typeof orderedAccounts[number]) => {
        const currentPassword = buildResolvedCurrentPassword(account, payload)
        const recoveryCode = recoveryCodeMap.get(account.id) ?? ''
        updateTwoFactorState({
          currentAccountId: account.id,
          currentPhone: account.phone
        })
        pushTwoFactorLog({
          accountId: account.id,
          phone: account.phone,
          level: 'info',
          message: action === 'reset-2fa'
            ? `开始为 ${account.phone || `账号 #${account.id}`} 发起 2FA 重置申请。`
            : `开始处理 ${account.phone || `账号 #${account.id}`}。`
        })

        const result = await telegramTwoFactorService.execute(account, {
          ...payload,
          currentPassword,
          recoveryCode
        })

        results.push(result)

        if (result.success) {
          if (action !== 'reset-2fa' || result.nextTwoFA !== undefined) {
            pendingProfileUpdates.push(buildProfileUpdateItemWithOptionalTwoFA(account, result.nextTwoFA))
          }

          pushTwoFactorLog({
            accountId: account.id,
            phone: account.phone,
            level: 'success',
            message: result.message
          })
          updateTwoFactorState({
            completed: twoFactorState.completed + 1,
            successCount: twoFactorState.successCount + 1
          })
          return
        }

        pushTwoFactorLog({
          accountId: account.id,
          phone: account.phone,
          level: 'error',
          message: result.message
        })
        updateTwoFactorState({
          completed: twoFactorState.completed + 1,
          failedCount: twoFactorState.failedCount + 1
        })
      }

      const workers = Array.from({ length: workerCount }, () => (async () => {
        while (true) {
          const account = queue.shift()
          if (!account) {
            return
          }
          await runAccount(account)
        }
      })())

      await Promise.all(workers)

      if (pendingProfileUpdates.length > 0) {
        const accountsSnapshot = accountRepository.applyCheckResults(pendingProfileUpdates)
        emitAccountsUpdated(accountsSnapshot)
      }
    } finally {
      updateTwoFactorState({
        running: false,
        currentAccountId: null,
        currentPhone: null
      })
    }

    pushTwoFactorLog({
      accountId: null,
      phone: '',
      level: 'info',
      message: `2FA 任务执行完成：成功 ${twoFactorState.successCount}，失败 ${twoFactorState.failedCount}。`
    })

    return {
      action: action as TwoFactorAction,
      phase,
      total: orderedAccounts.length,
      successCount: twoFactorState.successCount,
      failedCount: twoFactorState.failedCount,
      results
    }
  })
}
