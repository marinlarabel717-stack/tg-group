import type { CSSProperties, PropsWithChildren } from 'react'
import { WindowControls } from './windowcontrols'

export function DraggableTopbar({ children }: PropsWithChildren) {
  return (
    <header
      className="relative flex h-[64px] items-center justify-between rounded-t-[18px] border-b border-white/8 bg-[#121b2b] px-4"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <WindowControls />
    </header>
  )
}
