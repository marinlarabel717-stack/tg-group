import { Bot, Boxes, ChartColumnBig, FileClock, Network, Users } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useAppStore } from '../../store/appstore'
import type { ModuleKey } from '../../types'

const items: { key: ModuleKey; label: string; icon: typeof ChartColumnBig }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: ChartColumnBig },
  { key: 'accounts', label: 'Accounts', icon: Users },
  { key: 'automation', label: 'Automation', icon: Bot },
  { key: 'proxy-pool', label: 'Proxy Pool', icon: Network },
  { key: 'session-manager', label: 'Session Manager', icon: Boxes },
  { key: 'logs', label: 'Logs', icon: FileClock }
]

export function Sidebar() {
  const activeModule = useAppStore((state) => state.activeModule)
  const setModule = useAppStore((state) => state.setModule)

  return (
    <aside className="relative flex w-[280px] flex-col rounded-[28px] border border-white/10 bg-panel/75 p-5 backdrop-blur-2xl shadow-glass">
      <button
        onClick={() => setModule('dashboard')}
        className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/10"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-neon to-cyan-300 text-base font-black text-slate-950 shadow-neon">
          TM
        </div>
        <div className="text-left">
          <div className="text-xl font-semibold text-textMain">Telegram</div>
          <div className="text-sm text-textMuted">Multi Account Manager</div>
        </div>
      </button>

      <div className="mt-8 space-y-2">
        {items.map(({ key, label, icon: Icon }) => {
          const isActive = activeModule === key
          return (
            <button
              key={key}
              onClick={() => setModule(key)}
              className={clsx(
                'group relative flex h-14 items-center gap-3 rounded-2xl px-4 text-left transition-all duration-300',
                isActive
                  ? 'bg-white/10 text-white shadow-neon'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-2 h-10 w-1 rounded-r-full bg-neon"
                />
              ) : null}
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40">
                <Icon size={20} />
              </span>
              <span className="font-medium tracking-wide">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-neon/10 to-transparent p-4">
        <div className="text-xs uppercase tracking-[0.25em] text-textMuted">System pulse</div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold text-white">99.82%</div>
            <div className="text-sm text-textMuted">runtime health</div>
          </div>
          <div className="h-3 w-3 animate-pulseLine rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.8)]" />
        </div>
      </div>
    </aside>
  )
}
