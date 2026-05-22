import { create } from 'zustand'
import { formatCountryDisplay } from '../lib/ui-text'
import type { AccountListReauthorizeFilter, AccountRecord, AccountStatus, CheckAction, CheckQueueState, ImportProgressPayload, ProfileOperationProgressState, ReauthorizeProgressOverview, TwoFactorProgressState } from '../types'

export type AccountStatusFilter = 'all' | AccountStatus | 'premium' | 'limited-group' | 'timeout-group'

interface ImportResultDialogState {
  open: boolean
  scannedCount: number
  importedCount: number
  generatedJsonCount: number
  skippedCount: number
  warning: string
}

interface ExportResultDialogState {
  open: boolean
  exportedCount: number
  targetDirectory: string
}

interface DeleteResultDialogState {
  open: boolean
  deletedCount: number
  mode: 'selected' | 'all' | 'flagged' | 'banned' | 'frozen' | 'multi_ip'
}

interface CheckResultDialogState {
  open: boolean
  runMode: 'account-status' | 'account-survival'
  total: number
  alive: number
  limited: number
  temporaryLimited: number
  geoRestricted: number
  frozen: number
  banned: number
  multiIp: number
  timeout: number
}

function getDesktopAccountsApi() {
  return window.desktopAccounts
}

const DELETE_STATUS_GROUPS = {
  flagged: ['banned', 'frozen', 'multi_ip', 'session_expired', 'not_logged_in'],
  banned: ['banned'],
  frozen: ['frozen'],
  multi_ip: ['multi_ip']
} as const satisfies Record<'flagged' | 'banned' | 'frozen' | 'multi_ip', AccountStatus[]>

type DeleteStatusGroup = keyof typeof DELETE_STATUS_GROUPS

const DELETE_GROUP_LABELS: Record<DeleteStatusGroup, string> = {
  flagged: '封禁 / 冻结 / 多 IP / 失效',
  banned: '封禁',
  frozen: '冻结',
  multi_ip: '多 IP'
}

