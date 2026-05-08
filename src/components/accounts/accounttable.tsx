import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, FolderOpen, Info, Loader2 } from 'lucide-react'
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { filterAccounts, useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatDateTime, formatProfileSource, formatRelativePath } from '../../lib/ui-text'

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

function readProxy(account: AccountRecord) {
  const proxy = account.profile?.proxy
  return typeof proxy === 'string' && proxy.trim() ? proxy.trim() : '未配置'
}

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[60px] animate-pulse grid-cols-[52px_150px_130px_120px_130px_130px_140px_160px] gap-3 rounded-[10px] bg-panel px-4 py-3">
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="h-9 rounded-[8px] bg-white/[0.03]" />
      ))}
    </div>
  )
})

const TableRowActions = memo(function TableRowActions({ account }: { account: AccountRecord }) {
  const revealPath = useAccountStore((state) => state.revealPath)

  return (
    <div className="flex items-center gap-2">
      <button title="打开目录" className={actionButtonClass()} onClick={() => void revealPath(account.sessionPath)}>
        <FolderOpen size={15} />
      </button>
      <button title="打开 JSON" className={actionButtonClass()} onClick={() => void revealPath(account.jsonPath)}>
        <Info size={15} />
      </button>
    </div>
  )
})

export const AccountTable = memo(function AccountTable() {
  const accounts = useAccountStore((state) => state.accounts)
  const search = useAccountStore((state) => state.search)
  const loading = useAccountStore((state) => state.loading)
  const busy = useAccountStore((state) => state.busy)
  const statusFilter = useAccountStore((state) => state.statusFilter)
  const countryFilter = useAccountStore((state) => state.countryFilter)
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const setSearch = useAccountStore((state) => state.setSearch)
  const setStatusFilter = useAccountStore((state) => state.setStatusFilter)
  const setCountryFilter = useAccountStore((state) => state.setCountryFilter)
  const setSelectedIds = useAccountStore((state) => state.setSelectedIds)
  const refresh = useAccountStore((state) => state.refresh)
  const importFiles = useAccountStore((state) => state.importFiles)
  const importFolder = useAccountStore((state) => state.importFolder)
  const exportSelected = useAccountStore((state) => state.exportSelected)
  const deleteSelected = useAccountStore((state) => state.deleteSelected)
  const deleteAll = useAccountStore((state) => state.deleteAll)
  const startSelectedCheck = useAccountStore((state) => state.startSelectedCheck)

  const [sourceFilter, setSourceFilter] = useState('')
  const [proxyFilter, setProxyFilter] = useState('')
  const deferredSearch = useDeferredValue(search)
  const baseData = useMemo(
    () => filterAccounts(accounts, { search: deferredSearch, statusFilter, countryFilter }),
    [accounts, deferredSearch, statusFilter, countryFilter]
  )
  const data = useMemo(
    () =>
      baseData.filter((account) => {
        if (sourceFilter && account.profileSource !== sourceFilter) return false
        if (proxyFilter && readProxy(account) !== proxyFilter) return false
        return true
      }),
    [baseData, sourceFilter, proxyFilter]
  )

  const [sorting, setSorting] = useState([{ id: 'lastOnlineTime', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [tableLoading, setTableLoading] = useState(true)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }, [deferredSearch, statusFilter, countryFilter, sourceFilter, proxyFilter])

  useEffect(() => {
    setTableLoading(true)
    const timer = window.setTimeout(() => setTableLoading(false), 160)
    return () => window.clearTimeout(timer)
  }, [data, sorting, pagination.pageIndex, pagination.pageSize, loading])

  const rowSelection = useMemo<RowSelectionState>(() => Object.fromEntries(selectedIds.map((id) => [String(id), true])), [selectedIds])

  const columns = useMemo<ColumnDef<AccountRecord>[]>(
    () => [
      {
        id: 'select',
        size: 52,
        header: ({ table }) => (
          <input
            type="checkbox"
            title="全选当前页"
            className={checkboxClass()}
            checked={table.getIsAllPageRowsSelected()}
            ref={(input) => {
              if (input) input.indeterminate = table.getIsSomePageRowsSelected()
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            title="选择当前行"
            className={checkboxClass()}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false
      },
      { accessorKey: 'phone', header: '手机号', size: 150 },
      { accessorKey: 'country', header: '国家', size: 130 },
      {
        accessorKey: 'status',
        header: '状态',
        size: 120,
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        id: 'source',
        header: '资料来源',
        size: 130,
        cell: ({ row }) => formatProfileSource(row.original.profileSource)
      },
      {
        id: 'proxy',
        header: 'Proxy',
        size: 130,
        cell: ({ row }) => readProxy(row.original)
      },
      {
        accessorKey: 'lastOnlineTime',
        header: '最后活跃',
        size: 140,
        cell: ({ row }) => formatDateTime(row.original.lastOnlineTime || row.original.lastCheckTime)
      },
      {
        accessorKey: 'username',
        header: '用户名',
        size: 160,
        cell: ({ row }) => row.original.username || formatRelativePath(row.original.sessionPath)
      },
      {
        id: 'actions',
        header: '操作',
        size: 160,
        enableSorting: false,
        cell: ({ row }) => <TableRowActions account={row.original} />
      }
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, rowSelection },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const nextState = typeof updater === 'function' ? updater(rowSelection) : updater
      const nextIds = Object.entries(nextState)
        .filter(([, selected]) => Boolean(selected))
        .map(([id]) => Number(id))
      setSelectedIds(nextIds)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id)
  })

  const rows = table.getPaginationRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 3
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const countries = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.country).filter(Boolean))).map((value) => ({ label: value, value })),
    [accounts]
  )
  const statuses = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.status))).map((value) => ({ label: formatAccountStatus(value), value })),
    [accounts]
  )
  const sources = useMemo(
    () => [
      { label: 'JSON 导入', value: 'json_import' },
      { label: '登录检查', value: 'login_check' }
    ],
    []
  )
  const proxies = useMemo(
    () => Array.from(new Set(accounts.map((item) => readProxy(item)))).filter(Boolean).map((value) => ({ label: value, value })),
    [accounts]
  )

  const selectedCount = selectedIds.length
  const totalCount = data.length

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [setSearch])

  return (
    <div className="space-y-5 contain-layout">
      <TableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        selectedCount={selectedCount}
        totalCount={totalCount}
        loading={tableLoading}
        busy={busy}
        onImportFiles={() => void importFiles()}
        onImportFolder={() => void importFolder()}
        onExportSelected={() => void exportSelected()}
        onDeleteSelected={() => void deleteSelected()}
        onDeleteAll={() => void deleteAll()}
        onStartCheck={() => void startSelectedCheck()}
        onRefresh={() => void refresh()}
      />

      <TableFilters
        countryFilter={countryFilter}
        statusFilter={statusFilter === 'all' ? '' : statusFilter}
        sourceFilter={sourceFilter}
        proxyFilter={proxyFilter}
        countries={countries}
        statuses={statuses}
        sources={sources}
        proxies={proxies}
        onCountryChange={setCountryFilter}
        onStatusChange={(value) => setStatusFilter((value || 'all') as typeof statusFilter)}
        onSourceChange={setSourceFilter}
        onProxyChange={setProxyFilter}
      />

      <GlassPanel className="p-0">
        <div ref={parentRef} className="virtual-scroll-shell max-h-[640px] overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="px-4 py-4 text-left text-xs font-semibold tracking-[0.24em] text-textMuted"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className="flex items-center gap-2 transition hover:text-white"
                          onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() ? <ArrowUpDown size={14} /> : null}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="relative block" style={{ height: `${tableLoading ? 8 * 64 : totalSize}px` }}>
              {tableLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="absolute left-0 top-0 block w-full px-3" style={{ transform: `translateY(${index * 64}px)` }}>
                      <td className="block py-1">
                        <SkeletonRow columns={8} />
                      </td>
                    </tr>
                  ))
                : virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index]
                    return (
                      <tr
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="absolute left-0 top-0 block w-full px-3"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <td className="block py-1">
                          <div
                            className={`grid min-h-[60px] grid-cols-[52px_150px_130px_120px_130px_130px_140px_160px_160px] items-center gap-4 rounded-[10px] px-4 py-3.5 transition ${
                              row.getIsSelected() ? 'bg-neon/8' : 'bg-panel hover:bg-hover'
                            }`}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <div key={cell.id} className="truncate text-sm text-textMain">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>

          {!tableLoading && rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="animate-spin text-neonSoft" size={22} />
              <div className="text-base font-medium text-white">没有符合筛选条件的账号</div>
              <div className="max-w-md text-sm text-textMuted">请尝试调整状态、资料来源、Proxy 或搜索关键词后再查看结果。</div>
            </div>
          ) : null}
        </div>
      </GlassPanel>

      <TablePagination
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        totalRows={data.length}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onPreviousPage={() => table.previousPage()}
        onNextPage={() => table.nextPage()}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />
    </div>
  )
})
