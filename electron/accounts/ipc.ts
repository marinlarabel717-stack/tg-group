import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { AccountListQuery, CheckAction, CheckResultInput, ImportProgressPayload, ProfileOperationAction, ProfileOperationLogEntry, ProfileOperationPayload, ProfileOperationProgressState, ProfileOperationResult, ProfileOperationResultItem, ProfileOperationStopResult, ReauthorizeLogEntry, ReauthorizeOperationPayload, ReauthorizeOperationResult, ReauthorizeOperationResultItem, ReauthorizeProgressState, TwoFactorAction, TwoFactorLogEntry, TwoFactorOperationPayload, TwoFactorOperationPhase, TwoFactorOperationResult, TwoFactorOperationResultItem, TwoFactorProgressState, TwoFactorStopResult } from './types'
import type { AppSettings } from '../app-settings-store'
import type { AccountImportService } from './services/account-import-service'
import type { AccountRepository } from './services/account-repository'
import type { AccountStatusService } from './services/account-status-service'
import type { CheckQueue } from './check-engine/check-queue'
import type { AppSettingsStore } from '../app-settings-store'
import type { TelegramWebService } from './telegram-web-service'
import type { TelegramDesktopPremiumService } from './telegram-desktop-premium-service'
import type { TelegramReauthorizationService } from './telegram-reauthorization-service'
import type { ProxyPoolService } from '../proxy-pool/service'
import type { TelethonTwoFactorService } from './telethon-two-factor-service'
import type { TelethonProfileService } from './telethon-profile-service'
import { serializeAccountsForRenderer } from './services/account-renderer-serializer'

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
  telegramReauthorizationService: TelegramReauthorizationService
  telegramTwoFactorService: TelethonTwoFactorService
  telegramProfileService: TelethonProfileService
  emitAccountsUpdated: (accounts: ReturnType<AccountRepository['list']>) => void
  withManagedSessionsWatcherSuspended: <T>(action: () => Promise<T>) => Promise<T>
}

