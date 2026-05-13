import { memo, type ReactNode } from 'react'
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
  children?: ReactNode
  action?: ReactNode
}

export const AccountSummaryCards = memo(function AccountSummaryCards({ items, activeFilter, onSelect, children, action }: AccountSummaryCardsProps) {
  return (
    <div className="relative pr-7">
      <div className="grid grid-cols-5 gap-3">
        {items.map((item) => {
          const active = activeFilter === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`rounded-[16px] border px-5 py-4 text-left transition ${active
                ? 'border-white/[0.12] bg-violet-400/10 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
                : 'border-white/[0.06] bg-card hover:border-white/[0.09] hover:bg-hover'}`}
            >
              <div className={`text-3xl font-semibold ${active ? 'text-violet-300' : 'text-white'}`}>{item.count}</div>
              <div className={`mt-2 text-sm ${active ? 'text-violet-200' : 'text-textMuted'}`}>{item.label}</div>
            </button>
          )
        })}
        {children}
      </div>
      {action}
    </div>
  )
})
