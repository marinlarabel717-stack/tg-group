import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

interface GlassPanelProps extends PropsWithChildren {
  className?: string
  header?: ReactNode
}

export function GlassPanel({ className, header, children }: GlassPanelProps) {
  return (
    <section
      className={clsx(
        'rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-panel',
        className
      )}
    >
      {header ? <div className="border-b border-white/8 px-6 py-4">{header}</div> : null}
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}