function createEmptyCheckState(): CheckQueueState {
  return {
    running: false,
    runMode: 'account-status',
    concurrency: 3,
    timeoutMs: 60000,
    retryLimit: 2,
    pendingCount: 0,
    activeCount: 0,
    completedCount: 0,
    failedCount: 0,
    totalCount: 0,
    queuedAccountIds: [],
    activeAccountIds: [],
    logs: [],
    resultSummary: {
      total: 0,
      alive: 0,
      limited: 0,
      temporary_limited: 0,
      geo_restricted: 0,
      frozen: 0,
      banned: 0,
      multi_ip: 0,
      timeout: 0,
      unknown: 0
    },
    lastUpdatedAt: null
  }
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

function createEmptyReauthorizeOverview(): ReauthorizeProgressOverview {
  return {
    runId: null,
    running: false,
    concurrency: 1,
    total: 0,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    currentAccountId: null,
    currentPhone: null,
    logCount: 0,
    lastLog: null,
    lastUpdatedAt: null
  }
}

function areSameNumberArrays(left: number[], right: number[]) {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function hasRunningAccountTask(state: Pick<AccountStoreState, 'checkState' | 'twoFactorState' | 'profileOperationState' | 'reauthorizeState' | 'importProgress'>) {
  return state.checkState.running
    || state.twoFactorState.running
    || state.profileOperationState.running
    || state.reauthorizeState.running
    || Boolean(state.importProgress)
}

function applyAccountSnapshot(
  accounts: AccountRecord[],
  set: (partial: Partial<AccountStoreState>) => void,
  get: () => AccountStoreState,
  extra?: Partial<AccountStoreState>
) {
  const validIds = new Set(accounts.map((item) => item.id))
  const selectedIds = get().selectedIds.filter((id) => validIds.has(id))
  const selectedProfileAccountId = validIds.has(get().selectedProfileAccountId ?? -1)
    ? get().selectedProfileAccountId
    : selectedIds[0] ?? accounts[0]?.id ?? null

  set({
    accounts,
    selectedIds,
    selectedProfileAccountId,
    loading: false,
    initialized: true,
    ...extra
  })
}

function createPendingTransferProgress(mode: 'import' | 'export' | 'delete', options?: { total?: number; current?: number; importedCount?: number; message?: string }): ImportProgressPayload {
  return {
    mode,
    phase: 'start',
    total: Math.max(0, options?.total ?? 0),
    current: Math.max(0, options?.current ?? 0),
    importedCount: Math.max(0, options?.importedCount ?? 0),
    generatedJsonCount: 0,
    skippedCount: 0,
    message: options?.message ?? (mode === 'export'
      ? '正在准备导出账号...'
      : mode === 'delete'
        ? '正在准备删除账号...'
        : '正在准备导入账号...')
  }
}

async function syncRuntimeProgressState(
  set: (partial: Partial<AccountStoreState>) => void,
  get: () => AccountStoreState
) {
  const api = getDesktopAccountsApi()
  if (!api) return

  const previousCheckState = get().checkState
  const previousCheckLogs = get().checkLogs
  const previousTwoFactorState = get().twoFactorState
  const previousProfileOperationState = get().profileOperationState
  const previousReauthorizeState = get().reauthorizeState

  const [checkState, checkLogs, twoFactorState, profileOperationState, reauthorizeState] = await Promise.all([
    api.getCheckState().catch(() => previousCheckState),
    api.getCheckLogs().catch(() => previousCheckLogs),
    api.getTwoFactorState?.().catch(() => previousTwoFactorState) ?? Promise.resolve(previousTwoFactorState),
    api.getProfileOperationState?.().catch(() => previousProfileOperationState) ?? Promise.resolve(previousProfileOperationState),
    api.getReauthorizeState?.().catch(() => previousReauthorizeState) ?? Promise.resolve(previousReauthorizeState)
  ])

  const normalizedCheckState = {
    ...checkState,
    queuedAccountIds: areSameNumberArrays(previousCheckState.queuedAccountIds, checkState.queuedAccountIds)
      ? previousCheckState.queuedAccountIds
      : checkState.queuedAccountIds,
    activeAccountIds: areSameNumberArrays(previousCheckState.activeAccountIds, checkState.activeAccountIds)
      ? previousCheckState.activeAccountIds
      : checkState.activeAccountIds
  }

  const nextCheckTaskAccountIds = normalizedCheckState.running
    ? Array.from(new Set([...normalizedCheckState.activeAccountIds, ...normalizedCheckState.queuedAccountIds]))
    : []

  set({
    checkState: normalizedCheckState,
    checkLogs,
    checkTaskAccountIds: nextCheckTaskAccountIds,
    twoFactorState,
    profileOperationState,
    reauthorizeState
  })
}

const LARGE_IMPORT_REFRESH_THRESHOLD = 2000

let subscribed = false

interface AccountStoreState {
  accounts: AccountRecord[]
  initialized: boolean
  loading: boolean
  busy: boolean
  search: string
  statusFilter: AccountStatusFilter
  countryFilter: string
  selectedIds: number[]
  selectedProfileAccountId: number | null
  checkState: CheckQueueState
  checkLogs: CheckQueueState['logs']
  checkTaskAccountIds: number[]
  twoFactorState: TwoFactorProgressState
  profileOperationState: ProfileOperationProgressState
  reauthorizeState: ReauthorizeProgressOverview
  importProgress: ImportProgressPayload | null
  importResultDialog: ImportResultDialogState
  exportResultDialog: ExportResultDialogState
  deleteResultDialog: DeleteResultDialogState
  checkResultDialog: CheckResultDialogState
  lastActionMessage: string
  errorMessage: string
  init: () => Promise<void>
  refresh: () => Promise<void>
  setSearch: (value: string) => void
  setStatusFilter: (value: AccountStatusFilter) => void
  setCountryFilter: (value: string) => void
  setSelectedIds: (ids: number[]) => void
  setSelectedProfileAccountId: (id: number | null) => void
  importFiles: () => Promise<void>
  importFolder: () => Promise<void>
  importDroppedPaths: (paths: string[]) => Promise<void>
  closeImportResultDialog: () => void
  closeExportResultDialog: () => void
  closeDeleteResultDialog: () => void
  closeCheckResultDialog: () => void
  exportSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  deleteAll: () => Promise<void>
  deleteByStatusGroup: (group: DeleteStatusGroup) => Promise<void>
  startSelectedCheck: (actions: CheckAction[]) => Promise<void>
  startCheckByIds: (ids: number[], actions: CheckAction[]) => Promise<void>
  stopCheck: () => Promise<void>
  clearCheckLogs: () => Promise<void>
  stopTwoFactorTask: () => Promise<void>
  clearTwoFactorLogs: () => Promise<void>
  stopProfileOperationTask: () => Promise<void>
  clearProfileOperationLogs: () => Promise<void>
  revealPath: (targetPath: string) => Promise<void>
}

async function syncAccounts(set: (partial: Partial<AccountStoreState>) => void, get: () => AccountStoreState) {
  const api = getDesktopAccountsApi()
  if (!api) {
    set({ loading: false, initialized: true, errorMessage: '当前运行环境未注入桌面账号 API。' })
    return
  }

  const [accounts, checkState, checkLogs, twoFactorState, profileOperationState, reauthorizeState] = await Promise.all([
    api.list(),
    api.getCheckState(),
    api.getCheckLogs ? api.getCheckLogs() : Promise.resolve([]),
    api.getTwoFactorState ? api.getTwoFactorState() : Promise.resolve(createEmptyTwoFactorState()),
    api.getProfileOperationState ? api.getProfileOperationState() : Promise.resolve(createEmptyProfileOperationState()),
    api.getReauthorizeState ? api.getReauthorizeState() : Promise.resolve(createEmptyReauthorizeOverview())
  ])
  applyAccountSnapshot(accounts, set, get, {
    checkState,
    checkLogs,
    checkTaskAccountIds: checkState.running ? checkState.activeAccountIds : [],
    twoFactorState,
    profileOperationState,
    reauthorizeState
  })
}

async function runBusyAction(
  set: (partial: Partial<AccountStoreState>) => void,
  action: () => Promise<void>
) {
  set({ busy: true, errorMessage: '' })
  try {
    await action()
  } catch (error) {
    set({ errorMessage: error instanceof Error ? error.message : '操作失败，请稍后重试。' })
  } finally {
    set({ busy: false })
  }
}

let initPromise: Promise<void> | null = null

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  accounts: [],
  initialized: false,
  loading: true,
  busy: false,
  search: '',
  statusFilter: 'all',
  countryFilter: '',
  selectedIds: [],
  selectedProfileAccountId: null,
  checkState: createEmptyCheckState(),
  checkLogs: [],
  checkTaskAccountIds: [],
  twoFactorState: createEmptyTwoFactorState(),
  profileOperationState: createEmptyProfileOperationState(),
  reauthorizeState: createEmptyReauthorizeOverview(),
  importProgress: null,
  importResultDialog: {
    open: false,
    scannedCount: 0,
    importedCount: 0,
    generatedJsonCount: 0,
    skippedCount: 0,
    warning: ''
  },
  exportResultDialog: {
    open: false,
    exportedCount: 0,
    targetDirectory: ''
  },
  deleteResultDialog: {
    open: false,
    deletedCount: 0,
    mode: 'selected'
  },
  checkResultDialog: {
    open: false,
    runMode: 'account-status',
    total: 0,
    alive: 0,
    limited: 0,
    temporaryLimited: 0,
    geoRestricted: 0,
    frozen: 0,
    banned: 0,
    multiIp: 0,
    timeout: 0
  },
  lastActionMessage: '',
  errorMessage: '',
  init: async () => {
    if (!subscribed) {
      window.desktopAccounts?.onCheckState(async (checkState) => {
        const previousState = get().checkState
        const normalizedCheckState = {
          ...checkState,
          queuedAccountIds: areSameNumberArrays(previousState.queuedAccountIds, checkState.queuedAccountIds)
            ? previousState.queuedAccountIds
            : checkState.queuedAccountIds,
          activeAccountIds: areSameNumberArrays(previousState.activeAccountIds, checkState.activeAccountIds)
            ? previousState.activeAccountIds
            : checkState.activeAccountIds
        }

        const nextCheckTaskAccountIds = checkState.running
          ? Array.from(new Set([...normalizedCheckState.activeAccountIds, ...normalizedCheckState.queuedAccountIds]))
          : []

        set({ checkState: normalizedCheckState, checkTaskAccountIds: nextCheckTaskAccountIds })
        const fullyCompleted = !checkState.running
          && checkState.totalCount > 0
          && checkState.completedCount >= checkState.totalCount
          && checkState.resultSummary.total >= checkState.totalCount

        if (previousState.running && fullyCompleted) {
          await syncAccounts(set, get)
          set({
            checkResultDialog: {
              open: true,
              runMode: checkState.runMode,
              total: checkState.resultSummary.total,
              alive: checkState.resultSummary.alive,
              limited: checkState.resultSummary.limited,
              temporaryLimited: checkState.resultSummary.temporary_limited,
              geoRestricted: checkState.resultSummary.geo_restricted,
              frozen: checkState.resultSummary.frozen,
              banned: checkState.resultSummary.banned,
              multiIp: checkState.resultSummary.multi_ip,
              timeout: checkState.resultSummary.timeout
            },
            checkTaskAccountIds: [],
            lastActionMessage: '批量检测已完成，账号资料已刷新。'
          })
        }
      })
      window.desktopAccounts?.onCheckLogs?.((checkLogs) => {
        set({ checkLogs })
      })
      window.desktopAccounts?.onAccountsUpdated((accounts) => {
        if (hasRunningAccountTask(get())) {
          return
        }
        applyAccountSnapshot(accounts, set, get, { lastActionMessage: 'sessions 目录检测到变更，列表已自动同步。' })
      })
      window.desktopAccounts?.onImportProgress((importProgress) => {
        set({
          importProgress,
          busy: importProgress.phase !== 'completed',
          lastActionMessage: importProgress.phase === 'completed' ? importProgress.message : get().lastActionMessage
        })
      })
      window.desktopAccounts?.onTwoFactorProgress?.((twoFactorState) => {
        const previousState = get().twoFactorState
        set({ twoFactorState })

        if (previousState.running && !twoFactorState.running) {
          void syncAccounts(set, get).then(() => {
            set({
              lastActionMessage: twoFactorState.stopRequested
                ? '2FA 任务已收尾完成，账号列表已统一刷新。'
                : '2FA 任务已完成，账号列表已统一刷新。'
            })
          })
        }
      })
      window.desktopAccounts?.onReauthorizeProgress?.((reauthorizeState) => {
        const previousState = get().reauthorizeState
        set({ reauthorizeState })

        if (previousState.running && !reauthorizeState.running) {
          void syncAccounts(set, get).then(() => {
            set({
              lastActionMessage: '重新授权任务已完成，账号列表已统一刷新。'
            })
          })
        }
      })
      window.desktopAccounts?.onProfileOperationProgress?.((profileOperationState) => {
        const previousState = get().profileOperationState
        set({ profileOperationState })

        if (previousState.running && !profileOperationState.running) {
          void syncAccounts(set, get).then(() => {
            set({
              lastActionMessage: profileOperationState.stopRequested
                ? '个人资料任务已收尾完成，账号列表已统一刷新。'
                : '个人资料任务已完成，账号列表已统一刷新。'
            })
          })
        }
      })
      subscribed = true
    }

    if (get().initialized) return
    if (initPromise) return initPromise

    set({ loading: true, errorMessage: '' })
    initPromise = Promise.all([
      syncAccounts(set, get),
      syncRuntimeProgressState(set, get)
    ]).then(() => undefined).finally(() => {
      initPromise = null
    })
    await initPromise
  },
  refresh: async () => {
    set({ loading: true, errorMessage: '' })
    await syncAccounts(set, get)
    set({ lastActionMessage: '账号列表已刷新。' })
  },
  setSearch: (value) => set({ search: value }),
  setStatusFilter: (value) => set({ statusFilter: value }),
  setCountryFilter: (value) => set({ countryFilter: value }),
  setSelectedIds: (ids) => set((state) => ({
    selectedIds: ids,
    selectedProfileAccountId: ids[0] ?? state.selectedProfileAccountId ?? state.accounts[0]?.id ?? null
  })),
  setSelectedProfileAccountId: (id) => set({ selectedProfileAccountId: id }),
  importFiles: async () => {
    await runBusyAction(set, async () => {
      let result = null
      try {
        result = await getDesktopAccountsApi()?.pickImportFiles()
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) {
        return
      }
      const shouldDeferRefresh = result.importedCount >= LARGE_IMPORT_REFRESH_THRESHOLD || result.scannedCount >= LARGE_IMPORT_REFRESH_THRESHOLD
      if (!shouldDeferRefresh) {
        await syncAccounts(set, get)
      }
      set({
        importProgress: null,
        importResultDialog: {
          open: true,
          scannedCount: result.scannedCount,
          importedCount: result.importedCount,
          generatedJsonCount: result.generatedJsonCount,
          skippedCount: result.skippedCount,
          warning: result.warnings[0] ?? ''
        },
        lastActionMessage: shouldDeferRefresh
          ? `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）。为避免大批量数据拖慢界面，这次先不自动刷新账号列表；需要查看新账号时再点刷新。`
          : `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
  },
  importFolder: async () => {
    await runBusyAction(set, async () => {
      let result = null
      try {
        result = await getDesktopAccountsApi()?.pickImportFolder()
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) {
        return
      }
      const shouldDeferRefresh = result.importedCount >= LARGE_IMPORT_REFRESH_THRESHOLD || result.scannedCount >= LARGE_IMPORT_REFRESH_THRESHOLD
      if (!shouldDeferRefresh) {
        await syncAccounts(set, get)
      }
      set({
        importProgress: null,
        importResultDialog: {
          open: true,
          scannedCount: result.scannedCount,
          importedCount: result.importedCount,
          generatedJsonCount: result.generatedJsonCount,
          skippedCount: result.skippedCount,
          warning: result.warnings[0] ?? ''
        },
        lastActionMessage: shouldDeferRefresh
          ? `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）。为避免大批量数据拖慢界面，这次先不自动刷新账号列表；需要查看新账号时再点刷新。`
          : `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
  },
  importDroppedPaths: async (paths) => {
    await runBusyAction(set, async () => {
      if (paths.length === 0) return
      set({ importProgress: createPendingTransferProgress('import') })
      let result = null
      try {
        result = await getDesktopAccountsApi()?.importDroppedPaths(paths)
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) return
      const shouldDeferRefresh = result.importedCount >= LARGE_IMPORT_REFRESH_THRESHOLD || result.scannedCount >= LARGE_IMPORT_REFRESH_THRESHOLD
      if (!shouldDeferRefresh) {
        await syncAccounts(set, get)
      }
      set({
        importProgress: null,
        importResultDialog: {
          open: true,
          scannedCount: result.scannedCount,
          importedCount: result.importedCount,
          generatedJsonCount: result.generatedJsonCount,
          skippedCount: result.skippedCount,
          warning: result.warnings[0] ?? ''
        },
        lastActionMessage: shouldDeferRefresh
          ? `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}）。为避免大批量数据拖慢界面，这次先不自动刷新账号列表；需要查看新账号时再点刷新。`
          : `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}）`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
  },
  closeImportResultDialog: () => {
    set((state) => ({
      importResultDialog: {
        ...state.importResultDialog,
        open: false
      }
    }))
  },
  closeExportResultDialog: () => {
    set((state) => ({
      exportResultDialog: {
        ...state.exportResultDialog,
        open: false
      }
    }))
  },
  closeDeleteResultDialog: () => {
    set((state) => ({
      deleteResultDialog: {
        ...state.deleteResultDialog,
        open: false
      }
    }))
  },
  closeCheckResultDialog: () => {
    set((state) => ({
      checkResultDialog: {
        ...state.checkResultDialog,
        open: false
      }
    }))
  },
  exportSelected: async () => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        set({ errorMessage: '请先选择要导出的账号。' })
        return
      }

      let result = null
      try {
        result = await getDesktopAccountsApi()?.exportByIds(ids)
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result || !result.targetDirectory) {
        set({ importProgress: null })
        return
      }
      await syncAccounts(set, get)
      set({
        importProgress: null,
        selectedIds: [],
        exportResultDialog: {
          open: true,
          exportedCount: result.exportedCount,
          targetDirectory: result.targetDirectory
        },
        lastActionMessage: `已导出并移出 ${result.exportedCount} 个账号到：${result.targetDirectory}`
      })
    })
  },
  deleteSelected: async () => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        set({ errorMessage: '请先选择要删除的账号。' })
        return
      }

      set({
        importProgress: createPendingTransferProgress('delete', {
          total: ids.length,
          message: ids.length > 0 ? `正在准备删除账号 0 / ${ids.length}` : '正在准备删除账号...'
        })
      })
      let result = null
      try {
        result = await getDesktopAccountsApi()?.deleteByIds(ids)
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) {
        return
      }
      const deletedIdSet = new Set(result.deletedIds)
      const remainingAccounts = get().accounts.filter((account) => !deletedIdSet.has(account.id))
      applyAccountSnapshot(remainingAccounts, set, get)
      set({
        importProgress: null,
        selectedIds: [],
        deleteResultDialog: {
          open: true,
          deletedCount: result.deletedCount,
          mode: 'selected'
        },
        lastActionMessage: `已删除 ${result.deletedCount} 个账号。`
      })
    })
  },
  deleteAll: async () => {
    await runBusyAction(set, async () => {
      const deletedCount = get().accounts.length
      set({
        importProgress: createPendingTransferProgress('delete', {
          total: deletedCount,
          message: deletedCount > 0 ? `正在准备删除账号 0 / ${deletedCount}` : '正在准备删除账号...'
        })
      })
      let result = null
      try {
        result = await getDesktopAccountsApi()?.deleteAll()
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) {
        return
      }
      applyAccountSnapshot([], set, get)
      set({
        importProgress: null,
        selectedIds: [],
        deleteResultDialog: {
          open: true,
          deletedCount: result.deletedCount || deletedCount,
          mode: 'all'
        },
        lastActionMessage: '账号数据已全部清空。'
      })
    })
  },
  deleteByStatusGroup: async (group) => {
    await runBusyAction(set, async () => {
      const statuses = new Set<AccountStatus>(DELETE_STATUS_GROUPS[group])
      const ids = get().accounts
        .filter((account) => statuses.has(account.status))
        .map((account) => account.id)

      if (ids.length === 0) {
        set({ errorMessage: `当前没有可删除的${DELETE_GROUP_LABELS[group]}账号。` })
        return
      }

      set({
        importProgress: createPendingTransferProgress('delete', {
          total: ids.length,
          message: ids.length > 0 ? `正在准备删除账号 0 / ${ids.length}` : '正在准备删除账号...'
        })
      })
      let result = null
      try {
        result = await getDesktopAccountsApi()?.deleteByIds(ids)
      } finally {
        if (!result) {
          set({ importProgress: null })
        }
      }
      if (!result) {
        return
      }
      const deletedIdSet = new Set(result.deletedIds)
      const remainingAccounts = get().accounts.filter((account) => !deletedIdSet.has(account.id))
      applyAccountSnapshot(remainingAccounts, set, get)
      set({
        importProgress: null,
        selectedIds: get().selectedIds.filter((id) => !deletedIdSet.has(id)),
        deleteResultDialog: {
          open: true,
          deletedCount: result.deletedCount,
          mode: group
        },
        lastActionMessage: `已删除 ${result.deletedCount} 个${DELETE_GROUP_LABELS[group]}账号。`
      })
    })
  },
  startSelectedCheck: async (actions) => {
    await get().startCheckByIds(get().selectedIds, actions)
  },
  startCheckByIds: async (ids, actions) => {
    await runBusyAction(set, async () => {
      const normalizedIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))))
      if (normalizedIds.length === 0) {
        set({ errorMessage: '请先选择要批量检测的账号。' })
        return
      }

      const normalizedActions: CheckAction[] = actions.length > 0 ? actions : ['account-status']
      const checkState = await getDesktopAccountsApi()?.startCheck({ ids: normalizedIds, actions: normalizedActions })
      if (!checkState) return
      const actionLabel = normalizedActions.includes('account-survival') ? '账号存活检测' : '账号状态检测'
      set({
        checkState,
        checkLogs: [],
        checkTaskAccountIds: normalizedIds,
        checkResultDialog: {
          open: false,
          runMode: checkState.runMode,
          total: 0,
          alive: 0,
          limited: 0,
          temporaryLimited: 0,
          geoRestricted: 0,
          frozen: 0,
          banned: 0,
          multiIp: 0,
          timeout: 0
        },
        lastActionMessage: `已启动 ${normalizedIds.length} 个账号的${actionLabel}任务，当前按 ${checkState.concurrency} 个并发执行，检测过程中账号列表先不刷新，完成后统一更新。`
      })
    })
  },
  stopCheck: async () => {
    await runBusyAction(set, async () => {
      const currentState = get().checkState
      if (!currentState.running) {
        set({ errorMessage: '当前没有正在执行的账号检测任务。' })
        return
      }

      const checkState = await getDesktopAccountsApi()?.stopCheck()
      if (!checkState) return
      set({
        checkState,
        checkTaskAccountIds: checkState.activeAccountIds,
        lastActionMessage: checkState.activeCount > 0
          ? '已停止继续检测，正在收尾当前检测中的账号。'
          : '账号检测任务已停止。'
      })
    })
  },
  clearCheckLogs: async () => {
    const checkState = await getDesktopAccountsApi()?.clearCheckLogs()
    if (checkState) {
      set({ checkState, checkLogs: [], lastActionMessage: '检测日志已清空。' })
    }
  },
  stopTwoFactorTask: async () => {
    const result = await getDesktopAccountsApi()?.stopTwoFactor()
    if (result) {
      set({ lastActionMessage: result.message })
    }
  },
  clearTwoFactorLogs: async () => {
    const twoFactorState = await getDesktopAccountsApi()?.clearTwoFactorLogs?.()
    if (twoFactorState) {
      set({ twoFactorState, lastActionMessage: '2FA 日志已清空。' })
    }
  },
  stopProfileOperationTask: async () => {
    const result = await getDesktopAccountsApi()?.stopProfileOperation?.()
    if (result) {
      set({ lastActionMessage: result.message })
    }
  },
  clearProfileOperationLogs: async () => {
    const profileOperationState = await getDesktopAccountsApi()?.clearProfileOperationLogs?.()
    if (profileOperationState) {
      set({ profileOperationState, lastActionMessage: '个人资料日志已清空。' })
    }
  },
  revealPath: async (targetPath) => {
    await runBusyAction(set, async () => {
      const success = await getDesktopAccountsApi()?.revealPath(targetPath)
      if (!success) {
        set({ errorMessage: `文件不存在：${targetPath}` })
      }
    })
  }
}))

