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
        'rounded-[16px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.14)]',
        className
      )}
    >
      {header ? <div className="px-5 py-4">{header}</div> : null}
      <div className="px-5 py-5">{children}</div>
    </section>
  )
})
