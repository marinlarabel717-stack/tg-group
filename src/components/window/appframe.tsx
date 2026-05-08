import { memo, type PropsWithChildren } from 'react'

export const AppFrame = memo(function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#060d19] p-3 text-textMain">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_24%),linear-gradient(180deg,#060d19_0%,#091221_48%,#0a1424_100%)]" />
        <div className="absolute left-[-5rem] top-12 h-56 w-56 rounded-full bg-neon/12 blur-2xl" />
        <div className="absolute right-[-5rem] top-20 h-60 w-60 rounded-full bg-cyan-300/8 blur-2xl" />
      </div>

      <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1423]/92 shadow-panel backdrop-blur-md contain-layout">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_16%)]" />
        <div className="pointer-events-none absolute inset-[1px] rounded-[31px] border border-white/5" />
        {children}
      </div>
    </div>
  )
})
