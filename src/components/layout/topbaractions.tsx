import { memo, type CSSProperties } from 'react'
import { Bell, Settings } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useUIStore } from '../../stores/uistore'

export const TopbarActions = memo(function TopbarActions() {
  const { notificationCount, userName } = useUIStore(
    (state) => ({ notificationCount: state.notificationCount, userName: state.userName }),
    shallow
  )

  return (
    <>
      <button title="通知" className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-slate-200 transition hover:border-neon/30 hover:text-white" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Bell size={18} />
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-white">
          {notificationCount}
        </span>
      </button>

      <button title="设置" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 text-slate-200 transition hover:border-neon/30 hover:text-white" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
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
    </>
  )
})
