import type { CSSProperties, PropsWithChildren } from 'react'
import { WindowControls } from './windowcontrols'

export function DraggableTopbar({ children }: PropsWithChildren) {
  return (
    <header
      className="relative flex h-[68px] items-center justify-between rounded-t-[16px] bg-panel px-4"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <WindowControls />
    </header>
  )
}
