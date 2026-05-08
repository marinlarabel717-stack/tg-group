import { memo, type PropsWithChildren } from 'react'

export const AppFrame = memo(function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#0b1220] p-2 text-textMain">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[18px] border border-white/8 bg-[#0f1726] shadow-panel contain-layout">
        {children}
      </div>
    </div>
  )
})
