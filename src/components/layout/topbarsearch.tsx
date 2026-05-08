import { memo, useCallback, type CSSProperties } from 'react'
import { Search } from 'lucide-react'
import { useUIStore } from '../../stores/uistore'
import { useAccountStore } from '../../stores/accountstore'

export const TopbarSearch = memo(function TopbarSearch() {
  const activeModule = useUIStore((state) => state.activeModule)
  const searchTerm = useAccountStore((state) => state.searchTerm)
  const setSearchTerm = useAccountStore((state) => state.setSearchTerm)

  const isAccountModule = activeModule === 'accounts'
  const handleChange = useCallback((value: string) => {
    setSearchTerm(value)
  }, [setSearchTerm])

  return (
    <div className="relative mx-2 flex-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
      <input
        value={isAccountModule ? searchTerm : ''}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={isAccountModule ? '搜索账号 / 用户名 / 国家' : '当前模块无需搜索'}
        disabled={!isAccountModule}
        className="h-11 w-full rounded-[14px] border border-white/8 bg-[#0d1522] pl-11 pr-4 text-sm text-textMain outline-none transition focus:border-neon/30 disabled:cursor-default disabled:opacity-70"
      />
    </div>
  )
})
