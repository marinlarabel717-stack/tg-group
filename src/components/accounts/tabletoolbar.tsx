import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CheckSquare,
  ChevronDown,
  Download,
  FolderSearch2,
  SquareDashedMousePointer,
  Trash2,
  Upload
} from 'lucide-react'

interface TableToolbarProps {
  selectedCount: number
  totalCount: number
  deletePresetCounts: {
    flagged: number
    banned: number
    frozen: number
    multiIp: number
  }
  loading: boolean
  busy: boolean
  onImportFiles: () => void
  onImportFolder: () => void
  onExportSelected: () => void
  onDeleteSelected: () => void
  onDeleteAll: () => void
  onDeleteFlagged: () => void
  onDeleteBanned: () => void
  onDeleteFrozen: () => void
  onDeleteMultiIp: () => void
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
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-[12px] px-4 text-sm font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 ${
        emphasis ? 'bg-neon/10 text-neonSoft hover:bg-neon/14' : 'bg-panel text-textMain hover:bg-hover'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export const TableToolbar = memo(function TableToolbar({
  selectedCount,
  totalCount,
  deletePresetCounts,
  loading,
  busy,
  onImportFiles,
  onImportFolder,
  onExportSelected,
  onDeleteSelected,
  onDeleteAll,
  onDeleteFlagged,
  onDeleteBanned,
  onDeleteFrozen,
  onDeleteMultiIp,
  onSelectAll,
  onClearSelection,
  onSelectRange
}: TableToolbarProps) {
  const blocked = loading || busy
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false)
  const deleteMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!deleteMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (deleteMenuRef.current?.contains(target)) return
      setDeleteMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [deleteMenuOpen])

  const handleRangeSelect = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    onSelectRange(start, end)
  }

  return (
    <div className="rounded-[14px] bg-card px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton label="导入文件" icon={<Upload size={16} />} onClick={onImportFiles} disabled={blocked} />
        <ActionButton label="扫描文件夹" icon={<FolderSearch2 size={16} />} onClick={onImportFolder} disabled={blocked} />
        <ActionButton label="导出所选" icon={<Download size={16} />} onClick={onExportSelected} disabled={blocked || selectedCount === 0} />

        <ActionButton label="删除所选" icon={<Trash2 size={16} />} onClick={onDeleteSelected} disabled={blocked || selectedCount === 0} />
        <ActionButton label="全选账号" icon={<CheckSquare size={16} />} onClick={onSelectAll} disabled={blocked || totalCount === 0} />
        <ActionButton label="取消选中" icon={<SquareDashedMousePointer size={16} />} onClick={onClearSelection} disabled={blocked || selectedCount === 0} />

        <div className="relative shrink-0">
          <button
            onClick={() => setRangeMenuOpen((value) => !value)}
            disabled={blocked || totalCount === 0}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-[12px] bg-panel px-4 text-sm font-medium whitespace-nowrap text-textMain transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckSquare size={16} className="shrink-0" />
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

        <div className="relative shrink-0" ref={deleteMenuRef}>
          <button
            onClick={() => setDeleteMenuOpen((value) => !value)}
            disabled={blocked || totalCount === 0}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-[12px] bg-panel px-4 text-sm font-medium whitespace-nowrap text-textMain transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={16} className="shrink-0" />
            全部删除
            <ChevronDown size={15} className={`transition ${deleteMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {deleteMenuOpen ? (
            <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[260px] rounded-[14px] border border-white/8 bg-card p-2 shadow-2xl">
              {[
                { label: '全部删除 /封禁/冻结/多ip/失效的', onClick: onDeleteFlagged, disabled: deletePresetCounts.flagged === 0 },
                { label: '全部删除封禁', onClick: onDeleteBanned, disabled: deletePresetCounts.banned === 0 },
                { label: '全部删除冻结', onClick: onDeleteFrozen, disabled: deletePresetCounts.frozen === 0 },
                { label: '全部删除多ip', onClick: onDeleteMultiIp, disabled: deletePresetCounts.multiIp === 0 },
                { label: '全部删除', onClick: onDeleteAll, disabled: totalCount === 0 }
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    item.onClick()
                    setDeleteMenuOpen(false)
                  }}
                  disabled={blocked || item.disabled}
                  className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-sm text-textMain transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})
