import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type UIEvent,
  type WheelEvent
} from 'react'
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
import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { filterAccounts, useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatCountryDisplay, formatDateTime, formatProfileSource } from '../../lib/ui-text'
import { resolveCountryMeta } from '../../lib/phone-country'
import { useUIStore } from '../../stores/uistore'

const ACCOUNT_GRID_TEMPLATE = '56px 168px 124px 124px 124px 124px 148px 168px 108px'
const ACCOUNT_GRID_WIDTH = 1144
const ACCOUNT_SHELL_WIDTH = ACCOUNT_GRID_WIDTH + 24
const ACCOUNT_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: ACCOUNT_GRID_TEMPLATE,
  width: `${ACCOUNT_GRID_WIDTH}px`,
  minWidth: 'max-content'
}

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function actionButtonClass() {
  return 'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

function cellTextClass(extra = '') {
  return `block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${extra}`.trim()
}

function CountryCell({ country, phone }: { country: string; phone: string }) {
  const meta = resolveCountryMeta(phone, country)
  const value = formatCountryDisplay(country, phone)

  if (!meta) {
    return <div className={cellTextClass()} title={value}>{value}</div>
  }

  const FlagComponent = FlagIcons[meta.iso2 as keyof typeof FlagIcons] as ((props: { title?: string; className?: string }) => JSX.Element) | undefined

  return (
    <div className="flex min-w-0 items-center gap-2" title={value}>
      {FlagComponent ? (
        <FlagComponent className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" title={meta.nameZh} />
      ) : null}
      <span className={cellTextClass()}>{meta.nameZh}</span>
    </div>
  )
}

function cellShellClass(columnId: string, isHeader = false) {
  if (columnId === 'select') {
    return 'flex h-full w-full items-center justify-center px-0'
  }

  if (columnId === 'status') {
    return isHeader
      ? 'flex h-full w-full items-center justify-center px-2'
      : 'flex h-full w-full items-center justify-center px-2'
  }

  if (columnId === 'actions') {
    return 'flex h-full w-full items-center justify-start px-2'
  }

  return 'flex h-full w-full min-w-0 items-center justify-start px-2'
}

function readProxy(account: AccountRecord) {
  const proxy = account.profile?.proxy
  return typeof proxy === 'string' && proxy.trim() ? proxy.trim() : '未配置'
}

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[52px] shrink-0 items-center gap-0 rounded-[10px] bg-panel" style={ACCOUNT_GRID_STYLE}>
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="px-3 py-2.5">
          <div className="h-7 animate-pulse rounded-[8px] bg-white/[0.03]" />
        </div>
      ))}
    </div>
  )
})

