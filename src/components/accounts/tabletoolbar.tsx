import { memo, useState, type ReactNode } from 'react'
import {
  CheckSquare,
  ChevronDown,
  Download,
  FolderSearch2,
  Search,
  SquareDashedMousePointer,
  Trash2,
  Upload,
  X
} from 'lucide-react'

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
  onSelectRange
}: TableToolbarProps) {
  const blocked = loading || busy
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)

  const handleRangeSelect = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    onSelectRange(start, end)
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
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton label="导入文件" icon={<Upload size={16} />} onClick={onImportFiles} disabled={blocked} />
        <ActionButton label="扫描文件夹" icon={<FolderSearch2 size={16} />} onClick={onImportFolder} disabled={blocked} />
        <ActionButton label="导出所选" icon={<Download size={16} />} onClick={onExportSelected} disabled={blocked || selectedCount === 0} />

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
