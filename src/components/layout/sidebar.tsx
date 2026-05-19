import { Bot, ChartColumnBig, ChevronLeft, ChevronRight, FileClock, MessageCircleMore, Network, PlusSquare, Radio, SearchCheck, Settings2, SlidersHorizontal, UserPlus2, Users } from 'lucide-react'
import { memo } from 'react'
import type { ModuleKey } from '../../types'
import { moduleLabelMap } from '../../lib/ui-text'
import { useUIStore } from '../../stores/uistore'
import { BrandLogo } from '../common/brandlogo'
import { SidebarNavItem } from './sidebarnavitem'

const items: { key: ModuleKey; label: string; icon: typeof ChartColumnBig }[] = [
  { key: 'dashboard', label: moduleLabelMap.dashboard, icon: ChartColumnBig },
  { key: 'accounts', label: moduleLabelMap.accounts, icon: Users },
  { key: 'automation', label: moduleLabelMap.automation, icon: Radio },
  { key: 'bot-center', label: moduleLabelMap['bot-center'], icon: Bot },
  { key: 'auto-join', label: moduleLabelMap['auto-join'], icon: UserPlus2 },
  { key: 'batch-create', label: moduleLabelMap['batch-create'], icon: PlusSquare },
  { key: 'other-tools', label: moduleLabelMap['other-tools'], icon: SlidersHorizontal },
  { key: 'direct-message', label: moduleLabelMap['direct-message'], icon: MessageCircleMore },
  { key: 'proxy-pool', label: moduleLabelMap['proxy-pool'], icon: Network },
  { key: 'session-manager', label: moduleLabelMap['session-manager'], icon: SearchCheck },
  { key: 'logs', label: moduleLabelMap.logs, icon: FileClock },
  { key: 'settings', label: moduleLabelMap.settings, icon: Settings2 }
]

const SidebarBrand = memo(function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  return (
    <button
      title={collapsed ? 'TG-Matrix' : undefined}
      onClick={() => setActiveModule('dashboard')}
      className={`group flex items-center rounded-[18px] transition hover:bg-white/[0.03] ${collapsed ? 'justify-center p-0' : 'justify-start px-3 py-2'}`}
    >
      <BrandLogo
        size={collapsed ? 48 : 56}
        showText={!collapsed}
        roundedClassName={collapsed ? 'rounded-[16px]' : 'rounded-[18px]'}
        className={collapsed ? 'justify-center' : 'gap-3.5'}
        textClassName={collapsed ? '' : 'text-left'}
        title="TG-Matrix"
        titleClassName={collapsed ? '' : 'text-[26px] font-extrabold tracking-[0.01em] text-white'}
      />
    </button>
  )
})

export const Sidebar = memo(function Sidebar() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)

  return (
    <aside className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] bg-panel/95 contain-layout transition-[width,padding] duration-200 ${sidebarCollapsed ? 'w-[86px] p-3' : 'w-[252px] px-3 pb-3 pt-2'}`}>
      <div className={`relative mb-3 ${sidebarCollapsed ? 'flex flex-col items-center gap-3 pt-10' : 'pt-9'}`}>
        <button
          title={sidebarCollapsed ? '展开导航栏' : '收起导航栏'}
          onClick={toggleSidebar}
          className={`absolute top-0 z-10 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.08] hover:text-white ${sidebarCollapsed ? 'left-1/2 h-7 w-7 -translate-x-1/2' : 'right-0 h-7 w-7'}`}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <SidebarBrand collapsed={sidebarCollapsed} />
      </div>

      <div className={`min-h-0 flex-1 ${sidebarCollapsed ? 'mt-2' : 'mt-3'}`}>
        <div className="sidebar-scrollbar h-full space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <SidebarNavItem key={item.key} moduleKey={item.key} label={item.label} icon={item.icon} collapsed={sidebarCollapsed} />
          ))}
        </div>
      </div>

    </aside>
  )
})
