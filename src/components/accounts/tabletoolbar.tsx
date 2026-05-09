import { memo, useMemo, useState, type ReactNode } from 'react'
import {
  CheckSquare,
  ChevronDown,
  Download,
  FolderSearch2,
  Loader2,
  RefreshCcw,
  Search,
  SquareDashedMousePointer,
  Trash2,
  Upload,
  WandSparkles,
  X
} from 'lucide-react'
import type { CheckAction } from '../../types'

interface TableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  selectedCount: number
  totalCount: number
  loading: boolean
  busy: boolean
  onImportFiles: () => void
  onImportFolder: () => void
  onExportSelected: () => void
  onDeleteSelected: () => void
  onDeleteAll: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onSelectRange: (start: number, end: number) => void
  onStartCheck: (actions: CheckAction[]) => void
  onRefresh: () => void
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  emphasis = false
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  emphasis?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 items-center gap-2 rounded-[12px] px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        emphasis ? 'bg-neon/10 text-neonSoft hover:bg-neon/14' : 'bg-panel text-textMain hover:bg-hover'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export const TableToolbar = memo(function TableToolbar({
  search,
  onSearchChange,
  selectedCount,
  totalCount,
  loading,
  busy,
  onImportFiles,
  onImportFolder,
  onExportSelected,
  onDeleteSelected,
  onDeleteAll,
  onSelectAll,
  onClearSelection,
  onSelectRange,
  onStartCheck,
  onRefresh
}: TableToolbarProps) {
  const blocked = loading || busy
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const [checkMenuOpen, setCheckMenuOpen] = useState(false)
  const [selectedActions, setSelectedActions] = useState<CheckAction[]>(['account-status'])

  const checkActions = useMemo(
    () => [
      { id: 'account-status' as const, label: '检测账号状态', description: '登录 + SpamBot + 资料回写', disabled: false },
      { id: 'account-survival' as const, label: '检查账号存活', description: '尝试把自动注销期限改成 24 个月，仅显示存活/封禁/多 IP/超时', disabled: false },
      { id: 'profile-refresh' as const, label: '资料补全', description: '后续添加', disabled: true },
      { id: 'proxy-health' as const, label: '代理连通性', description: '后续添加', disabled: true }
    ],
    []
  )

  const handleRangeSelect = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    onSelectRange(start, end)
  }

  const toggleAction = (actionId: CheckAction) => {
    setSelectedActions((current) => (current.includes(actionId) ? current : [actionId]))
  }

  const handleStartCheck = () => {
    const enabledActions = selectedActions.filter((actionId) =>
      checkActions.some((item) => item.id === actionId && !item.disabled)
    )

    if (enabledActions.length === 0) return
    onStartCheck(enabledActions)
    setCheckMenuOpen(false)
  }

  return (
    <div className="space-y-4 rounded-[14px] bg-card px-5 py-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[320px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="按手机号、用户名、userId、路径搜索"
            className="h-11 w-full rounded-[12px] bg-panel pl-11 pr-10 text-sm text-textMain outline-none transition focus:bg-hover"
          />
          {search ? (
            <button
              title="清空搜索"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-textMuted transition hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 rounded-[12px] bg-panel px-4 py-3.5">
          <div>
            <div className="text-[11px] tracking-[0.2em] text-textMuted">批量统计</div>
            <div className="mt-1 text-sm font-medium text-white">
              已选 {selectedCount} 项 / 共 {totalCount} 行
            </div>
          </div>
        </div>

        <ActionButton
          label="刷新"
          icon={loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
          onClick={onRefresh}
          disabled={busy}
          emphasis
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton label="导入文件" icon={<Upload size={16} />} onClick={onImportFiles} disabled={blocked} />
        <ActionButton label="扫描文件夹" icon={<FolderSearch2 size={16} />} onClick={onImportFolder} disabled={blocked} />
        <ActionButton label="导出所选" icon={<Download size={16} />} onClick={onExportSelected} disabled={blocked || selectedCount === 0} />

        <div className="relative">
          <button
            onClick={() => setCheckMenuOpen((value) => !value)}
            disabled={blocked || selectedCount === 0}
            className="flex h-11 items-center gap-2 rounded-[12px] bg-neon/10 px-4 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <WandSparkles size={16} />
            批量检测
            <ChevronDown size={15} className={`transition ${checkMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {checkMenuOpen ? (
            <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[280px] rounded-[14px] border border-white/8 bg-card p-3 shadow-2xl">
              <div className="mb-2 text-xs tracking-[0.2em] text-textMuted">检测菜单</div>
              <div className="space-y-2">
                {checkActions.map((action) => {
                  const checked = selectedActions.includes(action.id)
                  return (
                    <button
                      key={action.id}
                      onClick={() => !action.disabled && toggleAction(action.id)}
                      disabled={action.disabled}
                      className={`flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${action.disabled ? 'cursor-not-allowed bg-panel/40 opacity-45' : 'bg-panel hover:bg-hover'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="mt-1 h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{action.label}</div>
                        <div className="mt-1 text-xs text-textMuted">{action.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={handleStartCheck}
                disabled={blocked || selectedCount === 0 || selectedActions.filter((actionId) => checkActions.some((item) => item.id === actionId && !item.disabled)).length === 0}
                className="mt-3 h-10 w-full rounded-[10px] bg-neon/10 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
              >
                开始执行
              </button>
            </div>
          ) : null}
        </div>

        <ActionButton label="删除所选" icon={<Trash2 size={16} />} onClick={onDeleteSelected} disabled={blocked || selectedCount === 0} />
        <ActionButton label="全选账号" icon={<CheckSquare size={16} />} onClick={onSelectAll} disabled={blocked || totalCount === 0} />
        <ActionButton label="取消选中" icon={<SquareDashedMousePointer size={16} />} onClick={onClearSelection} disabled={blocked || selectedCount === 0} />

        <div className="relative">
          <button
            onClick={() => setRangeMenuOpen((value) => !value)}
            disabled={blocked || totalCount === 0}
            className="flex h-11 items-center gap-2 rounded-[12px] bg-panel px-4 text-sm font-medium text-textMain transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckSquare size={16} />
            选择区间
            <ChevronDown size={15} className={`transition ${rangeMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {rangeMenuOpen ? (
            <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[240px] rounded-[14px] border border-white/8 bg-card p-3 shadow-2xl">
              <div className="mb-2 text-xs tracking-[0.2em] text-textMuted">选择区间号</div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))}
                  className="h-10 w-full rounded-[10px] bg-panel px-3 text-sm text-white outline-none transition focus:bg-hover"
                />
                <span className="text-sm text-textMuted">-</span>
                <input
                  inputMode="numeric"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))}
                  className="h-10 w-full rounded-[10px] bg-panel px-3 text-sm text-white outline-none transition focus:bg-hover"
                />
              </div>
              <button
                onClick={() => {
                  handleRangeSelect()
                  setRangeMenuOpen(false)
                }}
                disabled={blocked || totalCount === 0}
                className="mt-3 h-10 w-full rounded-[10px] bg-neon/10 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
              >
                应用区间
              </button>
            </div>
          ) : null}
        </div>

        <ActionButton label="全部删除" icon={<Trash2 size={16} />} onClick={onDeleteAll} disabled={blocked || totalCount === 0} />
      </div>
    </div>
  )
})
