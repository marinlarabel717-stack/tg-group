import { create } from 'zustand'
import { formatCountryDisplay } from '../lib/ui-text'
import type { AccountRecord, AccountStatus, CheckAction, CheckQueueState, ImportProgressPayload } from '../types'

export type AccountStatusFilter = 'all' | AccountStatus | 'premium'

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
  mode: 'selected' | 'all'
}

interface CheckResultDialogState {
  open: boolean
  runMode: 'account-status' | 'account-survival'
  total: number
  alive: number
  limited: number
  temporaryLimited: number
  frozen: number
  banned: number
}

function getDesktopAccountsApi() {
  return window.desktopAccounts
}

function createEmptyCheckState(): CheckQueueState {
  return {
    running: false,
    runMode: 'account-status',
    concurrency: 3,
    timeoutMs: 25000,
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
      frozen: 0,
      banned: 0,
      multi_ip: 0,
      timeout: 0,
      unknown: 0
    },
    lastUpdatedAt: null
  }
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
  startSelectedCheck: (actions: CheckAction[]) => Promise<void>
  clearCheckLogs: () => Promise<void>
  revealPath: (targetPath: string) => Promise<void>
}

async function syncAccounts(set: (partial: Partial<AccountStoreState>) => void, get: () => AccountStoreState) {
  const api = getDesktopAccountsApi()
  if (!api) {
    set({ loading: false, initialized: true, errorMessage: '当前运行环境未注入桌面账号 API。' })
    return
  }

  const [accounts, checkState] = await Promise.all([api.list(), api.getCheckState()])
  applyAccountSnapshot(accounts, set, get, { checkState })
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
    frozen: 0,
    banned: 0
  },
  lastActionMessage: '',
  errorMessage: '',
  init: async () => {
    if (!subscribed) {
      window.desktopAccounts?.onCheckState(async (checkState) => {
        const previousState = get().checkState
        set({ checkState })
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
              frozen: checkState.resultSummary.frozen,
              banned: checkState.resultSummary.banned
            },
            lastActionMessage: '批量检测已完成，账号资料已刷新。'
          })
        }
      })
      window.desktopAccounts?.onAccountsUpdated((accounts) => {
        const isChecking = get().checkState.running
        applyAccountSnapshot(accounts, set, get, isChecking
          ? undefined
          : { lastActionMessage: 'sessions 目录检测到变更，列表已自动同步。' })
      })
      window.desktopAccounts?.onImportProgress((importProgress) => {
        set({
          importProgress,
          busy: importProgress.phase !== 'completed',
          lastActionMessage: importProgress.phase === 'completed' ? importProgress.message : get().lastActionMessage
        })
      })
      subscribed = true
    }

    if (get().initialized) return
    set({ loading: true, errorMessage: '' })
    await syncAccounts(set, get)
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
      const result = await getDesktopAccountsApi()?.pickImportFiles()
      if (!result) return
      await syncAccounts(set, get)
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
        lastActionMessage: `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
  },
  importFolder: async () => {
    await runBusyAction(set, async () => {
      const result = await getDesktopAccountsApi()?.pickImportFolder()
      if (!result) return
      await syncAccounts(set, get)
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
        lastActionMessage: `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}，自动补 JSON ${result.generatedJsonCount}）`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
  },
  importDroppedPaths: async (paths) => {
    await runBusyAction(set, async () => {
      if (paths.length === 0) return
      const result = await getDesktopAccountsApi()?.importDroppedPaths(paths)
      if (!result) return
      await syncAccounts(set, get)
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
        lastActionMessage: `本次成功导入 ${result.importedCount} 个账号（扫描 ${result.scannedCount}）`,
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

      const result = await getDesktopAccountsApi()?.exportByIds(ids)
      if (!result || !result.targetDirectory) return
      await syncAccounts(set, get)
      set({
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

      await getDesktopAccountsApi()?.deleteByIds(ids)
      await syncAccounts(set, get)
      set({
        selectedIds: [],
        deleteResultDialog: {
          open: true,
          deletedCount: ids.length,
          mode: 'selected'
        },
        lastActionMessage: `已删除 ${ids.length} 个账号。`
      })
    })
  },
  deleteAll: async () => {
    await runBusyAction(set, async () => {
      const deletedCount = get().accounts.length
      await getDesktopAccountsApi()?.deleteAll()
      await syncAccounts(set, get)
      set({
        selectedIds: [],
        deleteResultDialog: {
          open: true,
          deletedCount,
          mode: 'all'
        },
        lastActionMessage: '账号数据已全部清空。'
      })
    })
  },
  startSelectedCheck: async (actions) => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        set({ errorMessage: '请先选择要批量检测的账号。' })
        return
      }

      const normalizedActions: CheckAction[] = actions.length > 0 ? actions : ['account-status']
      const checkState = await getDesktopAccountsApi()?.startCheck({ ids, actions: normalizedActions })
      if (!checkState) return
      const actionLabel = normalizedActions.includes('account-survival') ? '账号存活检测' : '账号状态检测'
      set({
        checkState,
        checkResultDialog: {
          open: false,
          runMode: checkState.runMode,
          total: 0,
          alive: 0,
          limited: 0,
          temporaryLimited: 0,
          frozen: 0,
          banned: 0
        },
        lastActionMessage: `已启动 ${ids.length} 个账号的${actionLabel}任务。`
      })
      await syncAccounts(set, get)
    })
  },
  clearCheckLogs: async () => {
    const checkState = await getDesktopAccountsApi()?.clearCheckLogs()
    if (checkState) {
      set({ checkState, lastActionMessage: '检测日志已清空。' })
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
}) {
  const keyword = filters.search.trim().toLowerCase()

  return accounts.filter((account) => {
    if (filters.statusFilter !== 'all') {
      if (filters.statusFilter === 'premium') {
        if (!account.profile?.is_premium) return false
      } else if (account.status !== filters.statusFilter) {
        return false
      }
    }

    if (filters.countryFilter && formatCountryDisplay(account.country, account.phone) !== filters.countryFilter) {
      return false
    }

    if (!keyword) return true

    return [
      account.phone,
      account.username,
      account.userId,
      formatCountryDisplay(account.country, account.phone),
      account.status,
      account.sessionPath,
      account.jsonPath,
      account.profileSource,
      JSON.stringify(account.profile ?? {})
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
}
