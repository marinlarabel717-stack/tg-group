import { memo, type CSSProperties } from 'react'
import { Bell, Settings } from 'lucide-react'
import { useUIStore } from '../../stores/uistore'

export const TopbarActions = memo(function TopbarActions() {
  const notificationCount = useUIStore((state) => state.notificationCount)
  const userName = useUIStore((state) => state.userName)

  return (
    <>
      <button title="通知" className="relative flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/8 bg-[#0d1522] text-slate-200 transition hover:border-neon/25 hover:text-white" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Bell size={18} />
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-neon px-1 text-[10px] font-bold text-white">
          {notificationCount}
        </span>
      </button>

      <button title="设置" className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/8 bg-[#0d1522] text-slate-200 transition hover:border-neon/25 hover:text-white" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <Settings size={18} />
      </button>

      <div className="flex items-center gap-3 rounded-[14px] border border-white/8 bg-[#0d1522] px-3 py-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#1a2538] text-sm font-bold text-cyan-200">
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
