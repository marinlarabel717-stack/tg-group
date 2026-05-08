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
        'content-visibility-auto rounded-3xl border border-white/10 bg-[#111a2b]/78 backdrop-blur-sm shadow-glass',
        className
      )}
    >
      {header ? <div className="border-b border-white/8 px-6 py-4">{header}</div> : null}
      <div className="px-6 py-5">{children}</div>
    </section>
  )
})
