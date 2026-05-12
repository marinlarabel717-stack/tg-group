import { memo } from 'react'
import { Loader2, RefreshCcw, SlidersHorizontal } from 'lucide-react'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  countryFilter: string
  statusFilter: string
  sourceFilter: string
  proxyFilter: string
  loading: boolean
  busy: boolean
  countries: FilterOption[]
  statuses: FilterOption[]
  sources: FilterOption[]
  proxies: FilterOption[]
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSourceChange: (value: string) => void
  onProxyChange: (value: string) => void
  onRefresh: () => void
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-[180px] flex-col gap-2">
      <span className="text-[11px] font-semibold tracking-[0.22em] text-textMuted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-[12px] bg-panel px-4 text-sm text-textMain outline-none transition focus:bg-hover"
      >
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export const TableFilters = memo(function TableFilters(props: TableFiltersProps) {
  const blocked = props.loading || props.busy
  const spacerClass = 'text-[11px] font-semibold tracking-[0.22em] text-transparent select-none'

  return (
    <div className="flex flex-wrap gap-4 rounded-[14px] bg-card px-5 py-5">
      <div className="mr-1 flex flex-col gap-2">
        <span className={spacerClass}>筛选</span>
        <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-panel text-neonSoft">
          <SlidersHorizontal size={17} />
        </div>
      </div>

      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="资料来源" value={props.sourceFilter} options={props.sources} onChange={props.onSourceChange} />
      <FilterSelect label="Proxy" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />

      <div className="flex flex-col gap-2 self-start">
        <span className={spacerClass}>刷新</span>
        <button
          onClick={props.onRefresh}
          disabled={blocked}
          className="flex h-11 items-center gap-2 rounded-[12px] bg-neon/10 px-4 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {props.loading ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <RefreshCcw size={16} className="shrink-0" />}
          刷新
        </button>
      </div>
    </div>
  )
})
