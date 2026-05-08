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
      className="group flex items-center gap-4 rounded-[14px] bg-white/[0.025] px-4 py-4 transition hover:bg-hover"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-hover text-sm font-black text-cyan-200">
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
    <div className="mt-auto rounded-[14px] bg-card p-5">
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
    <aside className="relative flex w-[292px] flex-col rounded-[16px] bg-panel/95 p-5 contain-layout">
      <SidebarBrand />

      <div className="mt-10 space-y-2.5">
        {items.map((item) => (
          <SidebarNavItem key={item.key} moduleKey={item.key} label={item.label} icon={item.icon} />
        ))}
      </div>

      <SidebarPulse />
    </aside>
  )
})
