import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ExternalLink, FolderOpen, Info, Lock, Loader2 } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { filterAccounts, useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatProxyStatus, formatSessionStatus } from '../../lib/ui-text'

function checkboxClass() {
  return 'h-4 w-4 rounded border border-white/15 bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-slate-300 transition hover:border-neon/30 hover:bg-neon/10 hover:text-neonSoft'
}

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[68px] animate-pulse grid-cols-[52px_150px_130px_120px_130px_130px_160px_140px] gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="h-10 rounded-xl bg-white/5" />
      ))}
    </div>
  )
})

const TableRowActions = memo(function TableRowActions() {
  return (
    <div className="flex items-center gap-2">
      <button title="打开目录" className={actionButtonClass()}><FolderOpen size={15} /></button>
      <button title="锁定账号" className={actionButtonClass()}><Lock size={15} /></button>
      <button title="查看详情" className={actionButtonClass()}><Info size={15} /></button>
      <button title="跳转外部" className={actionButtonClass()}><ExternalLink size={15} /></button>
    </div>
  )
})

export const AccountTable = memo(function AccountTable() {
  const { accounts, searchTerm, setSearchTerm } = useAccountStore(
    (state) => ({
      accounts: state.accounts,
      searchTerm: state.searchTerm,
      setSearchTerm: state.setSearchTerm
    }),
    shallow
  )

  const deferredSearch = useDeferredValue(searchTerm)
  const data = useMemo(() => filterAccounts(accounts, deferredSearch), [accounts, deferredSearch])

  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastActive', desc: false }])
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState(deferredSearch)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setGlobalFilter(deferredSearch)
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [deferredSearch])

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 160)
    return () => window.clearTimeout(timer)
  }, [data, sorting, columnFilters, pagination.pageIndex, pagination.pageSize, refreshTick])

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
        enableSorting: false,
        enableColumnFilter: false
      },
      { accessorKey: 'phone', header: '手机号' },
      { accessorKey: 'country', header: '国家' },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        accessorKey: 'session',
        header: 'Session',
        cell: ({ row }) => formatSessionStatus(row.original.session)
      },
      {
        accessorKey: 'proxy',
        header: 'Proxy',
        cell: ({ row }) => formatProxyStatus(row.original.proxy)
      },
      { accessorKey: 'lastActive', header: '最后活跃' },
      { accessorKey: 'username', header: '用户名' },
      {
        id: 'actions',
        header: '操作',
        enableSorting: false,
        enableColumnFilter: false,
        cell: () => <TableRowActions />
      }
    ],
    []
  )

  const handleGlobalFilterChange = useCallback((value: string) => {
    setSearchTerm(value)
  }, [setSearchTerm])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, globalFilter, columnFilters, pagination },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id
  })

  const rows = table.getPaginationRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 4
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const countries = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.country))).map((value) => ({ label: value, value })),
    [accounts]
  )
  const statuses = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.status))).map((value) => ({ label: formatAccountStatus(value), value })),
    [accounts]
  )
  const sessions = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.session))).map((value) => ({ label: formatSessionStatus(value), value })),
    [accounts]
  )
  const proxies = useMemo(
    () => Array.from(new Set(accounts.map((item) => item.proxy))).map((value) => ({ label: formatProxyStatus(value), value })),
    [accounts]
  )

  const getColumnFilter = useCallback((id: string) => String(table.getColumn(id)?.getFilterValue() ?? ''), [table])

  return (
    <div className="space-y-4 contain-layout">
      <TableToolbar
        search={searchTerm}
        onSearchChange={handleGlobalFilterChange}
        selectedCount={selectedCount}
        totalCount={table.getFilteredRowModel().rows.length}
        loading={loading}
        onRefresh={() => setRefreshTick((value) => value + 1)}
      />

      <TableFilters
        countryFilter={getColumnFilter('country')}
        statusFilter={getColumnFilter('status')}
        sessionFilter={getColumnFilter('session')}
        proxyFilter={getColumnFilter('proxy')}
        countries={countries}
        statuses={statuses}
        sessions={sessions}
        proxies={proxies}
        onCountryChange={(value) => table.getColumn('country')?.setFilterValue(value || undefined)}
        onStatusChange={(value) => table.getColumn('status')?.setFilterValue(value || undefined)}
        onSessionChange={(value) => table.getColumn('session')?.setFilterValue(value || undefined)}
        onProxyChange={(value) => table.getColumn('proxy')?.setFilterValue(value || undefined)}
      />

      <GlassPanel className="overflow-hidden p-0">
        <div ref={parentRef} className="virtual-scroll-shell max-h-[640px] overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 bg-[#101a2f]/96">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/10">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                      className="px-4 py-4 text-left text-xs font-semibold tracking-[0.24em] text-textMuted"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className="flex items-center gap-2 transition hover:text-white"
                          onClick={header.column.getToggleSortingHandler()}
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
            <tbody className="relative block" style={{ height: `${loading ? 8 * 72 : totalSize}px` }}>
              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="absolute left-0 top-0 block w-full px-4 row-transform" style={{ transform: `translate3d(0, ${index * 72}px, 0)` }}>
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
                        className="absolute left-0 top-0 block w-full px-4 row-transform"
                        style={{ transform: `translate3d(0, ${virtualRow.start}px, 0)` }}
                      >
                        <td className="block py-1">
                          <div
                            className={`grid min-h-[68px] grid-cols-[52px_150px_130px_120px_130px_130px_140px_160px_160px] items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                              row.getIsSelected()
                                ? 'border-neon/35 bg-neon/8'
                                : 'border-white/10 bg-white/[0.035] hover:border-neon/20 hover:bg-white/[0.05]'
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

          {!loading && rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="animate-spin text-neonSoft" size={22} />
              <div className="text-base font-medium text-white">没有符合筛选条件的账号</div>
              <div className="max-w-md text-sm text-textMuted">请尝试调整状态、Session、Proxy 或搜索关键词后再查看结果。</div>
            </div>
          ) : null}
        </div>
      </GlassPanel>

      <TablePagination
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        totalRows={table.getFilteredRowModel().rows.length}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onPreviousPage={() => table.previousPage()}
        onNextPage={() => table.nextPage()}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />
    </div>
  )
})
