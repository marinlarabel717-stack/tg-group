import { Bot, Boxes, ChartColumnBig, ChevronLeft, ChevronRight, FileClock, Network, Users } from 'lucide-react'
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

const SidebarBrand = memo(function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  return (
    <button
      title={collapsed ? 'Telegram 多账号管理' : undefined}
      onClick={() => setActiveModule('dashboard')}
      className={`group flex items-center rounded-[14px] bg-white/[0.025] transition hover:bg-hover ${collapsed ? 'justify-center px-0 py-3.5' : 'gap-3 px-3 py-3.5'}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-hover text-sm font-black text-cyan-200">
        TM
      </div>
      {!collapsed ? (
        <div className="min-w-0 text-left">
          <div className="truncate text-[18px] font-semibold text-textMain">Telegram</div>
          <div className="truncate text-[13px] text-textMuted">多账号管理</div>
        </div>
      ) : null}
    </button>
  )
})

const SidebarPulse = memo(function SidebarPulse({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="mt-auto flex justify-center rounded-[14px] bg-card px-0 py-4" title="系统脉冲 · 99.82%">
        <div className="h-3 w-3 animate-pulseLine rounded-full bg-cyan-300" />
      </div>
    )
  }

  return (
    <div className="mt-auto rounded-[14px] bg-card p-3.5">
      <div className="text-[11px] tracking-[0.22em] text-textMuted">系统脉冲</div>
      <div className="mt-2.5 flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold text-white">99.82%</div>
          <div className="text-[13px] text-textMuted">运行健康度</div>
        </div>
        <div className="h-3 w-3 animate-pulseLine rounded-full bg-cyan-300" />
      </div>
    </div>
  )
})

export const Sidebar = memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)

  return (
    <aside className={`relative flex flex-col rounded-[16px] bg-panel/95 contain-layout transition-[width,padding] duration-200 ${sidebarCollapsed ? 'w-[84px] p-3' : 'w-[224px] p-3.5'}`}>
      <div className={`mb-3 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
        <SidebarBrand collapsed={sidebarCollapsed} />
        {!sidebarCollapsed ? (
          <button
            title="收起导航栏"
            onClick={toggleSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.025] text-slate-300 transition hover:bg-hover hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
        ) : null}
      </div>

      {sidebarCollapsed ? (
        <button
          title="展开导航栏"
          onClick={toggleSidebar}
          className="mb-3 flex h-10 w-full items-center justify-center rounded-[12px] bg-white/[0.025] text-slate-300 transition hover:bg-hover hover:text-white"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}

      <div className={`space-y-2 ${sidebarCollapsed ? 'mt-2' : 'mt-4'}`}>
        {items.map((item) => (
          <SidebarNavItem key={item.key} moduleKey={item.key} label={item.label} icon={item.icon} collapsed={sidebarCollapsed} />
        ))}
      </div>

      <SidebarPulse collapsed={sidebarCollapsed} />
    </aside>
  )
})
