import { Bot, Boxes, ChartColumnBig, FileClock, Network, Users } from 'lucide-react'
import { memo } from 'react'
import type { ModuleKey } from '../../types'
import { moduleLabelMap } from '../../lib/ui-text'
import { useUIStore } from '../../stores/uistore'
import { SidebarNavItem } from './sidebarnavitem'

const items: { key: ModuleKey; label: string; icon: typeof ChartColumnBig }[] = [
  { key: 'dashboard', label: moduleLabelMap.dashboard, icon: ChartColumnBig },
  { key: 'accounts', label: moduleLabelMap.accounts, icon: Users },
  { key: 'automation', label: moduleLabelMap.automation, icon: Bot },
  { key: 'proxy-pool', label: moduleLabelMap['proxy-pool'], icon: Network },
  { key: 'session-manager', label: moduleLabelMap['session-manager'], icon: Boxes },
  { key: 'logs', label: moduleLabelMap.logs, icon: FileClock }
]

const SidebarBrand = memo(function SidebarBrand() {
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  return (
    <button
      onClick={() => setActiveModule('dashboard')}
      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 transition hover:bg-white/[0.06]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-neon to-cyan-300 text-base font-black text-slate-950">
        TM
      </div>
      <div className="text-left">
        <div className="text-xl font-semibold text-textMain">Telegram</div>
        <div className="text-sm text-textMuted">多账号管理</div>
      </div>
    </button>
  )
})

const SidebarPulse = memo(function SidebarPulse() {
  return (
    <div className="mt-auto rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-neon/10 to-transparent p-4">
      <div className="text-xs tracking-[0.25em] text-textMuted">系统脉冲</div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-2xl font-semibold text-white">99.82%</div>
          <div className="text-sm text-textMuted">运行健康度</div>
        </div>
        <div className="h-3 w-3 animate-pulseLine rounded-full bg-cyan-300" />
      </div>
    </div>
  )
})

export const Sidebar = memo(function Sidebar() {
  return (
    <aside className="relative flex w-[280px] flex-col rounded-[28px] border border-white/10 bg-panel/88 p-5 shadow-glass contain-layout">
      <SidebarBrand />

      <div className="mt-8 space-y-2">
        {items.map((item) => (
          <SidebarNavItem key={item.key} moduleKey={item.key} label={item.label} icon={item.icon} />
        ))}
      </div>

      <SidebarPulse />
    </aside>
  )
})
