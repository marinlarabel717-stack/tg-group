import { memo } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { AccountStatus } from '../../types'
import { accountStatusLabelMap } from '../../lib/ui-text'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  statusFilter: 'all' | AccountStatus
  countryFilter: string
  countries: FilterOption[]
  onStatusChange: (value: 'all' | AccountStatus) => void
  onCountryChange: (value: string) => void
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

export const TableFilters = memo(function TableFilters({
  statusFilter,
  countryFilter,
  countries,
  onStatusChange,
  onCountryChange
}: TableFiltersProps) {
  const statusOptions = Object.entries(accountStatusLabelMap).map(([value, label]) => ({ value, label }))

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-[14px] bg-card px-5 py-5">
      <div className="mr-1 flex h-11 w-11 items-center justify-center rounded-[12px] bg-panel text-neonSoft">
        <SlidersHorizontal size={17} />
      </div>

      <label className="flex min-w-[180px] flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-[0.22em] text-textMuted">状态</span>
        <select
          value={statusFilter}
          onChange={(event) => onStatusChange((event.target.value || 'all') as 'all' | AccountStatus)}
          className="h-11 rounded-[12px] bg-panel px-4 text-sm text-textMain outline-none transition focus:bg-hover"
        >
          <option value="all">全部</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <FilterSelect label="国家" value={countryFilter} options={countries} onChange={onCountryChange} />
    </div>
  )
})
