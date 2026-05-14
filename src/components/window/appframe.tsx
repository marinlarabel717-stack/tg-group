import { memo, type PropsWithChildren } from 'react'
import { WindowControls } from './windowcontrols'

export const AppFrame = memo(function AppFrame({ children }: PropsWithChildren) {
  const appName = window.desktopInfo?.appName || 'TG-Matrix'
  const version = window.desktopInfo?.version || '0.0.9'

  return (
    <div className="relative h-screen overflow-hidden bg-base p-3 text-textMain">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] bg-panel shadow-[0_8px_24px_rgba(0,0,0,0.22)] contain-layout">
        <div className="absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-between pl-2" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="pointer-events-none flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.01em] text-white/78">
            <span className="text-[18px] font-bold text-white">{appName}</span>
            <span className="text-white/28">•</span>
            <span className="text-[14px] font-semibold text-white/68">v{version}</span>
          </div>

          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <WindowControls />
          </div>
        </div>

        {children}
      </div>
    </div>
  )
})
