import type { PropsWithChildren } from 'react'

export function AppFrame({ children }: PropsWithChildren) {
  return (
    <div className="relative h-screen overflow-hidden bg-[#060d19] p-3 text-textMain">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_26%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,#060d19_0%,#091221_45%,#0a1424_100%)]" />
        <div className="absolute left-[-6rem] top-16 h-72 w-72 rounded-full bg-neon/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] shadow-[0_30px_80px_rgba(2,8,23,0.65)] backdrop-blur-3xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_18%),radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-[1px] rounded-[31px] border border-white/5" />
        {children}
      </div>
    </div>
  )
}