const TableRowActions = memo(function TableRowActions({ account }: { account: AccountRecord }) {
  const revealPath = useAccountStore((state) => state.revealPath)

  return (
    <div className="flex w-full items-center justify-start gap-1.5 overflow-hidden">
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
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  const [sourceFilter, setSourceFilter] = useState('')
  const [proxyFilter, setProxyFilter] = useState('')
  const [sorting, setSorting] = useState([{ id: 'lastOnlineTime', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [tableLoading, setTableLoading] = useState(true)
  const [scrollLeft, setScrollLeft] = useState(0)
  const deferredSearch = useDeferredValue(search)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollbarRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }, [deferredSearch, statusFilter, countryFilter, sourceFilter, proxyFilter])

  useEffect(() => {
    setTableLoading(true)
    const timer = window.setTimeout(() => setTableLoading(false), 160)
    return () => window.clearTimeout(timer)
  }, [data, sorting, pagination.pageIndex, pagination.pageSize, loading])

  useEffect(() => {
    if (scrollbarRef.current) {
      scrollbarRef.current.scrollLeft = scrollLeft
    }
  }, [scrollLeft])

  const rowSelection = useMemo<RowSelectionState>(() => Object.fromEntries(selectedIds.map((id) => [String(id), true])), [selectedIds])

  const columns = useMemo<ColumnDef<AccountRecord>[]>(
    () => [
      {
        id: 'select',
        size: 60,
        header: ({ table }) => (
          <div className={cellShellClass('select', true)}>
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
          <div className={cellShellClass('select')}>
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
        size: 168,
        cell: ({ row }) => {
          const value = row.original.phone || '—'
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'country',
        header: '国家',
        size: 124,
        cell: ({ row }) => <CountryCell country={row.original.country} phone={row.original.phone} />
      },
      {
        accessorKey: 'status',
        header: '状态',
        size: 124,
        cell: ({ row }) => <StatusBadge status={row.original.status} />
      },
      {
        id: 'source',
        header: '资料来源',
        size: 124,
        cell: ({ row }) => {
          const value = formatProfileSource(row.original.profileSource)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'proxy',
        header: 'Proxy',
        size: 124,
        cell: ({ row }) => {
          const value = readProxy(row.original)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'lastOnlineTime',
        header: '最后活跃',
        size: 148,
        cell: ({ row }) => {
          const value = formatDateTime(row.original.lastOnlineTime || row.original.lastCheckTime)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        accessorKey: 'username',
        header: '用户名',
        size: 168,
        cell: ({ row }) => {
          const value = row.original.username || '—'
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'actions',
        header: '操作',
        size: 108,
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
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 52,
    overscan: 4,
    paddingStart: 0
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const countries = useMemo(
    () => Array.from(new Set(accounts.map((item) => formatCountryDisplay(item.country, item.phone)).filter(Boolean))).map((value) => ({ label: value, value })),
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

  const orderedIds = useMemo(
    () => table.getSortedRowModel().rows.map((row) => row.original.id),
    [table, data, sorting]
  )

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [setSearch])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(orderedIds)
  }, [orderedIds, setSelectedIds])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  const handleSelectRange = useCallback((start: number, end: number) => {
    const normalizedStart = Math.max(1, Math.min(start, end))
    const normalizedEnd = Math.max(start, end)
    const ids = orderedIds.slice(normalizedStart - 1, normalizedEnd)
    setSelectedIds(ids)
  }, [orderedIds, setSelectedIds])

  const handleStartCheck = useCallback((_actions: string[]) => {
    setActiveModule('logs')
    void startSelectedCheck()
  }, [setActiveModule, startSelectedCheck])

  const handleScrollbarScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollLeft(event.currentTarget.scrollLeft)
  }, [])

  const handleViewportWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!scrollbarRef.current) return

    if (Math.abs(event.deltaX) > 0) {
      scrollbarRef.current.scrollLeft += event.deltaX
      event.preventDefault()
      return
    }

    if (event.shiftKey && Math.abs(event.deltaY) > 0) {
      scrollbarRef.current.scrollLeft += event.deltaY
      event.preventDefault()
    }
  }, [])

  return (
    <div className="space-y-4 min-w-0">
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
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onSelectRange={handleSelectRange}
        onStartCheck={handleStartCheck}
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

      <GlassPanel className="overflow-hidden p-0">
        <div className="min-w-0">
          <div ref={viewportRef} className="virtual-scroll-shell min-w-0 max-h-[580px] overflow-y-auto overflow-x-hidden" onWheel={handleViewportWheel}>
            <div className="relative overflow-hidden" style={{ height: `${tableLoading ? 8 * 52 + 56 : totalSize + 56}px` }}>
              <div
                className="absolute left-0 top-0"
                style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, minWidth: 'max-content', transform: `translateX(-${scrollLeft}px)` }}
              >
                <div className="sticky top-0 z-10 bg-card px-3 pb-[2px] pt-[2px]" style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, minWidth: 'max-content' }}>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <div key={headerGroup.id} className="grid shrink-0" style={ACCOUNT_GRID_STYLE}>
                      {headerGroup.headers.map((header) => (
                        <div
                          key={header.id}
                          className={`${cellShellClass(header.column.id, true)} h-[48px] shrink-0 text-left text-[11px] font-semibold tracking-[0.22em] text-textMuted`}
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              className={header.column.id === 'status'
                                ? 'flex min-w-0 items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-left transition hover:text-white'
                                : 'flex w-full min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-left transition hover:text-white'}
                              onClick={header.column.getToggleSortingHandler()}
                              title={String(header.column.columnDef.header ?? '')}
                            >
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </span>
                              <ArrowUpDown size={14} className="shrink-0" />
                            </button>
                          ) : (
                            <div className="w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="relative" style={{ height: `${tableLoading ? 8 * 52 : totalSize}px` }}>
                  {tableLoading
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={`skeleton-${index}`}
                          className="absolute left-0 top-0 px-3 py-[3px]"
                          style={{ transform: `translateY(${index * 52}px)`, width: `${ACCOUNT_SHELL_WIDTH}px` }}
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
                            className="absolute left-0 top-0 px-3 py-[3px]"
                            style={{ transform: `translateY(${virtualRow.start}px)`, width: `${ACCOUNT_SHELL_WIDTH}px` }}
                          >
                            <div
                              className={`grid min-h-[52px] shrink-0 items-center gap-0 rounded-[10px] transition ${
                                row.getIsSelected() ? 'bg-neon/8' : 'bg-panel hover:bg-hover'
                              }`}
                              style={ACCOUNT_GRID_STYLE}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <div key={cell.id} className={`${cellShellClass(cell.column.id)} shrink-0 py-2 text-[13px] text-textMain`}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                </div>
              </div>
            </div>
          </div>

          {!tableLoading && rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
              <Loader2 className="animate-spin text-neonSoft" size={22} />
              <div className="text-base font-medium text-white">没有符合筛选条件的账号</div>
              <div className="max-w-md text-sm text-textMuted">请尝试调整状态、资料来源、Proxy 或搜索关键词后再查看结果。</div>
            </div>
          ) : (
            <div className="border-t border-white/5 px-3 pb-2 pt-1.5">
              <div ref={scrollbarRef} className="account-table-scrollbar h-4 overflow-x-auto overflow-y-hidden" onScroll={handleScrollbarScroll}>
                <div style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, height: '1px' }} />
              </div>
            </div>
          )}
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
