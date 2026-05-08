import { memo } from 'react'
import clsx from 'clsx'
import type { StatRecord } from '../../types'

const toneMap = {
  primary: 'from-neon/20 to-cyan-400/10 text-neonSoft',
  success: 'from-success/20 to-emerald-300/10 text-success',
  danger: 'from-danger/20 to-rose-300/10 text-danger',
  warning: 'from-warning/20 to-amber-300/10 text-warning'
} as const

export const KpiCard = memo(function KpiCard({ label, value, delta, tone }: StatRecord) {
  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-card/85 p-5 shadow-glass transition hover:border-neon/30">
      <div className={clsx('absolute inset-x-4 top-0 h-px bg-gradient-to-r opacity-70', toneMap[tone])} />
      <div className="text-sm font-medium text-textMuted">{label}</div>
      <div className="mt-5 flex items-end justify-between">
        <div className="text-4xl font-semibold tracking-tight text-white">{value}</div>
        <div className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', toneMap[tone], 'border-current/20 bg-white/[0.04]')}>
          {delta}
        </div>
      </div>
      <div className="mt-6 h-10 rounded-2xl border border-white/5 bg-white/[0.03]" />
    </div>
  )
})
