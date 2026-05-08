import { memo } from 'react'
import { Sparkles } from 'lucide-react'
import { TopbarSearch } from './topbarsearch'
import { TopbarActions } from './topbaractions'

const TopbarBrand = memo(function TopbarBrand() {
  return (
    <div className="flex min-w-[240px] items-center gap-3 rounded-2xl border border-cyan-300/10 bg-slate-950/35 px-4 py-3 text-cyan-200">
      <Sparkles size={18} />
      <div>
        <div className="text-xs tracking-[0.22em] text-textMuted">实时中枢</div>
        <div className="text-sm font-medium text-textMain">控制中心</div>
      </div>
    </div>
  )
})

export const Topbar = memo(function Topbar() {
  return (
    <div className="flex h-full items-center gap-4 px-4 contain-layout">
      <TopbarBrand />
      <TopbarSearch />
      <TopbarActions />
    </div>
  )
})
