import { memo, type PropsWithChildren, type ReactNode } from 'react'
import clsx from 'clsx'

interface GlassPanelProps extends PropsWithChildren {
  className?: string
  header?: ReactNode
}

export const GlassPanel = memo(function GlassPanel({ className, header, children }: GlassPanelProps) {
  return (
    <section
      className={clsx(
        'rounded-[18px] border border-white/8 bg-[#111927] shadow-glass',
        className
      )}
    >
      {header ? <div className="border-b border-white/8 px-5 py-4">{header}</div> : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
})
