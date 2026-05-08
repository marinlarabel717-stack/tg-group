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
import { ArrowUpDown, FileJson2, FolderOpen, Loader2 } from 'lucide-react'
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { filterAccounts, useAccountStore } from '../../stores/accountstore'
import { formatDateTime, formatRelativePath } from '../../lib/ui-text'

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[60px] animate-pulse grid-cols-[52px_90px_140px_120px_140px_120px_110px_160px_160px_120px_120px_92px] gap-3 rounded-[10px] bg-panel px-4 py-3">
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
      <button title="打开 Session 目录" className={actionButtonClass()} onClick={() => void revealPath(account.sessionPath)}>
        <FolderOpen size={15} />
      </button>
      <button
        title="打开 JSON 目录"
        className={actionButtonClass()}
        onClick={() => void revealPath(account.jsonPath)}
        disabled={!account.jsonPath}
      >
        <FileJson2 size={15} />
      </button>
    </div>
  )
})

export const AccountTable = memo(function AccountTable() {
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)
  const busy = useAccountStore((state) => state.busy)
  const search = useAccountStore((state) => state.search)
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

  const deferredSearch = useDeferredValue(search)
  const data = useMemo(
    () =>
      filterAccounts(accounts, {
        search: deferredSearch,
        statusFilter,
        countryFilter
      }),
    [accounts, deferredSearch, statusFilter, countryFilter]
  )

  const [sorting, setSorting] = useState([{ id: 'updatedAt', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [tableLoading, setTableLoading] = useState(true)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }, [deferredSearch, statusFilter, countryFilter])

  useEffect(() => {
    setTableLoading(true)
    const timer = window.setTimeout(() => setTableLoading(false), 120)
    return () => window.clearTimeout(timer)
  }, [data, sorting, pagination.pageIndex, pagination.pageSize, loading])

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(selectedIds.map((id) => [String(id), true])),
    [selectedIds]
  )

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
      { accessorKey: 'id', header: 'ID', size: 90 },
      { accessorKey: 'phone', header: '手机号', size: 140 },
      { accessorKey: 'username', header: '用户名', size: 120 },
      { accessorKey: 'userId', header: 'User ID', size: 140 },
      { accessorKey: 'country', header: '国家', size: 120 },
      {
        accessorKey: 'status',
        header: '状态',
        size: 110,
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        accessorKey: 'sessionPath',
        header: 'Session',
        size: 160,
        cell: ({ row }) => (
          <div>
            <div className="truncate text-sm text-white">{formatRelativePath(row.original.sessionPath)}</div>
            <div className="mt-1 text-xs text-textMuted">{row.original.sessionPath}</div>
          </div>
        )
      },
      {
        accessorKey: 'jsonPath',
        header: 'JSON',
        size: 160,
        cell: ({ row }) => (
          <div>
            <div className="truncate text-sm text-white">{row.original.jsonPath ? formatRelativePath(row.original.jsonPath) : '待生成'}</div>
            <div className="mt-1 text-xs text-textMuted">{row.original.jsonPath || '导入时自动补齐'}</div>
          </div>
        )
      },
      {
        accessorKey: 'lastCheckTime',
        header: '最后检测',
        size: 120,
        cell: ({ row }) => formatDateTime(row.original.lastCheckTime)
      },
      {
        accessorKey: 'lastOnlineTime',
        header: '最近在线',
        size: 120,
        cell: ({ row }) => formatDateTime(row.original.lastOnlineTime)
      },
      {
        id: 'actions',
        header: '操作',
        size: 92,
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
    estimateSize: () => 88,
    overscan: 4
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const countries = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.country).filter(Boolean))).map((value) => ({ label: value, value })),
    [accounts]
  )

  const selectedCount = selectedIds.length
  const totalCount = data.length

  const handleSearchChange = useCallback((value: string) => setSearch(value), [setSearch])

  return (
    <div className="space-y-5 contain-layout">
      <TableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        selectedCount={selectedCount}
        totalCount={totalCount}
        loading={loading}
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
        statusFilter={statusFilter}
        countryFilter={countryFilter}
        countries={countries}
        onStatusChange={setStatusFilter}
        onCountryChange={setCountryFilter}
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

            <tbody className="relative block" style={{ height: `${tableLoading ? 8 * 96 : totalSize}px` }}>
              {tableLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr
                      key={`skeleton-${index}`}
                      className="absolute left-0 top-0 block w-full px-3"
                      style={{ transform: `translateY(${index * 96}px)` }}
                    >
                      <td className="block py-1">
                        <SkeletonRow columns={12} />
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
                            className={`grid min-h-[80px] grid-cols-[52px_90px_140px_120px_140px_120px_110px_160px_160px_120px_120px_92px] items-center gap-4 rounded-[10px] px-4 py-3.5 transition ${
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
              <div className="text-base font-medium text-white">当前没有符合条件的账号</div>
              <div className="max-w-md text-sm text-textMuted">可以先导入 .session / JSON，或者调整搜索与筛选条件后再查看。</div>
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
