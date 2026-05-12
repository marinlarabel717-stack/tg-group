import { memo } from 'react'
import { RefreshCw, Search, X } from 'lucide-react'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  search: string
  countryFilter: string
  statusFilter: string
  proxyFilter: string
  countries: FilterOption[]
  statuses: FilterOption[]
  proxies: FilterOption[]
  onSearchChange: (value: string) => void
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
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
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 min-w-[132px] rounded-[12px] bg-card px-4 text-sm text-textMain outline-none transition focus:bg-hover"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export const TableFilters = memo(function TableFilters(props: TableFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[280px] flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="按手机号、用户名、userId、路径搜索"
          className="h-11 w-full rounded-[12px] bg-card pl-11 pr-10 text-sm leading-none text-textMain outline-none transition focus:bg-hover"
        />
        {props.search ? (
          <button
            type="button"
            title="清空搜索"
            onClick={() => props.onSearchChange('')}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-textMuted transition hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="代理" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />

      <button
        type="button"
        onClick={props.onRefresh}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-card px-4 text-sm font-medium text-textMain transition hover:bg-hover"
      >
        <RefreshCw size={16} />
        刷新
      </button>
    </div>
  )
})
