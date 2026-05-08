import { Loader2, RefreshCcw, Search, X } from 'lucide-react'

interface TableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  selectedCount: number
  totalCount: number
  loading: boolean
  onRefresh?: () => void
}

export function TableToolbar({
  search,
  onSearchChange,
  selectedCount,
  totalCount,
  loading,
  onRefresh
}: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4 shadow-glass">
      <div className="relative min-w-[320px] flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by phone, country, username, proxy"
          className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/45 pl-11 pr-10 text-sm text-textMain outline-none transition hover:border-neon/30 focus:border-neon/50 focus:shadow-neon"
        />
        {search ? (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-textMuted transition hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-textMuted">Selection</div>
          <div className="mt-1 text-sm font-medium text-white">
            {selectedCount} selected / {totalCount} rows
          </div>
        </div>
      </div>

      <button
        onClick={onRefresh}
        className="flex h-12 items-center gap-2 rounded-2xl border border-neon/20 bg-neon/10 px-4 text-sm font-medium text-neonSoft transition hover:border-neon/40 hover:bg-neon/15 hover:shadow-neon"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
        Refresh
      </button>
    </div>
  )
}
