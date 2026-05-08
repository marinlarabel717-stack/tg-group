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
import { formatAccountStatus, formatDateTime, formatProfileSource } from '../../lib/ui-text'

const ACCOUNT_GRID_TEMPLATE = 'grid-cols-[60px_180px_120px_140px_140px_140px_180px_240px_180px]'
const ACCOUNT_GRID_WIDTH = 'w-[1380px]'

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

function cellTextClass(extra = '') {
  return `min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${extra}`.trim()
}

function readProxy(account: AccountRecord) {
  const proxy = account.profile?.proxy
  return typeof proxy === 'string' && proxy.trim() ? proxy.trim() : '未配置'
}

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className={`grid ${ACCOUNT_GRID_TEMPLATE} ${ACCOUNT_GRID_WIDTH} min-h-[60px] animate-pulse items-center gap-0 rounded-[10px] bg-panel px-0 py-0`}>
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="px-4 py-3.5">
          <div className="h-9 rounded-[8px] bg-white/[0.03]" />
        </div>
      ))}
    </div>
  )
})

const TableRowActions = memo(function TableRowActions({ account }: { account: AccountRecord }) {
  const revealPath = useAccountStore((state) => state.revealPath)

  return (
    <div className="flex w-full items-center justify-center gap-2 overflow-hidden">
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
        size: 60,
        header: ({ table }) => (
          <div className="flex h-full w-full items-center justify-center">
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
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex h-full w-full items-center justify-center">
            <input
              type="checkbox"
              title="选择当前行"
              className={checkboxClass()}
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
        enableSorting: false
      },
      {
        accessorKey: 'phone',
        header: '手机号',
        size: 180,
        cell: ({ row }) => {
          const value = row.original.phone || '—'
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'country',
        header: '国家',
        size: 120,
        cell: ({ row }) => {
          const value = row.original.country || '—'
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'status',
        header: '状态',
        size: 140,
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        id: 'source',
        header: '资料来源',
        size: 140,
        cell: ({ row }) => {
          const value = formatProfileSource(row.original.profileSource)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'proxy',
        header: 'Proxy',
        size: 140,
        cell: ({ row }) => {
          const value = readProxy(row.original)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'lastOnlineTime',
        header: '最后活跃',
        size: 180,
        cell: ({ row }) => {
          const value = formatDateTime(row.original.lastOnlineTime || row.original.lastCheckTime)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'username',
        header: '用户名',
        size: 240,
        cell: ({ row }) => {
          const value = row.original.username || '—'
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'actions',
        header: '操作',
        size: 180,
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
    estimateSize: () => 62,
    overscan: 4
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
          <div className="relative min-w-[1404px]">
            <div className="sticky top-0 z-10 bg-card px-3 pb-1 pt-1">
              {table.getHeaderGroups().map((headerGroup) => (
                <div key={headerGroup.id} className={`grid ${ACCOUNT_GRID_TEMPLATE} ${ACCOUNT_GRID_WIDTH}`}>
                  {headerGroup.headers.map((header) => (
                    <div
                      key={header.id}
                      className="flex h-[56px] min-w-0 items-center px-4 text-left text-xs font-semibold tracking-[0.24em] text-textMuted"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className="flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap transition hover:text-white"
                          onClick={header.column.getToggleSortingHandler()}
                          title={String(header.column.columnDef.header ?? '')}
                        >
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          <ArrowUpDown size={14} className="shrink-0" />
                        </button>
                      ) : (
                        <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="relative" style={{ height: `${tableLoading ? 8 * 62 : totalSize}px` }}>
              {tableLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`skeleton-${index}`}
                      className="absolute left-0 top-0 px-3 py-1"
                      style={{ transform: `translateY(${index * 62}px)` }}
                    >
                      <SkeletonRow columns={9} />
                    </div>
                  ))
                : virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index]
                    return (
                      <div
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="absolute left-0 top-0 px-3 py-1"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <div
                          className={`grid ${ACCOUNT_GRID_TEMPLATE} ${ACCOUNT_GRID_WIDTH} min-h-[62px] items-center gap-0 rounded-[10px] px-0 py-0 transition ${
                            row.getIsSelected() ? 'bg-neon/8' : 'bg-panel hover:bg-hover'
                          }`}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <div key={cell.id} className="flex min-w-0 items-center px-4 py-3.5 text-sm text-textMain">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
            </div>
          </div>

          {!tableLoading && rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
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
