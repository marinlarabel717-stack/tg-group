import { memo } from 'react'
import { Sparkles } from 'lucide-react'
import { TopbarSearch } from './topbarsearch'
import { TopbarActions } from './topbaractions'
import { useUIStore } from '../../stores/uistore'

const TopbarBrand = memo(function TopbarBrand() {
  return (
    <div className="flex min-w-[240px] items-center gap-3 rounded-[14px] bg-card px-4 py-3 text-cyan-200">
      <Sparkles size={18} />
      <div>
        <div className="text-xs tracking-[0.22em] text-textMuted">实时中枢</div>
        <div className="text-sm font-medium text-textMain">控制中心</div>
      </div>
    </div>
  )
})

export const Topbar = memo(function Topbar() {
  const activeModule = useUIStore((state) => state.activeModule)
  const isAccountsModule = activeModule === 'accounts'

  return (
    <div className={`flex h-full items-center px-5 contain-layout ${isAccountsModule ? 'justify-end gap-3' : 'gap-5'}`}>
      {!isAccountsModule ? <TopbarBrand /> : null}
      {!isAccountsModule ? <TopbarSearch /> : null}
      <TopbarActions />
    </div>
  )
})
