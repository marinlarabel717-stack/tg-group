import { SlidersHorizontal } from 'lucide-react'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  countryFilter: string
  statusFilter: string
  sessionFilter: string
  proxyFilter: string
  countries: FilterOption[]
  statuses: FilterOption[]
  sessions: FilterOption[]
  proxies: FilterOption[]
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSessionChange: (value: string) => void
  onProxyChange: (value: string) => void
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
        className="h-11 rounded-2xl border border-white/10 bg-slate-950/40 px-4 text-sm text-textMain outline-none transition hover:border-neon/30 focus:border-neon/50"
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

export function TableFilters(props: TableFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-glass">
      <div className="mr-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/45 text-neonSoft">
        <SlidersHorizontal size={17} />
      </div>
      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="Session" value={props.sessionFilter} options={props.sessions} onChange={props.onSessionChange} />
      <FilterSelect label="Proxy" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />
    </div>
  )
}