function createEmptyTwoFactorState(): TwoFactorProgressState {
  return {
    running: false,
    stopRequested: false,
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

function createEmptyProfileOperationState(): ProfileOperationProgressState {
  return {
    running: false,
    stopRequested: false,
    action: null,
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

function createEmptyReauthorizeState(): ReauthorizeProgressState {
  return {
    running: false,
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

function createProfileOperationLogEntry(input: Omit<ProfileOperationLogEntry, 'id' | 'createdAt'>): ProfileOperationLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

function createReauthorizeLogEntry(input: Omit<ReauthorizeLogEntry, 'id' | 'createdAt'>): ReauthorizeLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

function trimOperationLogs<T extends { level: string }>(logs: T[], maxNonErrorLogs = 400) {
  let removableRegularLogs = Math.max(0, logs.filter((log) => log.level !== 'error').length - maxNonErrorLogs)
  if (removableRegularLogs <= 0) return logs

  return logs.filter((log) => {
    if (log.level === 'error') return true
    if (removableRegularLogs > 0) {
      removableRegularLogs -= 1
      return false
    }
    return true
  })
}

function serializeCheckStateForRenderer(state: ReturnType<CheckQueue['getState']>) {
  if (!state.running) return state

  return {
    ...state,
    queuedAccountIds: state.queuedAccountIds,
    activeAccountIds: state.activeAccountIds.slice(-Math.max(1, state.concurrency))
  }
}

function buildDeferredStartCheckState(current: ReturnType<CheckQueue['getState']>, ids: number[], mode: 'account-status' | 'account-survival') {
  const acceptedIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))) )
  const nextTotalCount = current.running ? current.totalCount + acceptedIds.length : acceptedIds.length

  return {
    ...current,
    running: acceptedIds.length > 0 || current.running,
    runMode: mode,
    totalCount: nextTotalCount,
    pendingCount: current.running ? current.pendingCount + acceptedIds.length : acceptedIds.length,
    activeCount: current.activeCount,
    completedCount: current.running ? current.completedCount : 0,
    failedCount: current.running ? current.failedCount : 0,
    queuedAccountIds: [],
    activeAccountIds: current.activeAccountIds,
    logs: current.running ? current.logs : [],
    resultSummary: current.running ? current.resultSummary : {
      total: 0,
      alive: 0,
      limited: 0,
      temporary_limited: 0,
      geo_restricted: 0,
      frozen: 0,
      banned: 0,
      session_expired: 0,
      not_logged_in: 0,
      multi_ip: 0,
      timeout: 0,
      unknown: 0
    },
    lastUpdatedAt: new Date().toISOString()
  }
}

const CHECK_START_CHUNK_SIZE = 100

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

function buildProfileUpdateItemFromOperation(account: ReturnType<AccountRepository['getByIds']>[number], result: ProfileOperationResultItem): CheckResultInput {
  const nextUsername = typeof result.username === 'string' ? result.username.trim() : ''
  const nextFirstName = typeof result.firstName === 'string' ? result.firstName : null
  const nextLastName = typeof result.lastName === 'string' ? result.lastName : null
  const nextBio = typeof result.bio === 'string' ? result.bio : null
  const nextAvatar = Object.prototype.hasOwnProperty.call(result, 'avatar') ? result.avatar ?? null : account.profile?.avatar ?? null
  const nextHasProfilePhoto = typeof result.hasProfilePhoto === 'boolean'
    ? result.hasProfilePhoto
    : Boolean(account.profile?.has_profile_pic)

  return {
    id: account.id,
    status: account.status,
    phone: account.phone,
    username: nextUsername ? (nextUsername.startsWith('@') ? nextUsername : `@${nextUsername}`) : '',
    userId: account.userId,
    country: account.country,
    proxyDisplay: account.proxyDisplay ?? null,
    lastCheckTime: account.lastCheckTime,
    lastOnlineTime: account.lastOnlineTime,
    profile: {
      ...account.profile,
      username: nextUsername || null,
      first_name: nextFirstName,
      last_name: nextLastName,
      bio: nextBio,
      avatar: nextAvatar,
      has_profile_pic: nextHasProfilePhoto
    }
  }
}

export function registerAccountIpc(options: RegisterAccountIpcOptions) {
  const { getMainWindow, accountRepository, accountImportService, accountStatusService, checkQueue, appSettingsStore, proxyPoolService, telegramWebService, telegramDesktopPremiumService, telegramReauthorizationService, telegramTwoFactorService, telegramProfileService, emitAccountsUpdated, withManagedSessionsWatcherSuspended } = options
  let twoFactorState = createEmptyTwoFactorState()
  let twoFactorStopRequested = false
  let reauthorizeState = createEmptyReauthorizeState()
  let profileOperationState = createEmptyProfileOperationState()
  let profileOperationStopRequested = false
  let checkStateEmitTimer: NodeJS.Timeout | null = null
  let checkLogsEmitTimer: NodeJS.Timeout | null = null
  let checkLaunchToken = 0

  const flushCheckState = () => {
    if (checkStateEmitTimer) {
      clearTimeout(checkStateEmitTimer)
      checkStateEmitTimer = null
    }

    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:check-state', serializeCheckStateForRenderer(checkQueue.getSummaryState()))
  }

  const flushCheckLogs = () => {
    if (checkLogsEmitTimer) {
      clearTimeout(checkLogsEmitTimer)
      checkLogsEmitTimer = null
    }

    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:check-logs', checkQueue.getLogs())
  }

  const showOpenDialog = (dialogOptions: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow()
    return mainWindow ? dialog.showOpenDialog(mainWindow, dialogOptions) : dialog.showOpenDialog(dialogOptions)
  }

  const emitCheckState = (force = false) => {
    if (force) {
      flushCheckState()
      return
    }

    if (!checkQueue.isRunning()) {
      flushCheckState()
      return
    }

    if (checkStateEmitTimer) return
    checkStateEmitTimer = setTimeout(() => {
      flushCheckState()
    }, 280)
  }

  const emitCheckLogs = (force = false) => {
    if (force) {
      flushCheckLogs()
      return
    }

    if (!checkQueue.isRunning()) {
      flushCheckLogs()
      return
    }

    if (checkLogsEmitTimer) return
    checkLogsEmitTimer = setTimeout(() => {
      flushCheckLogs()
    }, 420)
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

  const emitReauthorizeProgress = () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:reauthorize-progress', reauthorizeState)
  }

  const emitProfileOperationProgress = () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('accounts:profile-operation-progress', profileOperationState)
  }

  const updateTwoFactorState = (patch: Partial<TwoFactorProgressState>) => {
    twoFactorState = {
      ...twoFactorState,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
  }

  const updateReauthorizeState = (patch: Partial<ReauthorizeProgressState>) => {
    reauthorizeState = {
      ...reauthorizeState,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    emitReauthorizeProgress()
  }

  const bumpTwoFactorCounters = (kind: 'success' | 'failed') => {
    twoFactorState = {
      ...twoFactorState,
      completed: twoFactorState.completed + 1,
      successCount: twoFactorState.successCount + (kind === 'success' ? 1 : 0),
      failedCount: twoFactorState.failedCount + (kind === 'failed' ? 1 : 0),
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
  }

  const pushTwoFactorLog = (entry: Omit<TwoFactorLogEntry, 'id' | 'createdAt'>) => {
    const nextLogs = trimOperationLogs([...twoFactorState.logs, createTwoFactorLogEntry(entry)])
    twoFactorState = {
      ...twoFactorState,
      logs: nextLogs,
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
  }

  const bumpReauthorizeCounters = (kind: 'success' | 'failed') => {
    reauthorizeState = {
      ...reauthorizeState,
      completed: reauthorizeState.completed + 1,
      successCount: reauthorizeState.successCount + (kind === 'success' ? 1 : 0),
      failedCount: reauthorizeState.failedCount + (kind === 'failed' ? 1 : 0),
      lastUpdatedAt: new Date().toISOString()
    }
    emitReauthorizeProgress()
  }

  const pushReauthorizeLog = (entry: Omit<ReauthorizeLogEntry, 'id' | 'createdAt'>) => {
    const nextLogs = trimOperationLogs([...reauthorizeState.logs, createReauthorizeLogEntry(entry)])
    reauthorizeState = {
      ...reauthorizeState,
      logs: nextLogs,
      lastUpdatedAt: new Date().toISOString()
    }
    emitReauthorizeProgress()
  }

  const updateProfileOperationState = (patch: Partial<ProfileOperationProgressState>) => {
    profileOperationState = {
      ...profileOperationState,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    emitProfileOperationProgress()
  }

  const bumpProfileOperationCounters = (kind: 'success' | 'failed') => {
    profileOperationState = {
      ...profileOperationState,
      completed: profileOperationState.completed + 1,
      successCount: profileOperationState.successCount + (kind === 'success' ? 1 : 0),
      failedCount: profileOperationState.failedCount + (kind === 'failed' ? 1 : 0),
      lastUpdatedAt: new Date().toISOString()
    }
    emitProfileOperationProgress()
  }

  const pushProfileOperationLog = (entry: Omit<ProfileOperationLogEntry, 'id' | 'createdAt'>) => {
    const nextLogs = trimOperationLogs([...profileOperationState.logs, createProfileOperationLogEntry(entry)])
    profileOperationState = {
      ...profileOperationState,
      logs: nextLogs,
      lastUpdatedAt: new Date().toISOString()
    }
    emitProfileOperationProgress()
  }

  checkQueue.on('state', () => {
    emitCheckState()
    emitCheckLogs()
  })

  ipcMain.handle('accounts:list', async () => serializeAccountsForRenderer(accountRepository.list()))
  ipcMain.handle('accounts:list-page', async (_event, query: AccountListQuery) => {
    const result = accountRepository.listPage(query)
    return {
      accounts: serializeAccountsForRenderer(result.accounts),
      total: result.total
    }
  })
  ipcMain.handle('accounts:list-ids', async (_event, query: Pick<AccountListQuery, 'search' | 'statusFilter' | 'countryFilter' | 'sourceFilter' | 'proxyFilter' | 'premiumFilter' | 'twoFactorFilter' | 'avatarFilter' | 'usernameFilter'>) => accountRepository.listIds(query))
  ipcMain.handle('accounts:get-check-state', () => serializeCheckStateForRenderer(checkQueue.getSummaryState()))
  ipcMain.handle('accounts:get-check-logs', () => checkQueue.getLogs())
  ipcMain.handle('app-settings:get', () => appSettingsStore.get())
  ipcMain.handle('app-settings:update', (_event, patch: Partial<AppSettings>) => {
    const next = appSettingsStore.update(patch)
    checkQueue.updateOptions({ concurrency: next.checkConcurrency })
    emitCheckState(true)
    emitCheckLogs(true)
    return next
  })
  ipcMain.handle('accounts:clear-check-logs', () => {
    checkQueue.clearLogs()
    emitCheckState(true)
    emitCheckLogs(true)
    return serializeCheckStateForRenderer(checkQueue.getSummaryState())
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
    const previewState = buildDeferredStartCheckState(checkQueue.getSummaryState(), ids, mode)
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))))
    checkLaunchToken += 1
    const launchToken = checkLaunchToken

    const enqueueChunk = (offset: number) => {
      if (launchToken !== checkLaunchToken) return

      const chunk = uniqueIds.slice(offset, offset + CHECK_START_CHUNK_SIZE)
      if (chunk.length === 0) return

      try {
        checkQueue.enqueue(chunk, mode, offset === 0 ? uniqueIds.length : undefined)
      } catch (error) {
        console.error('启动账号检测任务失败：', error)
        return
      }

      if (offset + chunk.length < uniqueIds.length) {
        setTimeout(() => enqueueChunk(offset + chunk.length), 0)
      }
    }

    setTimeout(() => enqueueChunk(0), 0)

    return serializeCheckStateForRenderer(previewState)
  })
  ipcMain.handle('accounts:stop-check', () => {
    checkLaunchToken += 1
    checkQueue.stop()
    emitCheckState(true)
    emitCheckLogs(true)
    return serializeCheckStateForRenderer(checkQueue.getSummaryState())
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
    const importResult = await withManagedSessionsWatcherSuspended(() => accountImportService.importFromPaths(result.filePaths, emitImportProgress))
    return {
      ...importResult,
      accounts: undefined
    }
  })

  ipcMain.handle('accounts:pick-import-folder', async () => {
    const result = await showOpenDialog({
      title: '选择账号文件夹',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    const importResult = await withManagedSessionsWatcherSuspended(() => accountImportService.importFromFolder(result.filePaths[0], emitImportProgress))
    return {
      ...importResult,
      accounts: undefined
    }
  })

  ipcMain.handle('accounts:scan-folder', async (_event, folderPath: string) => {
    return accountImportService.scanFolder(folderPath)
  })

  ipcMain.handle('accounts:import-dropped-paths', async (_event, inputPaths: string[]) => {
    const importResult = await withManagedSessionsWatcherSuspended(() => accountImportService.importFromPaths(inputPaths, emitImportProgress))
    return {
      ...importResult,
      accounts: undefined
    }
  })

  ipcMain.handle('accounts:delete', async (_event, ids: number[]) => {
    const accounts = accountRepository.getByIds(ids)
    const emitDeleteProgress = (payload: ImportProgressPayload) => {
      emitImportProgress({ ...payload, mode: 'delete' })
    }
    await accountImportService.deleteManagedAccounts(accounts, emitDeleteProgress)
    return serializeAccountsForRenderer(accountRepository.deleteByIds(ids))
  })

  ipcMain.handle('accounts:delete-all', async () => {
    const accounts = accountRepository.list()
    const emitDeleteProgress = (payload: ImportProgressPayload) => {
      emitImportProgress({ ...payload, mode: 'delete' })
    }
    await accountImportService.deleteManagedAccounts(accounts, emitDeleteProgress)
    return serializeAccountsForRenderer(accountRepository.deleteAll())
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
      return { exportedCount: 0, targetDirectory: '', accounts: undefined }
    }

    const result = await showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { exportedCount: 0, targetDirectory: '', accounts: undefined }
    }

    const targetDirectory = result.filePaths[0]
    const accounts = accountRepository.getByIds(ids)
    const emitExportProgress = (payload: ImportProgressPayload) => {
      emitImportProgress({ ...payload, mode: 'export' })
    }
    const exportedCount = await withManagedSessionsWatcherSuspended(() => accountImportService.exportManagedAccounts(accounts, targetDirectory, emitExportProgress))
    accountRepository.deleteByIds(ids)
    return { exportedCount, targetDirectory, accounts: undefined }
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

  ipcMain.handle('accounts:pick-profile-avatar', async () => {
    const result = await showOpenDialog({
      title: '选择头像图片',
      properties: ['openFile'],
      filters: [
        { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('accounts:reauthorize', async (_event, payload: ReauthorizeOperationPayload): Promise<ReauthorizeOperationResult> => withManagedSessionsWatcherSuspended(async () => {
    const accountIds = Array.isArray(payload?.accountIds) ? payload.accountIds.filter((id) => Number.isFinite(id)) : []
    if (accountIds.length === 0) {
      throw new Error('请先选择需要重新授权的账号。')
    }

    const accounts = accountRepository.getByIds(accountIds)
    const accountMap = new Map(accounts.map((account) => [account.id, account]))
    const orderedAccounts = accountIds
      .map((id) => accountMap.get(id))
      .filter((account): account is NonNullable<typeof account> => Boolean(account))

    if (orderedAccounts.length === 0) {
      throw new Error('没有找到可执行的账号。')
    }

    reauthorizeState = {
      running: true,
      total: orderedAccounts.length,
      completed: 0,
      successCount: 0,
      failedCount: 0,
      currentAccountId: null,
      currentPhone: null,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    emitReauthorizeProgress()

    pushReauthorizeLog({
      accountId: null,
      phone: '',
      level: 'info',
      message: `已开始执行 ${orderedAccounts.length} 个账号的重新授权任务。`
    })

    const results: ReauthorizeOperationResultItem[] = []
    const profileUpdates: CheckResultInput[] = []
    const startedAt = new Date().toISOString()

    try {
      for (const account of orderedAccounts) {
        updateReauthorizeState({
          currentAccountId: account.id,
          currentPhone: account.phone || account.username || `账号#${account.id}`
        })
        pushReauthorizeLog({
          accountId: account.id,
          phone: account.phone,
          level: 'info',
          message: '开始处理当前账号。'
        })

        const item = await telegramReauthorizationService.reauthorize(account, payload, {
          log: (level, message) => {
            pushReauthorizeLog({
              accountId: account.id,
              phone: account.phone,
              level,
              message
            })
          }
        })
        results.push(item)
        bumpReauthorizeCounters(item.success ? 'success' : 'failed')

        if (!item.success) {
          pushReauthorizeLog({
            accountId: account.id,
            phone: account.phone,
            level: item.status === 'password_mismatch' || item.status === 'session_expired' ? 'warning' : 'error',
            message: `账号处理结束：${item.message}`
          })
          continue
        }

        profileUpdates.push({
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
            twoFA: item.matchedPassword ?? (typeof account.profile?.twoFA === 'string' ? account.profile.twoFA : null),
            last_connect_date: startedAt,
            reauthorize_mode: 'desktop',
            reauthorize_at: startedAt,
            reauthorize_deleted_system_messages: Boolean(item.officialMessagesCleared)
          }
        })

        pushReauthorizeLog({
          accountId: account.id,
          phone: account.phone,
          level: 'success',
          message: `账号处理结束：${item.message}`
        })
      }

      if (profileUpdates.length > 0) {
        emitAccountsUpdated(accountRepository.applyCheckResults(profileUpdates))
      }

      const successCount = results.filter((item) => item.success).length
      const failedCount = results.length - successCount

      pushReauthorizeLog({
        accountId: null,
        phone: '',
        level: successCount > 0 ? 'success' : 'warning',
        message: successCount > 0
          ? `重新授权任务完成：共 ${results.length} 个账号，成功 ${successCount} 个，失败 ${failedCount} 个。`
          : `重新授权任务完成：共 ${results.length} 个账号，全部执行失败。`
      })

      return {
        total: results.length,
        successCount,
        failedCount,
        results,
        message: successCount > 0
          ? `本次已完成 ${results.length} 个账号的重新授权，其中成功 ${successCount} 个。`
          : '本次没有账号重新授权成功。'
      }
    } finally {
      updateReauthorizeState({
        running: false,
        currentAccountId: null,
        currentPhone: null
      })
    }
  }))

  ipcMain.handle('accounts:get-reauthorize-state', () => reauthorizeState)
  ipcMain.handle('accounts:clear-reauthorize-logs', () => {
    reauthorizeState = {
      ...reauthorizeState,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    emitReauthorizeProgress()
    return reauthorizeState
  })

  ipcMain.handle('accounts:get-two-factor-state', () => twoFactorState)
  ipcMain.handle('accounts:clear-two-factor-logs', () => {
    twoFactorState = {
      ...twoFactorState,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    emitTwoFactorProgress()
    return twoFactorState
  })

  ipcMain.handle('accounts:stop-two-factor', async (): Promise<TwoFactorStopResult> => {
    if (!twoFactorState.running) {
      return {
        stopped: false,
        message: '当前没有正在执行的 2FA 任务。'
      }
    }

    if (twoFactorStopRequested || twoFactorState.stopRequested) {
      return {
        stopped: false,
        message: '已经在停止当前 2FA 任务了，请等已启动的账号先收尾。'
      }
    }

    twoFactorStopRequested = true
    telegramTwoFactorService.cancelActiveOperations()
    updateTwoFactorState({ stopRequested: true })
    pushTwoFactorLog({
      accountId: null,
      phone: '',
      level: 'warning',
      message: '已收到停止指令：不会再领取新账号，并会立即终止当前仍在执行的账号。'
    })

    return {
      stopped: true,
      message: '已开始停止当前 2FA 任务，并正在中断已启动的账号。'
    }
  })

  ipcMain.handle('accounts:get-profile-operation-state', () => profileOperationState)
  ipcMain.handle('accounts:clear-profile-operation-logs', () => {
    profileOperationState = {
      ...profileOperationState,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    emitProfileOperationProgress()
    return profileOperationState
  })

  ipcMain.handle('accounts:stop-profile-operation', async (): Promise<ProfileOperationStopResult> => {
    if (!profileOperationState.running) {
      return {
        stopped: false,
        message: '当前没有正在执行的个人资料任务。'
      }
    }

    if (profileOperationStopRequested || profileOperationState.stopRequested) {
      return {
        stopped: false,
        message: '已经在停止当前个人资料任务了，请等已启动的账号先收尾。'
      }
    }

    profileOperationStopRequested = true
    telegramProfileService.cancelActiveOperations()
    updateProfileOperationState({ stopRequested: true })
    pushProfileOperationLog({
      accountId: null,
      phone: '',
      level: 'warning',
      message: '已收到停止指令：不会再领取新账号，并会立即终止当前仍在执行的账号。'
    })

    return {
      stopped: true,
      message: '已开始停止当前个人资料任务，并正在中断已启动的账号。'
    }
  })

  ipcMain.handle('accounts:manage-two-factor', async (_event, payload: TwoFactorOperationPayload): Promise<TwoFactorOperationResult> => withManagedSessionsWatcherSuspended(async () => {
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

    twoFactorStopRequested = false
    telegramTwoFactorService.cancelActiveOperations()
    twoFactorState = {
      running: true,
      stopRequested: false,
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
          bumpTwoFactorCounters('success')
          return
        }

        pushTwoFactorLog({
          accountId: account.id,
          phone: account.phone,
          level: 'error',
          message: result.message
        })
        bumpTwoFactorCounters('failed')
      }

      const workers = Array.from({ length: workerCount }, () => (async () => {
        while (true) {
          if (twoFactorStopRequested) {
            return
          }
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
        stopRequested: twoFactorStopRequested,
        currentAccountId: null,
        currentPhone: null
      })
    }

    pushTwoFactorLog({
      accountId: null,
      phone: '',
      level: 'info',
      message: twoFactorStopRequested
        ? `2FA 任务已停止：成功 ${twoFactorState.successCount}，失败 ${twoFactorState.failedCount}，剩余 ${Math.max(0, orderedAccounts.length - twoFactorState.completed)} 个账号未继续执行。`
        : `2FA 任务执行完成：成功 ${twoFactorState.successCount}，失败 ${twoFactorState.failedCount}。`
    })

    const finalMessage = twoFactorStopRequested
      ? `2FA 任务已停止：成功 ${twoFactorState.successCount}，失败 ${twoFactorState.failedCount}，剩余 ${Math.max(0, orderedAccounts.length - twoFactorState.completed)} 个账号未继续执行。`
      : `2FA 任务执行完成：成功 ${twoFactorState.successCount}，失败 ${twoFactorState.failedCount}。`

    twoFactorStopRequested = false

    return {
      action: action as TwoFactorAction,
      phase,
      total: orderedAccounts.length,
      successCount: twoFactorState.successCount,
      failedCount: twoFactorState.failedCount,
      results,
      message: finalMessage
    }
  }))

  ipcMain.handle('accounts:manage-profile-operation', async (_event, payload: ProfileOperationPayload): Promise<ProfileOperationResult> => withManagedSessionsWatcherSuspended(async () => {
    const accountIds = Array.isArray(payload?.accountIds) ? payload.accountIds.filter((id) => Number.isFinite(id)) : []
    const action = payload?.action

    if (!action) {
      throw new Error('个人资料操作类型不正确。')
    }
    if (accountIds.length === 0) {
      throw new Error('请先选择要处理的账号。')
    }
    if (profileOperationState.running) {
      throw new Error('当前已经有一个个人资料任务正在执行，请等它完成后再试。')
    }

    const accounts = accountRepository.getByIds(accountIds)
    const accountMap = new Map(accounts.map((account) => [account.id, account]))
    const orderedAccounts = accountIds
      .map((id) => accountMap.get(id))
      .filter((account): account is NonNullable<typeof account> => Boolean(account))

    if (orderedAccounts.length === 0) {
      throw new Error('没有找到可执行的账号。')
    }

    const runtimeConcurrency = Math.max(1, appSettingsStore.get().checkConcurrency)
    const currentProxy = (() => {
      if (!proxyPoolService.isEnabled()) return null
      const proxy = proxyPoolService.getAccountCheckProxy()
      if (!proxy) {
        throw new Error('当前已开启全局代理，但没有可用代理，无法更新个人资料。请先导入代理或关闭全局代理后再试。')
      }
      return {
        type: proxy.type,
        ip: proxy.host,
        port: proxy.port,
        username: proxy.username ?? null,
        password: proxy.password ?? null,
        ipVersion: proxy.ipVersion
      }
    })()

    profileOperationStopRequested = false
    telegramProfileService.cancelActiveOperations()
    profileOperationState = {
      running: true,
      stopRequested: false,
      action: action as ProfileOperationAction,
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
    emitProfileOperationProgress()

    const results: ProfileOperationResultItem[] = []

    try {
      pushProfileOperationLog({
        accountId: null,
        phone: '',
        level: 'info',
        message: `已开始执行 ${orderedAccounts.length} 个账号的个人资料任务，当前按 ${profileOperationState.concurrency} 个并发执行。`
      })

      const pendingProfileUpdates: CheckResultInput[] = []
      const queue = [...orderedAccounts]
      const workerCount = Math.min(profileOperationState.concurrency, queue.length)

      const runAccount = async (account: typeof orderedAccounts[number]) => {
        updateProfileOperationState({
          currentAccountId: account.id,
          currentPhone: account.phone
        })
        pushProfileOperationLog({
          accountId: account.id,
          phone: account.phone,
          level: 'info',
          message: `开始处理 ${account.phone || `账号 #${account.id}`} 的个人资料。`
        })

        const result = await telegramProfileService.execute(account, payload, currentProxy)
        results.push(result)

        if (result.success) {
          pendingProfileUpdates.push(buildProfileUpdateItemFromOperation(account, result))
          pushProfileOperationLog({
            accountId: account.id,
            phone: account.phone,
            level: 'success',
            message: result.message
          })
          bumpProfileOperationCounters('success')
          return
        }

        pushProfileOperationLog({
          accountId: account.id,
          phone: account.phone,
          level: 'error',
          message: result.message
        })
        bumpProfileOperationCounters('failed')
      }

      const workers = Array.from({ length: workerCount }, () => (async () => {
        while (true) {
          if (profileOperationStopRequested) {
            return
          }
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
      updateProfileOperationState({
        running: false,
        stopRequested: profileOperationStopRequested,
        currentAccountId: null,
        currentPhone: null
      })
    }

    pushProfileOperationLog({
      accountId: null,
      phone: '',
      level: 'info',
      message: profileOperationStopRequested
        ? `个人资料任务已停止：成功 ${profileOperationState.successCount}，失败 ${profileOperationState.failedCount}，剩余 ${Math.max(0, orderedAccounts.length - profileOperationState.completed)} 个账号未继续执行。`
        : `个人资料任务执行完成：成功 ${profileOperationState.successCount}，失败 ${profileOperationState.failedCount}。`
    })

    const finalMessage = profileOperationStopRequested
      ? `个人资料任务已停止：成功 ${profileOperationState.successCount}，失败 ${profileOperationState.failedCount}，剩余 ${Math.max(0, orderedAccounts.length - profileOperationState.completed)} 个账号未继续执行。`
      : `个人资料任务执行完成：成功 ${profileOperationState.successCount}，失败 ${profileOperationState.failedCount}。`

    profileOperationStopRequested = false

    return {
      action: action as ProfileOperationAction,
      total: orderedAccounts.length,
      successCount: profileOperationState.successCount,
      failedCount: profileOperationState.failedCount,
      results,
      message: finalMessage
    }
  }))
}
