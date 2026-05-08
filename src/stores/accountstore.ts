import { create } from 'zustand'
import type { AccountRecord, AccountStatus } from '../types'

function getDesktopAccountsApi() {
  return window.desktopAccounts
}

interface AccountStoreState {
  accounts: AccountRecord[]
  initialized: boolean
  loading: boolean
  busy: boolean
  search: string
  statusFilter: 'all' | AccountStatus
  countryFilter: string
  selectedIds: number[]
  spamReplyDraft: string
  lastActionMessage: string
  errorMessage: string
  init: () => Promise<void>
  refresh: () => Promise<void>
  setSearch: (value: string) => void
  setStatusFilter: (value: 'all' | AccountStatus) => void
  setCountryFilter: (value: string) => void
  setSelectedIds: (ids: number[]) => void
  setSpamReplyDraft: (value: string) => void
  importFiles: () => Promise<void>
  importFolder: () => Promise<void>
  importDroppedPaths: (paths: string[]) => Promise<void>
  exportSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  deleteAll: () => Promise<void>
  markSelectedChecking: () => Promise<void>
  applySpamReplyToSelected: () => Promise<void>
  revealPath: (targetPath: string) => Promise<void>
}

async function syncAccounts(set: (partial: Partial<AccountStoreState>) => void, get: () => AccountStoreState) {
  const api = getDesktopAccountsApi()
  if (!api) {
    set({ loading: false, initialized: true, errorMessage: '当前运行环境未注入桌面账号 API。' })
    return
  }

  const accounts = await api.list()
  const validIds = new Set(accounts.map((item) => item.id))
  const selectedIds = get().selectedIds.filter((id) => validIds.has(id))
  set({ accounts, selectedIds, loading: false, initialized: true })
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
  spamReplyDraft: '',
  lastActionMessage: '',
  errorMessage: '',
  init: async () => {
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
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setSpamReplyDraft: (value) => set({ spamReplyDraft: value }),
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
  markSelectedChecking: async () => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      if (ids.length === 0) {
        set({ errorMessage: '请先选择要批量检测的账号。' })
        return
      }

      await getDesktopAccountsApi()?.markChecking(ids)
      await syncAccounts(set, get)
      set({ lastActionMessage: `已将 ${ids.length} 个账号标记为检测中。` })
    })
  },
  applySpamReplyToSelected: async () => {
    await runBusyAction(set, async () => {
      const ids = get().selectedIds
      const replyText = get().spamReplyDraft.trim()

      if (ids.length === 0) {
        set({ errorMessage: '请先选择要更新状态的账号。' })
        return
      }

      if (!replyText) {
        set({ errorMessage: '请先粘贴 SpamBot 回复内容。' })
        return
      }

      const result = await getDesktopAccountsApi()?.applySpamBotReply({ ids, replyText })
      if (!result) return
      await syncAccounts(set, get)
      set({
        spamReplyDraft: '',
        lastActionMessage: `已根据 SpamBot 回复更新 ${result.updatedCount} 个账号状态：${result.status}`
      })
    })
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

    if (filters.countryFilter && account.country !== filters.countryFilter) {
      return false
    }

    if (!keyword) return true

    return [
      account.phone,
      account.username,
      account.userId,
      account.country,
      account.status,
      account.sessionPath,
      account.jsonPath
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
}
