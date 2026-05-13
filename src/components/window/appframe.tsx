import { memo, type PropsWithChildren } from 'react'
import { WindowControls } from './windowcontrols'

export const AppFrame = memo(function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative h-screen overflow-hidden bg-base p-3 text-textMain">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] bg-panel shadow-[0_8px_24px_rgba(0,0,0,0.22)] contain-layout">
        <div className="absolute right-0 top-0 z-20" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <WindowControls />
        </div>
        {children}
      </div>
    </div>
  )
})
