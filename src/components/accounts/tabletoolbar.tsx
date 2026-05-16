import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CheckSquare,
  ChevronDown,
  Download,
  FolderSearch2,
  Loader2,
  SquareDashedMousePointer,
  Trash2,
  Upload
} from 'lucide-react'
import type { ImportProgressPayload } from '../../types'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

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
  importProgress: ImportProgressPayload | null
  importResultOpen: boolean
  lastActionMessage: string
  errorMessage: string
  onImportFiles: () => Promise<void> | void
  onImportFolder: () => Promise<void> | void
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
  importProgress,
  importResultOpen,
  lastActionMessage,
  errorMessage,
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPickerHint, setImportPickerHint] = useState('')
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

  useEffect(() => {
    if (importResultOpen) {
      setImportDialogOpen(false)
      setImportPickerHint('')
    }
  }, [importResultOpen])

  useEffect(() => {
    if (importProgress?.mode === 'import' && importProgress.phase !== 'completed') {
      setImportDialogOpen(true)
      setImportPickerHint('')
    }
  }, [importProgress])

  const handleRangeSelect = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    onSelectRange(start, end)
  }

  const handleImportAction = async (action: () => Promise<void> | void, hint: string) => {
    setImportDialogOpen(true)
    setImportPickerHint(hint)
    await action()
  }

  const importRunning = importProgress?.mode === 'import' && importProgress.phase !== 'completed'
  const importPercent = importRunning && importProgress.total > 0
    ? Math.min((importProgress.current / importProgress.total) * 100, 100)
    : 0

  return (
    <div className="rounded-[14px] bg-card px-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton label="导入账号" icon={<Upload size={16} />} onClick={() => {
          setImportDialogOpen(true)
          setImportPickerHint('')
        }} disabled={blocked} emphasis />
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

      <ResultDialogShell
        open={importDialogOpen}
        onClose={() => {
          if (importRunning) return
          setImportDialogOpen(false)
          setImportPickerHint('')
        }}
        title="导入账号"
        subtitle={importRunning ? '导入过程中这里会持续显示实时进度' : '先选导入方式，再开始导入账号'}
        icon={<Upload size={18} />}
        tone="violet"
        maxWidth="max-w-[420px]"
        closable={!importRunning}
      >
        {importRunning && importProgress ? (
          <>
            <ResultHero label="当前进度" value={`${importProgress.current} / ${importProgress.total}`} tone="violet" />

            <div className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-white">
                <Loader2 size={16} className="animate-spin text-violet-300" />
                <span>{importProgress.message || '正在处理...'}</span>
              </div>
              <div className="font-medium text-violet-300">{`${importProgress.current} / ${importProgress.total}`}</div>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full bg-violet-300 transition-all duration-300" style={{ width: `${importPercent}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <ResultStatCard label="已导入" value={importProgress.importedCount} tone="success" />
              <ResultStatCard label="补 JSON" value={importProgress.generatedJsonCount} tone="violet" />
              <ResultStatCard label="跳过" value={importProgress.skippedCount} tone="warning" />
            </div>
          </>
        ) : (
          <>
            <ResultHero label="导入方式" value="选择后立即开始" tone="violet" />

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => void handleImportAction(onImportFiles, '已打开文件选择窗口，选完后这里会继续显示导入进度。')}
                disabled={blocked}
                className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-violet-400/12 text-sm font-medium text-violet-100 transition hover:bg-violet-400/16 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Upload size={16} />
                导入文件
              </button>
              <button
                type="button"
                onClick={() => void handleImportAction(onImportFolder, '已打开文件夹选择窗口，选完后这里会继续显示导入进度。')}
                disabled={blocked}
                className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-panel text-sm font-medium text-white transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderSearch2 size={16} />
                扫描文件夹
              </button>
            </div>

            {importPickerHint ? (
              <div className="rounded-[12px] border border-violet-300/15 bg-violet-300/8 px-4 py-3 text-sm text-violet-100">
                {importPickerHint}
              </div>
            ) : lastActionMessage ? (
              <div className="rounded-[12px] border border-white/10 bg-panel px-4 py-3 text-sm text-slate-200">
                {lastActionMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-[12px] border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-200">
                {errorMessage}
              </div>
            ) : null}

            <ResultPrimaryButton
              label="先不导入"
              onClick={() => {
                setImportDialogOpen(false)
                setImportPickerHint('')
              }}
              tone="violet"
            />
          </>
        )}
      </ResultDialogShell>
    </div>
  )
})