export function filterAccounts(accounts: AccountRecord[], filters: {
  search: string
  statusFilter: AccountStatusFilter
  countryFilter: string
  reauthorizeFilter?: AccountListReauthorizeFilter
}) {
  const keyword = filters.search.trim().toLowerCase()

  return accounts.filter((account) => {
    if (filters.statusFilter !== 'all') {
      if (filters.statusFilter === 'premium') {
        if (!account.profile?.is_premium) return false
      } else if (filters.statusFilter === 'alive') {
        if (account.status !== 'alive' && account.status !== 'geo_restricted') return false
      } else if (filters.statusFilter === 'limited-group') {
        if (account.status !== 'limited' && account.status !== 'temporary_limited') return false
      } else if (filters.statusFilter === 'timeout-group') {
        if (account.status !== 'timeout' && account.status !== 'unknown' && account.status !== 'checking') return false
      } else if (account.status !== filters.statusFilter) {
        return false
      }
    }

    if (filters.countryFilter && formatCountryDisplay(account.country, account.phone) !== filters.countryFilter) {
      return false
    }

    const reauthorizeLastStatus = typeof account.profile?.reauthorize_last_status === 'string'
      ? account.profile.reauthorize_last_status.trim()
      : ''
    const hasHistoricalReauthorizeSuccess = Boolean(account.profile?.reauthorize_at)

    if ((filters.reauthorizeFilter ?? 'all') === 'success') {
      if (reauthorizeLastStatus !== 'success' && !(hasHistoricalReauthorizeSuccess && !reauthorizeLastStatus)) {
        return false
      }
    }

    if ((filters.reauthorizeFilter ?? 'all') === 'failed') {
      if (!['password_mismatch', 'session_expired', 'failed'].includes(reauthorizeLastStatus)) {
        return false
      }
    }

    if (!keyword) return true

    const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name : ''
    const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name : ''
    const bio = typeof account.profile?.bio === 'string' ? account.profile.bio : ''
    const premiumExpiry = account.profile?.premium_expiry == null ? '' : String(account.profile.premium_expiry)
    const freezeSince = account.profile?.freeze_since_date == null ? '' : String(account.profile.freeze_since_date)
    const freezeUntil = account.profile?.freeze_until_date == null ? '' : String(account.profile.freeze_until_date)
    const checkError = typeof account.profile?.check_error === 'string' ? account.profile.check_error : ''

    return [
      account.phone,
      account.username,
      account.userId,
      formatCountryDisplay(account.country, account.phone),
      account.status,
      account.sessionPath,
      account.jsonPath,
      account.profileSource,
      firstName,
      lastName,
      bio,
      premiumExpiry,
      freezeSince,
      freezeUntil,
      checkError
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
}
