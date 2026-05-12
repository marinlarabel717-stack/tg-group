import { memo } from 'react'
import { CheckCircle2, Download, Loader2, Trash2, Upload } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { CheckResultDialog } from './checkresultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

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
        title="正在导入账号"
        subtitle="请稍等，正在处理你刚导入的账号文件"
        icon={<Upload size={18} />}
        tone="violet"
        maxWidth="max-w-[420px]"
        closable={false}
      >
        <ResultHero
          label="当前进度"
          value={importProgress ? `${importProgress.current} / ${importProgress.total}` : '0 / 0'}
          tone="violet"
        />

        <div className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-white">
            <Loader2 size={16} className="animate-spin text-violet-300" />
            <span>{importProgress?.message || '正在处理...'}</span>
          </div>
          <div className="font-medium text-violet-300">
            {importProgress ? `${importProgress.current} / ${importProgress.total}` : '0 / 0'}
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-panel">
          <div
            className="h-full rounded-full bg-violet-300 transition-all duration-300"
            style={{ width: `${importProgress && importProgress.total > 0 ? Math.min((importProgress.current / importProgress.total) * 100, 100) : 0}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <ResultStatCard label="已导入" value={importProgress?.importedCount ?? 0} tone="success" />
          <ResultStatCard label="补 JSON" value={importProgress?.generatedJsonCount ?? 0} tone="violet" />
          <ResultStatCard label="跳过" value={importProgress?.skippedCount ?? 0} tone="warning" />
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
        subtitle={deleteResultDialog.mode === 'all' ? '当前账号已全部清空' : '已删除所选账号'}
        icon={<Trash2 size={18} />}
        tone="danger"
        maxWidth="max-w-[420px]"
      >
        <ResultHero
          label="删除结果"
          value={deleteResultDialog.mode === 'all' ? '本次已全部删除' : `本次成功删除 ${deleteResultDialog.deletedCount} 个`}
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
