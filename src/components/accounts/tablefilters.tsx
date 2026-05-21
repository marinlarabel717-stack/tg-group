import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import { SOFT_INPUT_CLASS, SOFT_SELECT_OPTION_CLASS } from '../common/settings-ui'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  search: string
  countryFilter: string
  statusFilter: string
  proxyFilter: string
  twoFactorFilter: string
  avatarFilter: string
  taskFilter: string
  usernameFilter: string
  reauthorizeFilter: string
  countries: FilterOption[]
  statuses: FilterOption[]
  proxies: FilterOption[]
  presences: FilterOption[]
  reauthorizeOptions: FilterOption[]
  onSearchChange: (value: string) => void
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onProxyChange: (value: string) => void
  onTwoFactorChange: (value: string) => void
  onAvatarChange: (value: string) => void
  onTaskChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onReauthorizeChange: (value: string) => void
  onRefresh: () => void
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-11 min-w-[132px] rounded-[12px] px-4 text-sm text-textMain ${SOFT_INPUT_CLASS}`}
    >
      <option value="" className={SOFT_SELECT_OPTION_CLASS}>{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value} className={SOFT_SELECT_OPTION_CLASS}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function readPresenceSummary(label: string, value: string) {
  if (value === 'has') return `有${label}`
  if (value === 'none') return `无${label}`
  return ''
}

function readReauthorizeSummary(value: string) {
  if (value === 'success') return '重新授权成功'
  if (value === 'failed') return '重新授权失败'
  return ''
}

export const TableFilters = memo(function TableFilters(props: TableFiltersProps) {
  const [otherFiltersOpen, setOtherFiltersOpen] = useState(false)
  const otherFiltersRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!otherFiltersOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!otherFiltersRef.current?.contains(event.target as Node)) {
        setOtherFiltersOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [otherFiltersOpen])

  const activePresenceFilters = useMemo(
    () => [
      readPresenceSummary('2FA', props.twoFactorFilter),
      readPresenceSummary('头像', props.avatarFilter),
      readPresenceSummary('任务中', props.taskFilter),
      readPresenceSummary('用户名', props.usernameFilter),
      readReauthorizeSummary(props.reauthorizeFilter)
    ].filter(Boolean),
    [props.avatarFilter, props.reauthorizeFilter, props.taskFilter, props.twoFactorFilter, props.usernameFilter]
  )

  const presenceRows = [
    {
      key: 'twofa',
      label: '2FA',
      value: props.twoFactorFilter,
      onChange: props.onTwoFactorChange
    },
    {
      key: 'avatar',
      label: '头像',
      value: props.avatarFilter,
      onChange: props.onAvatarChange
    },
    {
      key: 'task',
      label: '任务中',
      value: props.taskFilter,
      onChange: props.onTaskChange
    },
    {
      key: 'username',
      label: '用户名',
      value: props.usernameFilter,
      onChange: props.onUsernameChange
    },
    {
      key: 'reauthorize',
      label: '重新授权',
      value: props.reauthorizeFilter,
      onChange: props.onReauthorizeChange,
      options: props.reauthorizeOptions
    }
  ]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full min-w-[180px] md:w-[220px] xl:w-[260px]">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="按手机号、用户名、userId、路径搜索"
          className={`h-11 w-full rounded-[12px] pl-11 pr-10 text-sm leading-none text-textMain ${SOFT_INPUT_CLASS}`}
        />
        {props.search ? (
          <button
            type="button"
            title="清空搜索"
            onClick={() => props.onSearchChange('')}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-textMuted transition hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="网络" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />

      <div className="relative" ref={otherFiltersRef}>
        <button
          type="button"
          onClick={() => setOtherFiltersOpen((value) => !value)}
          className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-[12px] border border-white/[0.06] bg-black/10 px-4 text-sm text-textMain transition hover:bg-hover"
        >
          <span>{activePresenceFilters.length > 0 ? `其他筛选（${activePresenceFilters.length}）` : '其他筛选'}</span>
          <ChevronDown size={15} className={`transition ${otherFiltersOpen ? 'rotate-180' : ''}`} />
        </button>

        {otherFiltersOpen ? (
          <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[280px] rounded-[14px] border border-white/8 bg-card p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">其他筛选</div>
                <div className="mt-1 text-xs text-textMuted">点哪个条件，账号列表就按哪个条件显示。</div>
              </div>
              {activePresenceFilters.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    props.onTwoFactorChange('all')
                    props.onAvatarChange('all')
                    props.onTaskChange('all')
                    props.onUsernameChange('all')
                    props.onReauthorizeChange('all')
                  }}
                  className="rounded-[8px] px-2.5 py-1 text-xs text-textMuted transition hover:bg-white/8 hover:text-white"
                >
                  清空
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {presenceRows.map((row) => (
                <div key={row.key} className="rounded-[12px] bg-panel/70 px-3 py-3">
                  <div className="mb-2 text-sm font-medium text-white">{row.label}</div>
                  {'options' in row ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => row.onChange('all')}
                        className={`rounded-[10px] px-3 py-1.5 text-sm transition ${row.value === 'all' ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
                      >
                        全部
                      </button>
                      {(row.options ?? []).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => row.onChange(option.value)}
                          className={`rounded-[10px] px-3 py-1.5 text-sm transition ${row.value === option.value ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => row.onChange('all')}
                        className={`rounded-[10px] px-3 py-1.5 text-sm transition ${row.value === 'all' ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        onClick={() => row.onChange('has')}
                        className={`rounded-[10px] px-3 py-1.5 text-sm transition ${row.value === 'has' ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
                      >
                        有
                      </button>
                      <button
                        type="button"
                        onClick={() => row.onChange('none')}
                        className={`rounded-[10px] px-3 py-1.5 text-sm transition ${row.value === 'none' ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
                      >
                        无
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {activePresenceFilters.length > 0 ? (
              <div className="mt-3 rounded-[12px] bg-panel px-3 py-2 text-xs text-textMuted">
                当前：<span className="text-white">{activePresenceFilters.join(' / ')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={props.onRefresh}
        className="inline-flex h-11 min-w-[96px] shrink-0 items-center justify-center gap-2 rounded-[12px] border border-white/[0.06] bg-black/10 px-5 text-sm font-medium text-textMain transition hover:bg-hover"
      >
        <RefreshCw size={16} />
        刷新
      </button>
    </div>
  )
})
