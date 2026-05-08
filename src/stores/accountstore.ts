import { create } from 'zustand'
import { formatCountryDisplay } from '../lib/ui-text'
import type { AccountRecord, AccountStatus, CheckQueueState } from '../types'

function getDesktopAccountsApi() {
  return window.desktopAccounts
}

function createEmptyCheckState(): CheckQueueState {
  return {
    running: false,
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
  statusFilter: 'all' | AccountStatus
  countryFilter: string
  selectedIds: number[]
  selectedProfileAccountId: number | null
  checkState: CheckQueueState
  lastActionMessage: string
  errorMessage: string
  init: () => Promise<void>
  refresh: () => Promise<void>
  setSearch: (value: string) => void
  setStatusFilter: (value: 'all' | AccountStatus) => void
  setCountryFilter: (value: string) => void
  setSelectedIds: (ids: number[]) => void
  setSelectedProfileAccountId: (id: number | null) => void
  importFiles: () => Promise<void>
  importFolder: () => Promise<void>
  importDroppedPaths: (paths: string[]) => Promise<void>
  exportSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  deleteAll: () => Promise<void>
  startSelectedCheck: () => Promise<void>
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
  lastActionMessage: '',
  errorMessage: '',
  init: async () => {
    if (!subscribed) {
      window.desktopAccounts?.onCheckState(async (checkState) => {
        const previousState = get().checkState
        set({ checkState })
        if (previousState.running && !checkState.running) {
          await syncAccounts(set, get)
          set({ lastActionMessage: '批量检测已完成，账号资料已刷新。' })
        }
      })
      window.desktopAccounts?.onAccountsUpdated((accounts) => {
        applyAccountSnapshot(accounts, set, get, {
          lastActionMessage: 'sessions 目录检测到变更，列表已自动同步。'
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
        lastActionMessage: `导入完成：扫描 ${result.scannedCount}，入库 ${result.importedCount}，自动补 JSON ${result.generatedJsonCount}。`,
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
        lastActionMessage: `文件夹导入完成：扫描 ${result.scannedCount}，入库 ${result.importedCount}，自动补 JSON ${result.generatedJsonCount}。`,
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
        lastActionMessage: `拖拽导入完成：扫描 ${result.scannedCount}，入库 ${result.importedCount}。`,
        errorMessage: result.warnings[0] ?? ''
      })
    })
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
      set({ lastActionMessage: `已导出 ${result.exportedCount} 个账号到：${result.targetDirectory}` })
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
      set({ selectedIds: [], lastActionMessage: `已删除 ${ids.length} 个账号。` })
    })
  },
  deleteAll: async () => {
    await runBusyAction(set, async () => {
      await getDesktopAccountsApi()?.deleteAll()
      await syncAccounts(set, get)
      set({ selectedIds: [], lastActionMessage: '账号数据已全部清空。' })
    })
  },
  startSelectedCheck: async () => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        set({ errorMessage: '请先选择要批量检测的账号。' })
        return
      }

      const checkState = await getDesktopAccountsApi()?.startCheck(ids)
      if (!checkState) return
      set({
        checkState,
        lastActionMessage: `已启动 ${ids.length} 个账号的登录检查任务。`
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
  statusFilter: 'all' | AccountStatus
  countryFilter: string
}) {
  const keyword = filters.search.trim().toLowerCase()

  return accounts.filter((account) => {
    if (filters.statusFilter !== 'all' && account.status !== filters.statusFilter) {
      return false
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
