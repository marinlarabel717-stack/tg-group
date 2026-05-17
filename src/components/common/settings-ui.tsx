import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export const SOFT_INPUT_CLASS = 'border border-white/[0.06] bg-black/10 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
export const SOFT_PANEL_INPUT_CLASS = 'border border-white/[0.06] bg-panel text-white outline-none transition focus:border-white/[0.12] focus:bg-panel'
export const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'

export function FoldSection(props: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const { title, hint, defaultOpen = true, children } = props
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-white/[0.035] bg-black/[0.08] px-3.5 py-2.5 text-left transition hover:bg-white/[0.02]"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{title}</div>
          {hint ? <div className="mt-1 text-xs text-textMuted">{hint}</div> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-textMuted">
          <span>{open ? '收起' : '展开'}</span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      {open ? <div className="overflow-hidden rounded-[12px] border border-white/[0.03] bg-black/[0.06] divide-y divide-white/[0.035]">{children}</div> : null}
    </div>
  )
}

export function ConfigRow(props: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  const { label, hint, children, wide = false } = props
  return (
    <div className="px-3 py-3 text-sm">
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="text-sm text-white">{label}</div>
          {hint ? <div className="mt-1 text-xs text-textMuted">{hint}</div> : null}
        </div>
        <div className={wide ? 'w-full' : 'w-full max-w-[140px]'}>{children}</div>
      </div>
    </div>
  )
}

export function NumberRangeField(props: {
  label: string
  minValue: number
  maxValue: number
  onMinChange: (value: number) => void
  onMaxChange: (value: number) => void
  min?: number
  max?: number
  hint?: string
}) {
  const { label, minValue, maxValue, onMinChange, onMaxChange, min = 0, max = 999, hint = '最小 - 最大（秒）' } = props
  return (
    <label className="block px-3 py-3 text-sm">
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="text-sm text-white">{label}</div>
          <div className="mt-1 text-xs text-textMuted">{hint}</div>
        </div>
        <div className="flex max-w-[180px] items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            value={minValue}
            onChange={(event) => onMinChange(Math.max(min, Number(event.target.value) || min))}
            className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
          />
          <span className="text-textMuted">-</span>
          <input
            type="number"
            min={min}
            max={max}
            value={maxValue}
            onChange={(event) => onMaxChange(Math.max(min, Number(event.target.value) || min))}
            className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
          />
        </div>
      </div>
    </label>
  )
}
