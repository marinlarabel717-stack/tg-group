import { memo } from 'react'
import { TopbarSearch } from './topbarsearch'
import { TopbarActions } from './topbaractions'
import { BrandLogo } from '../common/brandlogo'
import { useUIStore } from '../../stores/uistore'

const TopbarBrand = memo(function TopbarBrand() {
  return (
    <div className="flex min-w-[280px] items-center rounded-[14px] bg-card px-4 py-2.5 text-cyan-200">
      <BrandLogo
        size={52}
        title="TG-Matrix"
        roundedClassName="rounded-[14px]"
        titleClassName="text-[22px] font-semibold text-white"
      />
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
