import type { CSSProperties } from 'react'
import { Bell, Search, Settings, Sparkles } from 'lucide-react'
import { useAppStore } from '../../store/appstore'

export function Topbar() {
  const search = useAppStore((state) => state.search)
  const setSearch = useAppStore((state) => state.setSearch)
  const notificationCount = useAppStore((state) => state.notificationCount)
  const userName = useAppStore((state) => state.userName)

  return (
    <div className="flex h-full items-center gap-4 px-4">
      <div className="flex min-w-[240px] items-center gap-3 rounded-2xl border border-cyan-300/10 bg-slate-950/35 px-4 py-3 text-cyan-200 shadow-neon">
        <Sparkles size={18} />
        <div>
          <div className="text-xs tracking-[0.22em] text-textMuted">实时中枢</div>
          <div className="text-sm font-medium text-textMain">控制中心</div>
        </div>
      </div>

      <div className="relative mx-2 flex-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索账号 / 用户名 / 国家"
          className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/45 pl-11 pr-4 text-sm text-textMain outline-none transition focus:border-neon/50 focus:shadow-neon"
        />
      </div>

      <button title="通知" className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-slate-200 transition hover:border-neon/40 hover:text-white hover:shadow-neon" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Bell size={18} />
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-white">
          {notificationCount}
        </span>
      </button>

      <button title="设置" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-slate-200 transition hover:border-neon/40 hover:text-white hover:shadow-neon" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Settings size={18} />
      </button>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-neon text-sm font-bold text-slate-950">
          总
        </div>
        <div>
          <div className="text-sm font-semibold text-textMain">{userName}</div>
          <div className="text-xs text-textMuted">企业管理员</div>
        </div>
      </div>
    </div>
  )
}
