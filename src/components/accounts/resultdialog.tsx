import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export type ResultTone = 'success' | 'info' | 'warning' | 'danger' | 'violet' | 'neutral'

const toneBoxClass: Record<ResultTone, string> = {
  success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
  info: 'border-sky-400/20 bg-sky-400/12 text-sky-100',
  warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
  danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
  violet: 'border-violet-400/20 bg-violet-400/12 text-violet-100',
  neutral: 'border-white/10 bg-panel text-slate-100'
}

const toneValueClass: Record<ResultTone, string> = {
  success: 'text-emerald-300',
  info: 'text-sky-300',
  warning: 'text-amber-300',
  danger: 'text-rose-300',
  violet: 'text-violet-300',
  neutral: 'text-white'
}

export function ResultDialogShell({
  open,
  onClose,
  title,
  subtitle,
  icon,
  tone,
  closable = true,
  maxWidth = 'max-w-[440px]',
  children
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  icon: ReactNode
  tone: Exclude<ResultTone, 'neutral'>
  closable?: boolean
  maxWidth?: string
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4" onClick={closable ? onClose : undefined}>
      <div className={`w-full ${maxWidth} rounded-[20px] border bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)] ${toneBoxClass[tone]}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3 text-white">
            <div className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${toneBoxClass[tone]} ${toneValueClass[tone]}`}>
              {icon}
            </div>
            <div>
              <div className="text-base font-semibold text-white">{title}</div>
              <div className="mt-1 text-xs text-slate-300">{subtitle}</div>
            </div>
          </div>

          {closable ? (
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-[12px] text-textMuted transition hover:bg-white/5 hover:text-white" onClick={onClose}>
              <X size={16} />
            </button>
          ) : <div className="h-11 w-11" aria-hidden="true" />}
        </div>

        <div className="space-y-4 px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

export function ResultHero({
  label,
  value,
  tone
}: {
  label: string
  value: ReactNode
  tone: Exclude<ResultTone, 'neutral'>
}) {
  return (
    <div className={`rounded-[16px] px-4 py-4 text-center ${toneBoxClass[tone]}`}>
      <div className="text-xs tracking-[0.18em] opacity-80">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneValueClass[tone]}`}>{value}</div>
    </div>
  )
}

export function ResultStatCard({
  label,
  value,
  tone,
  wide = false
}: {
  label: string
  value: number | string
  tone: ResultTone
  wide?: boolean
}) {
  return (
    <div className={`rounded-[14px] border px-3 py-3 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)] ${toneBoxClass[tone]} ${wide ? 'col-span-full sm:col-span-2' : ''}`}>
      <div className="text-xs tracking-[0.08em] opacity-85">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneValueClass[tone]}`}>{value}</div>
    </div>
  )
}

export function ResultPrimaryButton({
  label,
  onClick,
  tone
}: {
  label: string
  onClick: () => void
  tone: Exclude<ResultTone, 'neutral'>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 w-full rounded-[12px] text-sm font-medium transition hover:brightness-110 ${toneBoxClass[tone]} ${toneValueClass[tone]}`}
    >
      {label}
    </button>
  )
}
