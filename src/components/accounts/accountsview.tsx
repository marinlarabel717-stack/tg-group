import { memo } from 'react'
import { CheckCircle2, Download, Loader2, Trash2, Upload } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { CheckResultDialog } from './checkresultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

function readDeleteDialogSubtitle(mode: 'selected' | 'all' | 'flagged' | 'banned' | 'frozen' | 'multi_ip') {
  if (mode === 'all') return '当前账号已全部清空'
  if (mode === 'selected') return '已删除所选账号'
  if (mode === 'flagged') return '已删除封禁 / 冻结 / 多 IP / 失效账号'
  if (mode === 'banned') return '已删除封禁账号'
  if (mode === 'frozen') return '已删除冻结账号'
  return '已删除多 IP 账号'
}

function readDeleteHeroValue(mode: 'selected' | 'all' | 'flagged' | 'banned' | 'frozen' | 'multi_ip', deletedCount: number) {
  if (mode === 'all') return '本次已全部删除'
  return `本次成功删除 ${deletedCount} 个`
}

export function AccountsView() {
  const importProgress = useAccountStore((state) => state.importProgress)
  const importResultDialog = useAccountStore((state) => state.importResultDialog)
  const exportResultDialog = useAccountStore((state) => state.exportResultDialog)
  const deleteResultDialog = useAccountStore((state) => state.deleteResultDialog)
  const checkResultDialog = useAccountStore((state) => state.checkResultDialog)
  const closeImportResultDialog = useAccountStore((state) => state.closeImportResultDialog)
  const closeExportResultDialog = useAccountStore((state) => state.closeExportResultDialog)
  const closeDeleteResultDialog = useAccountStore((state) => state.closeDeleteResultDialog)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)

  const showImportProgressDialog = Boolean(importProgress && importProgress.phase !== 'completed')
  const showImportResultDialog = importResultDialog.open
  const showExportResultDialog = exportResultDialog.open
  const showDeleteResultDialog = deleteResultDialog.open
  const showCheckResultDialog = checkResultDialog.open
  const progressMode = importProgress?.mode === 'export' ? 'export' : importProgress?.mode === 'delete' ? 'delete' : 'import'
  const progressTitle = progressMode === 'export' ? '正在导出账号' : progressMode === 'delete' ? '正在删除账号' : '正在导入账号'
  const progressSubtitle = progressMode === 'export'
    ? '请稍等，正在整理并移动你选中的账号文件'
    : progressMode === 'delete'
      ? '请稍等，正在逐步删除你选中的账号文件和记录'
      : '请稍等，正在处理你刚导入的账号文件'
  const progressHeroLabel = progressMode === 'export' ? '导出进度' : progressMode === 'delete' ? '删除进度' : '当前进度'
  const progressHeroTone = progressMode === 'export' ? 'info' : progressMode === 'delete' ? 'danger' : 'violet'
  const progressPrimaryCountLabel = progressMode === 'export' ? '已导出' : progressMode === 'delete' ? '已删除' : '已导入'
  const progressSecondaryCountLabel = progressMode === 'export' ? '剩余' : progressMode === 'delete' ? '剩余' : '补 JSON'
  const progressSecondaryCount = progressMode === 'export' || progressMode === 'delete'
    ? Math.max((importProgress?.total ?? 0) - (importProgress?.current ?? 0), 0)
    : (importProgress?.generatedJsonCount ?? 0)
  const progressThirdCountLabel = progressMode === 'export' || progressMode === 'delete' ? '总数量' : '跳过'
  const progressThirdCount = progressMode === 'export' || progressMode === 'delete' ? (importProgress?.total ?? 0) : (importProgress?.skippedCount ?? 0)

  return (
    <div className="space-y-5 contain-layout">
      {!showImportResultDialog && !showExportResultDialog && !showDeleteResultDialog && !showCheckResultDialog && lastActionMessage ? (
        <GlassPanel className="bg-card py-0">
          <div className="text-sm font-medium text-white">{lastActionMessage}</div>
          {errorMessage ? <div className="mt-1 text-sm text-amber-300">{errorMessage}</div> : null}
        </GlassPanel>
      ) : null}

      <AccountTable />

      <ResultDialogShell
        open={showImportProgressDialog && Boolean(importProgress)}
        onClose={() => {}}
        title={progressTitle}
        subtitle={progressSubtitle}
        icon={progressMode === 'export' ? <Download size={18} /> : progressMode === 'delete' ? <Trash2 size={18} /> : <Upload size={18} />}
        tone={progressHeroTone}
        maxWidth="max-w-[420px]"
        closable={false}
      >
        <ResultHero
          label={progressHeroLabel}
          value={importProgress ? `${importProgress.current} / ${importProgress.total}` : '0 / 0'}
          tone={progressHeroTone}
        />

        <div className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-white">
            <Loader2 size={16} className={`animate-spin ${progressMode === 'export' ? 'text-sky-300' : progressMode === 'delete' ? 'text-rose-300' : 'text-violet-300'}`} />
            <span>{importProgress?.message || '正在处理...'}</span>
          </div>
          <div className={`font-medium ${progressMode === 'export' ? 'text-sky-300' : progressMode === 'delete' ? 'text-rose-300' : 'text-violet-300'}`}>
            {importProgress ? `${importProgress.current} / ${importProgress.total}` : '0 / 0'}
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-panel">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progressMode === 'export' ? 'bg-sky-300' : progressMode === 'delete' ? 'bg-rose-300' : 'bg-violet-300'}`}
            style={{ width: `${importProgress && importProgress.total > 0 ? Math.min((importProgress.current / importProgress.total) * 100, 100) : 0}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <ResultStatCard label={progressPrimaryCountLabel} value={importProgress?.importedCount ?? 0} tone={progressMode === 'export' ? 'info' : progressMode === 'delete' ? 'danger' : 'success'} />
          <ResultStatCard label={progressSecondaryCountLabel} value={progressSecondaryCount} tone={progressMode === 'export' ? 'warning' : progressMode === 'delete' ? 'warning' : 'violet'} />
          <ResultStatCard label={progressThirdCountLabel} value={progressThirdCount} tone={progressMode === 'export' ? 'neutral' : progressMode === 'delete' ? 'neutral' : 'warning'} />
        </div>
      </ResultDialogShell>

      <ResultDialogShell
        open={showImportResultDialog}
        onClose={closeImportResultDialog}
        title="导入完成"
        subtitle="本次导入结果如下"
        icon={<CheckCircle2 size={18} />}
        tone="success"
        maxWidth="max-w-[420px]"
      >
        <ResultHero label="导入结果" value={`本次成功导入 ${importResultDialog.importedCount} 个`} tone="success" />

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <ResultStatCard label="扫描到" value={importResultDialog.scannedCount} tone="info" />
          <ResultStatCard label="补 JSON" value={importResultDialog.generatedJsonCount} tone="violet" />
          <ResultStatCard label="跳过" value={importResultDialog.skippedCount} tone="warning" />
        </div>

        {importResultDialog.warning ? (
          <div className="rounded-[12px] border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-200">
            {importResultDialog.warning}
          </div>
        ) : null}

        <ResultPrimaryButton label="知道了" onClick={closeImportResultDialog} tone="success" />
      </ResultDialogShell>

      <ResultDialogShell
        open={showExportResultDialog}
        onClose={closeExportResultDialog}
        title="导出完成"
        subtitle="导出的账号已从当前列表移出"
        icon={<Download size={18} />}
        tone="info"
        maxWidth="max-w-[460px]"
      >
        <ResultHero label="导出结果" value={`本次成功导出 ${exportResultDialog.exportedCount} 个`} tone="info" />

        <div className="grid grid-cols-1 gap-3 text-center text-sm">
          <ResultStatCard label="导出数量" value={exportResultDialog.exportedCount} tone="info" />
          <ResultStatCard label="导出目录" value={exportResultDialog.targetDirectory} tone="neutral" wide />
        </div>

        <div className="rounded-[12px] border border-sky-300/15 bg-sky-300/8 px-4 py-3 text-sm text-sky-100">
          已导出的账号文件已移动到目标目录，当前账号列表不再显示这些账号。
        </div>

        <ResultPrimaryButton label="知道了" onClick={closeExportResultDialog} tone="info" />
      </ResultDialogShell>

      <ResultDialogShell
        open={showDeleteResultDialog}
        onClose={closeDeleteResultDialog}
        title="删除完成"
        subtitle={readDeleteDialogSubtitle(deleteResultDialog.mode)}
        icon={<Trash2 size={18} />}
        tone="danger"
        maxWidth="max-w-[420px]"
      >
        <ResultHero
          label="删除结果"
          value={readDeleteHeroValue(deleteResultDialog.mode, deleteResultDialog.deletedCount)}
          tone="danger"
        />

        <div className="grid grid-cols-1 gap-3 text-center text-sm">
          <ResultStatCard label="删除数量" value={deleteResultDialog.deletedCount} tone="danger" />
        </div>

        <ResultPrimaryButton label="知道了" onClick={closeDeleteResultDialog} tone="danger" />
      </ResultDialogShell>

      <CheckResultDialog />
    </div>
  )
}

export default memo(AccountsView)
