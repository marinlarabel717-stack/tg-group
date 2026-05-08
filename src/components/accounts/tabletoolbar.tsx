import { memo, type ReactNode } from 'react'
import {
  Download,
  FolderSearch2,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  WandSparkles,
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
  onStartCheck: () => void
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
  onStartCheck,
  onRefresh
}: TableToolbarProps) {
  const blocked = loading || busy

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
        <ActionButton label="批量检测" icon={<WandSparkles size={16} />} onClick={onStartCheck} disabled={blocked || selectedCount === 0} />
        <ActionButton label="删除所选" icon={<Trash2 size={16} />} onClick={onDeleteSelected} disabled={blocked || selectedCount === 0} />
        <ActionButton label="全部删除" icon={<Trash2 size={16} />} onClick={onDeleteAll} disabled={blocked || totalCount === 0} />
      </div>
    </div>
  )
})
