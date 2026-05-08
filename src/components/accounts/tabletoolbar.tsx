import { memo } from 'react'
import { Loader2, RefreshCcw, Search, X } from 'lucide-react'

interface TableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  selectedCount: number
  totalCount: number
  loading: boolean
  onRefresh?: () => void
}

export const TableToolbar = memo(function TableToolbar({
  search,
  onSearchChange,
  selectedCount,
  totalCount,
  loading,
  onRefresh
}: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-white/8 bg-[#111927] px-4 py-4">
      <div className="relative min-w-[320px] flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="按手机号、国家、用户名、Proxy 搜索"
          className="h-11 w-full rounded-[12px] border border-white/8 bg-[#0d1522] pl-11 pr-10 text-sm text-textMain outline-none transition hover:border-neon/20 focus:border-neon/30"
        />
        {search ? (
          <button
            title="清空搜索"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-textMuted transition hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-[12px] border border-white/8 bg-[#0d1522] px-4 py-3">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-textMuted">已选统计</div>
          <div className="mt-1 text-sm font-medium text-white">
            已选 {selectedCount} 项 / 共 {totalCount} 行
          </div>
        </div>
      </div>

      <button
        title="刷新数据"
        onClick={onRefresh}
        className="flex h-11 items-center gap-2 rounded-[12px] border border-neon/18 bg-neon/8 px-4 text-sm font-medium text-neonSoft transition hover:border-neon/28 hover:bg-neon/12"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
        刷新
      </button>
    </div>
  )
})
