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
        'group relative flex h-14 items-center gap-3 rounded-2xl px-4 text-left transition-colors duration-200',
        isActive ? 'bg-white/[0.10] text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
      )}
    >
      {isActive ? <span className="absolute left-0 top-2 h-10 w-1 rounded-r-full bg-neon" /> : null}
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40">
        <Icon size={20} />
      </span>
      <span className="font-medium tracking-wide">{label}</span>
    </button>
  )
})
