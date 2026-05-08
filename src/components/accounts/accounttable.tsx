import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'

interface AccountTableProps {
  data: AccountRecord[]
  externalSearch?: string
  onExternalSearchChange?: (value: string) => void
}

function checkboxClass() {
  return 'h-4 w-4 rounded border border-white/15 bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-slate-300 transition hover:border-neon/40 hover:bg-neon/10 hover:text-neonSoft hover:shadow-neon'
}

function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[68px] animate-pulse grid-cols-[52px_150px_130px_120px_130px_130px_160px_140px] gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="h-10 rounded-xl bg-white/5" />
      ))}
    </div>
  )
}

export function AccountTable({ data, externalSearch = '', onExternalSearchChange }: AccountTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastActive', desc: false }])
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState(externalSearch)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setGlobalFilter(externalSearch)
  }, [externalSearch])

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 420)
    return () => window.clearTimeout(timer)
  }, [globalFilter, sorting, columnFilters, pagination.pageIndex, pagination.pageSize, refreshTick])

  const columns = useMemo<ColumnDef<AccountRecord>[]>(
    () => [
      {
        id: 'select',
        size: 52,
        header: ({ table }) => (
          <input
            type="checkbox"
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
            className={checkboxClass()}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false,
        enableColumnFilter: false
      },
      { accessorKey: 'phone', header: 'Phone' },
      { accessorKey: 'country', header: 'Country' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      { accessorKey: 'session', header: 'Session' },
      { accessorKey: 'proxy', header: 'Proxy' },
      { accessorKey: 'lastActive', header: 'Last Active' },
      { accessorKey: 'username', header: 'Username' },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableColumnFilter: false,
        cell: () => (
          <div className="flex items-center gap-2">
            <button className={actionButtonClass()}><FolderOpen size={15} /></button>
            <button className={actionButtonClass()}><Lock size={15} /></button>
            <button className={actionButtonClass()}><Info size={15} /></button>
            <button className={actionButtonClass()}><ExternalLink size={15} /></button>
          </div>
        )
      }
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, globalFilter, columnFilters, pagination },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: (value) => {
      const next = String(value)
      setGlobalFilter(next)
      onExternalSearchChange?.(next)
    },
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
    estimateSize: () => 72,
    overscan: 8
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const countries = useMemo(
    () => Array.from(new Set(data.map((item) => item.country))).map((value) => ({ label: value, value })),
    [data]
  )
  const statuses = useMemo(
    () => Array.from(new Set(data.map((item) => item.status))).map((value) => ({ label: value, value })),
    [data]
  )
  const sessions = useMemo(
    () => Array.from(new Set(data.map((item) => item.session))).map((value) => ({ label: value, value })),
    [data]
  )
  const proxies = useMemo(
    () => Array.from(new Set(data.map((item) => item.proxy))).map((value) => ({ label: value, value })),
    [data]
  )

  const getColumnFilter = (id: string) => String(table.getColumn(id)?.getFilterValue() ?? '')

  return (
    <div className="space-y-4">
      <TableToolbar
        search={globalFilter}
        onSearchChange={(value) => table.setGlobalFilter(value)}
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
        <div ref={parentRef} className="max-h-[640px] overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 bg-[#101a2f]/95 backdrop-blur-xl">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-white/10">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                      className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em] text-textMuted"
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
                    <tr key={`skeleton-${index}`} className="absolute left-0 top-0 block w-full px-4" style={{ transform: `translateY(${index * 72}px)` }}>
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
                        className="absolute left-0 top-0 block w-full px-4"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <td className="block py-1">
                          <div
                            className={`grid min-h-[68px] grid-cols-[52px_150px_130px_120px_130px_130px_140px_160px_160px] items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                              row.getIsSelected()
                                ? 'border-neon/40 bg-neon/10 shadow-neon'
                                : 'border-white/10 bg-white/[0.035] hover:border-neon/25 hover:bg-white/[0.06]'
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
              <div className="text-base font-medium text-white">No accounts matched your filters</div>
              <div className="max-w-md text-sm text-textMuted">Try changing status, session, proxy, or global search to reveal more enterprise account records.</div>
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
}
