import { memo } from 'react'
import type { AccountStatusFilter } from '../../stores/accountstore'

interface SummaryItem {
  key: AccountStatusFilter
  label: string
  count: number
}

interface AccountSummaryCardsProps {
  items: SummaryItem[]
  activeFilter: AccountStatusFilter
  onSelect: (value: AccountStatusFilter) => void
}

export const AccountSummaryCards = memo(function AccountSummaryCards({ items, activeFilter, onSelect }: AccountSummaryCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const active = activeFilter === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={`rounded-[16px] border px-5 py-4 text-left transition ${active
              ? 'border-violet-400/45 bg-violet-400/10 shadow-[0_0_0_1px_rgba(167,139,250,0.18)]'
              : 'border-white/8 bg-card hover:bg-hover'}`}
          >
            <div className={`text-3xl font-semibold ${active ? 'text-violet-300' : 'text-white'}`}>{item.count}</div>
            <div className={`mt-2 text-sm ${active ? 'text-violet-200' : 'text-textMuted'}`}>{item.label}</div>
          </button>
        )
      })}
    </div>
  )
})
