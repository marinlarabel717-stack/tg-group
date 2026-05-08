import { memo } from 'react'
import clsx from 'clsx'
import type { StatRecord } from '../../types'

const toneMap = {
  primary: 'bg-neon/75 text-neonSoft',
  success: 'bg-success/75 text-success',
  danger: 'bg-danger/75 text-danger',
  warning: 'bg-warning/75 text-warning'
} as const

export const KpiCard = memo(function KpiCard({ label, value, delta, tone }: StatRecord) {
  return (
    <div className="group relative rounded-[16px] border border-white/8 bg-[#111927] p-5 transition hover:border-neon/20">
      <div className={clsx('absolute inset-x-4 top-0 h-px opacity-70', toneMap[tone])} />
      <div className="text-sm font-medium text-textMuted">{label}</div>
      <div className="mt-5 flex items-end justify-between">
        <div className="text-4xl font-semibold tracking-tight text-white">{value}</div>
        <div className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', toneMap[tone], 'border-current/20 bg-white/[0.03]')}>
          {delta}
        </div>
      </div>
      <div className="mt-6 h-9 rounded-[10px] border border-white/5 bg-white/[0.02]" />
    </div>
  )
})
