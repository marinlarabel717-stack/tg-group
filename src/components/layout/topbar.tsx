import { memo } from 'react'
import { TopbarSearch } from './topbarsearch'
import { TopbarActions } from './topbaractions'
import { useUIStore } from '../../stores/uistore'

export const Topbar = memo(function Topbar() {
  const activeModule = useUIStore((state) => state.activeModule)
  const isAccountsModule = activeModule === 'accounts'

  return (
    <div className={`flex h-full items-center px-5 contain-layout ${isAccountsModule ? 'justify-end gap-3' : 'gap-5'}`}>
      {!isAccountsModule ? <TopbarSearch /> : null}
      <TopbarActions />
    </div>
  )
})
