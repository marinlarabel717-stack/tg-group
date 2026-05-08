import type { CSSProperties, PropsWithChildren } from 'react'
import { WindowControls } from './windowcontrols'

export function DraggableTopbar({ children }: PropsWithChildren) {
  return (
    <header
      className="relative flex h-[74px] items-center justify-between rounded-t-[28px] border-b border-white/10 bg-white/[0.05] px-4 backdrop-blur-3xl"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/70 to-transparent" />
      <div className="min-w-0 flex-1">{children}</div>
      <WindowControls />
    </header>
  )
}
