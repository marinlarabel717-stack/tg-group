import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type ResultTone = 'success' | 'info' | 'warning' | 'danger' | 'violet' | 'neutral' | 'cyan' | 'indigo' | 'orange'

const toneBoxClass: Record<ResultTone, string> = {
  success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
  info: 'border-sky-400/20 bg-sky-400/12 text-sky-100',
  warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
  danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
  violet: 'border-violet-400/20 bg-violet-400/12 text-violet-100',
  neutral: 'border-white/10 bg-panel text-slate-100',
  cyan: 'border-cyan-400/20 bg-cyan-400/12 text-cyan-100',
  indigo: 'border-indigo-400/20 bg-indigo-400/12 text-indigo-100',
  orange: 'border-orange-400/20 bg-orange-400/12 text-orange-100'
}

const toneValueClass: Record<ResultTone, string> = {
  success: 'text-emerald-300',
  info: 'text-sky-300',
  warning: 'text-amber-300',
  danger: 'text-rose-300',
  violet: 'text-violet-300',
  neutral: 'text-white',
  cyan: 'text-cyan-300',
  indigo: 'text-indigo-300',
  orange: 'text-orange-300'
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
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open) {
      setPosition(null)
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
      return
    }

    setPosition(null)
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
    }
  }, [open, title, subtitle])

  if (!open) return null

  const clampPosition = (nextLeft: number, nextTop: number) => {
    const rect = panelRef.current?.getBoundingClientRect()
    const panelWidth = rect?.width ?? 440
    const panelHeight = rect?.height ?? 320
    const maxLeft = Math.max(window.innerWidth - panelWidth - 16, 16)
    const maxTop = Math.max(window.innerHeight - panelHeight - 16, 16)

    return {
      left: Math.min(Math.max(16, nextLeft), maxLeft),
      top: Math.min(Math.max(16, nextTop), maxTop)
    }
  }

  const stopDragging = () => {
    dragCleanupRef.current?.()
    dragCleanupRef.current = null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [data-dialog-no-drag="true"]')) {
      return
    }

    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return

    event.preventDefault()
    const initialPosition = position ?? { left: rect.left, top: rect.top }
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
    setPosition(initialPosition)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPosition(clampPosition(
        moveEvent.clientX - dragOffsetRef.current.x,
        moveEvent.clientY - dragOffsetRef.current.y
      ))
    }

    const handlePointerUp = () => {
      stopDragging()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/58 px-4 pt-12 pb-6" onClick={closable ? onClose : undefined}>
      <div
        ref={panelRef}
        className={`fixed w-full ${maxWidth} rounded-[20px] border bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)] ${toneBoxClass[tone]}`}
        style={position
          ? { left: `${position.left}px`, top: `${position.top}px` }
          : { left: '50%', top: '44%', transform: 'translate(-50%, -50%)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex cursor-grab items-center justify-between border-b border-white/8 px-5 py-4 active:cursor-grabbing" onPointerDown={handlePointerDown}>
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
            <button type="button" data-dialog-no-drag="true" className="flex h-11 w-11 items-center justify-center rounded-[12px] text-textMuted transition hover:bg-white/5 hover:text-white" onClick={onClose}>
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
