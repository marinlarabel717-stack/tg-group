import { memo, type ComponentType } from 'react'
import clsx from 'clsx'
import { useUIStore } from '../../stores/uistore'
import type { ModuleKey } from '../../types'

interface SidebarNavItemProps {
  moduleKey: ModuleKey
  label: string
  icon: ComponentType<{ size?: string | number }>
  collapsed?: boolean
}

export const SidebarNavItem = memo(function SidebarNavItem({ moduleKey, label, icon: Icon, collapsed = false }: SidebarNavItemProps) {
  const isActive = useUIStore((state) => state.activeModule === moduleKey)
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  return (
    <button
      title={collapsed ? label : undefined}
      onClick={() => setActiveModule(moduleKey)}
      className={clsx(
        'group relative flex h-[52px] items-center rounded-[14px] text-left transition-colors duration-200',
        collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        isActive ? 'bg-hover text-white' : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-black/10">
        <Icon size={18} />
      </span>
      {!collapsed ? <span className="min-w-0 truncate font-medium tracking-wide">{label}</span> : null}
    </button>
  )
})
