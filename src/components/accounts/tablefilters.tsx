import { memo, useMemo, useState } from 'react'
import { ChevronDown, Loader2, RefreshCcw, SlidersHorizontal, WandSparkles } from 'lucide-react'
import type { CheckAction } from '../../types'

interface FilterOption {
  label: string
  value: string
}

interface TableFiltersProps {
  countryFilter: string
  statusFilter: string
  sourceFilter: string
  proxyFilter: string
  selectedCount: number
  loading: boolean
  busy: boolean
  countries: FilterOption[]
  statuses: FilterOption[]
  sources: FilterOption[]
  proxies: FilterOption[]
  onCountryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSourceChange: (value: string) => void
  onProxyChange: (value: string) => void
  onStartCheck: (actions: CheckAction[]) => void
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
    <label className="flex min-w-[180px] flex-col gap-2">
      <span className="text-[11px] font-semibold tracking-[0.22em] text-textMuted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-[12px] bg-panel px-4 text-sm text-textMain outline-none transition focus:bg-hover"
      >
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export const TableFilters = memo(function TableFilters(props: TableFiltersProps) {
  const blocked = props.loading || props.busy
  const [checkMenuOpen, setCheckMenuOpen] = useState(false)

  const checkActions = useMemo(
    () => [
      { id: 'account-status' as const, label: '检测账号状态', description: '登录 + SpamBot + 资料回写', disabled: false },
      { id: 'account-survival' as const, label: '检查账号存活', description: '尝试把自动注销期限改成 24 个月，仅显示存活/封禁/多 IP/超时', disabled: false },
      { id: 'profile-refresh' as const, label: '资料补全', description: '后续添加', disabled: true },
      { id: 'proxy-health' as const, label: '代理连通性', description: '后续添加', disabled: true }
    ],
    []
  )

  const handleStartCheck = (actionId: CheckAction) => {
    const action = checkActions.find((item) => item.id === actionId)
    if (!action || action.disabled) return
    props.onStartCheck([actionId])
    setCheckMenuOpen(false)
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-[14px] bg-card px-5 py-5">
      <div className="mr-1 flex h-11 w-11 items-center justify-center rounded-[12px] bg-panel text-neonSoft">
        <SlidersHorizontal size={17} />
      </div>
      <FilterSelect label="国家" value={props.countryFilter} options={props.countries} onChange={props.onCountryChange} />
      <FilterSelect label="状态" value={props.statusFilter} options={props.statuses} onChange={props.onStatusChange} />
      <FilterSelect label="资料来源" value={props.sourceFilter} options={props.sources} onChange={props.onSourceChange} />
      <FilterSelect label="Proxy" value={props.proxyFilter} options={props.proxies} onChange={props.onProxyChange} />

      <div className="relative">
        <button
          onClick={() => setCheckMenuOpen((value) => !value)}
          disabled={blocked || props.selectedCount === 0}
          className="flex h-11 items-center gap-2 rounded-[12px] bg-neon/10 px-4 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <WandSparkles size={16} />
          检测菜单
          <ChevronDown size={15} className={`transition ${checkMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {checkMenuOpen ? (
          <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[280px] rounded-[14px] border border-white/8 bg-card p-3 shadow-2xl">
            <div className="mb-2 text-xs tracking-[0.2em] text-textMuted">点击后直接开始检测</div>
            <div className="space-y-2">
              {checkActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleStartCheck(action.id)}
                  disabled={action.disabled || blocked || props.selectedCount === 0}
                  className={`flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${action.disabled ? 'cursor-not-allowed bg-panel/40 opacity-45' : 'bg-panel hover:bg-hover'}`}
                >
                  <WandSparkles size={15} className="mt-0.5 shrink-0 text-neonSoft" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{action.label}</div>
                    <div className="mt-1 text-xs text-textMuted">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        onClick={props.onRefresh}
        disabled={props.busy}
        className="flex h-11 items-center gap-2 rounded-[12px] bg-neon/10 px-4 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
        刷新
      </button>
    </div>
  )
})
