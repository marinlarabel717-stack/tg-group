import { memo } from 'react'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  countryFilter: string
  statusFilter: string
  proxyFilter: string
  countries: FilterOption[]
  statuses: FilterOption[]
  proxies: FilterOption[]
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
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
      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="代理" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />
    </div>
  )
})
