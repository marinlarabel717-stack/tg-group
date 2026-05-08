import { memo, type ComponentType } from 'react'
import clsx from 'clsx'
import { useUIStore } from '../../stores/uistore'
import type { ModuleKey } from '../../types'

interface SidebarNavItemProps {
  moduleKey: ModuleKey
  label: string
  icon: ComponentType<{ size?: string | number }>
}

export const SidebarNavItem = memo(function SidebarNavItem({ moduleKey, label, icon: Icon }: SidebarNavItemProps) {
  const isActive = useUIStore((state) => state.activeModule === moduleKey)
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  return (
    <button
      onClick={() => setActiveModule(moduleKey)}
      className={clsx(
        'group relative flex h-[56px] items-center gap-3 rounded-[14px] px-3.5 text-left transition-colors duration-200',
        isActive ? 'bg-hover text-white' : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-black/10">
        <Icon size={20} />
      </span>
      <span className="min-w-0 truncate font-medium tracking-wide">{label}</span>
    </button>
  )
})
