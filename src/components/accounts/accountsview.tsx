import { memo, useMemo } from 'react'
import { CheckCircle2, Download, Loader2, MonitorCog, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const { aliveCount, riskCount, checkedCount } = useMemo(() => {
    let alive = 0
    let risk = 0
    let checked = 0

    for (const item of accounts) {
      if (item.status === 'alive') alive += 1
      if (item.profileSource === 'login_check') checked += 1
      if (['banned', 'limited', 'temporary_limited', 'frozen', 'session_expired', 'not_logged_in', 'multi_ip', 'timeout'].includes(item.status)) {
        risk += 1
      }
    }

    return {
      aliveCount: alive,
      riskCount: risk,
      checkedCount: checked
    }
  }, [accounts])

  return (
    <GlassPanel className="bg-card">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs tracking-[0.24em] text-neonSoft">
            <Sparkles size={14} /> 企业数据表格
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">账号管理控制台</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
            基于现有账号管理页面增量接入检查引擎能力，保持 DataGrid 作为主界面，不重做页面、不替换模块结构。
          </p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-3 xl:max-w-[420px] xl:min-w-[360px] xl:self-start">
          <div className="flex min-h-[112px] flex-col justify-between rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><MonitorCog size={14} className="shrink-0" /> 存活</div>
            <div className="mt-3 text-3xl font-semibold text-white">{aliveCount}</div>
          </div>
          <div className="flex min-h-[112px] flex-col justify-between rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><ShieldCheck size={14} className="shrink-0" /> 风险</div>
            <div className="mt-3 text-3xl font-semibold text-white">{riskCount}</div>
          </div>
          <div className="flex min-h-[112px] flex-col justify-between rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Sparkles size={14} className="shrink-0" /> 已检测</div>
            <div className="mt-3 text-3xl font-semibold text-white">{checkedCount}</div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
})

export function AccountsView() {
  const importProgress = useAccountStore((state) => state.importProgress)
  const importResultDialog = useAccountStore((state) => state.importResultDialog)
  const exportResultDialog = useAccountStore((state) => state.exportResultDialog)
  const deleteResultDialog = useAccountStore((state) => state.deleteResultDialog)
  const checkResultDialog = useAccountStore((state) => state.checkResultDialog)
  const closeImportResultDialog = useAccountStore((state) => state.closeImportResultDialog)
  const closeExportResultDialog = useAccountStore((state) => state.closeExportResultDialog)
  const closeDeleteResultDialog = useAccountStore((state) => state.closeDeleteResultDialog)
  const closeCheckResultDialog = useAccountStore((state) => state.closeCheckResultDialog)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)

  const showImportProgressDialog = Boolean(importProgress && importProgress.phase !== 'completed')
  const showImportResultDialog = importResultDialog.open
  const showExportResultDialog = exportResultDialog.open
  const showDeleteResultDialog = deleteResultDialog.open
  const showCheckResultDialog = checkResultDialog.open

  return (
    <div className="space-y-5 contain-layout">
      <AccountsSummary />

      {!showImportResultDialog && !showExportResultDialog && !showDeleteResultDialog && !showCheckResultDialog && lastActionMessage ? (
        <GlassPanel className="bg-card py-0">
          <div className="text-sm font-medium text-white">{lastActionMessage}</div>
          {errorMessage ? <div className="mt-1 text-sm text-amber-300">{errorMessage}</div> : null}
        </GlassPanel>
      ) : null}

      <AccountTable />

      {showImportProgressDialog && importProgress ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4">
          <div className="w-full max-w-[420px] rounded-[20px] border border-neon/20 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]">
            <div className="border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-neon/10 text-neonSoft">
                  <Upload size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">正在导入账号</div>
                  <div className="mt-1 text-xs text-slate-300">请稍等，正在处理你刚导入的账号文件</div>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-white">
                  <Loader2 size={16} className="animate-spin text-neonSoft" />
                  <span>{importProgress.message}</span>
                </div>
                <div className="font-medium text-neonSoft">{importProgress.current} / {importProgress.total}</div>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-neonSoft transition-all duration-300"
                  style={{ width: `${importProgress.total > 0 ? Math.min((importProgress.current / importProgress.total) * 100, 100) : 0}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-[12px] bg-panel px-3 py-3">
                  <div className="text-xs text-textMuted">已导入</div>
                  <div className="mt-1 font-semibold text-white">{importProgress.importedCount}</div>
                </div>
                <div className="rounded-[12px] bg-panel px-3 py-3">
                  <div className="text-xs text-textMuted">补 JSON</div>
                  <div className="mt-1 font-semibold text-white">{importProgress.generatedJsonCount}</div>
                </div>
                <div className="rounded-[12px] bg-panel px-3 py-3">
                  <div className="text-xs text-textMuted">跳过</div>
                  <div className="mt-1 font-semibold text-white">{importProgress.skippedCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showImportResultDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4" onClick={closeImportResultDialog}>
          <div className="w-full max-w-[420px] rounded-[20px] border border-emerald-400/20 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-emerald-400/10 text-emerald-300">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">导入完成</div>
                  <div className="mt-1 text-xs text-slate-300">本次导入结果如下</div>
                </div>
              </div>

              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={closeImportResultDialog}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[16px] bg-emerald-400/10 px-4 py-4 text-center">
                <div className="text-xs tracking-[0.18em] text-emerald-200/80">导入结果</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">本次成功导入 {importResultDialog.importedCount} 个</div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                  <div className="text-xs text-slate-500">扫描到</div>
                  <div className="mt-1 font-semibold text-slate-900">{importResultDialog.scannedCount}</div>
                </div>
                <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                  <div className="text-xs text-slate-500">补 JSON</div>
                  <div className="mt-1 font-semibold text-slate-900">{importResultDialog.generatedJsonCount}</div>
                </div>
                <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                  <div className="text-xs text-slate-500">跳过</div>
                  <div className="mt-1 font-semibold text-slate-900">{importResultDialog.skippedCount}</div>
                </div>
              </div>

              {importResultDialog.warning ? (
                <div className="rounded-[12px] border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-200">
                  {importResultDialog.warning}
                </div>
              ) : null}

              <button
                type="button"
                onClick={closeImportResultDialog}
                className="h-11 w-full rounded-[12px] bg-emerald-400/12 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/16"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showExportResultDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4" onClick={closeExportResultDialog}>
          <div className="w-full max-w-[460px] rounded-[20px] border border-sky-400/20 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-sky-400/10 text-sky-300">
                  <Download size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">导出完成</div>
                  <div className="mt-1 text-xs text-slate-300">导出的账号已从当前列表移出</div>
                </div>
              </div>

              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={closeExportResultDialog}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[16px] bg-sky-400/10 px-4 py-4 text-center">
                <div className="text-xs tracking-[0.18em] text-sky-200/80">导出结果</div>
                <div className="mt-2 text-2xl font-semibold text-sky-300">本次成功导出 {exportResultDialog.exportedCount} 个</div>
              </div>

              <div className="rounded-[12px] bg-panel px-4 py-4 text-sm">
                <div className="text-xs text-textMuted">导出目录</div>
                <div className="mt-2 break-all font-medium text-white">{exportResultDialog.targetDirectory}</div>
              </div>

              <div className="rounded-[12px] border border-sky-300/15 bg-sky-300/8 px-4 py-3 text-sm text-sky-100">
                已导出的账号文件已移动到目标目录，当前账号列表不再显示这些账号。
              </div>

              <button
                type="button"
                onClick={closeExportResultDialog}
                className="h-11 w-full rounded-[12px] bg-sky-400/12 text-sm font-medium text-sky-300 transition hover:bg-sky-400/16"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteResultDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4" onClick={closeDeleteResultDialog}>
          <div className="w-full max-w-[420px] rounded-[20px] border border-rose-400/20 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-rose-400/10 text-rose-300">
                  <Trash2 size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">删除完成</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {deleteResultDialog.mode === 'all' ? '当前账号已全部清空' : '已删除所选账号'}
                  </div>
                </div>
              </div>

              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={closeDeleteResultDialog}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[16px] bg-rose-400/10 px-4 py-4 text-center">
                <div className="text-xs tracking-[0.18em] text-rose-200/80">删除结果</div>
                <div className="mt-2 text-2xl font-semibold text-rose-300">
                  {deleteResultDialog.mode === 'all' ? '本次已全部删除' : `本次成功删除 ${deleteResultDialog.deletedCount} 个`}
                </div>
              </div>

              <div className="rounded-[12px] bg-panel px-4 py-4 text-sm text-white">
                <div className="text-xs text-textMuted">删除数量</div>
                <div className="mt-2 text-lg font-semibold">{deleteResultDialog.deletedCount}</div>
              </div>

              <button
                type="button"
                onClick={closeDeleteResultDialog}
                className="h-11 w-full rounded-[12px] bg-rose-400/12 text-sm font-medium text-rose-300 transition hover:bg-rose-400/16"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCheckResultDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/58 px-4" onClick={closeCheckResultDialog}>
          <div className="w-full max-w-[440px] rounded-[20px] border border-violet-400/20 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-violet-400/10 text-violet-300">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">检查完成</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {checkResultDialog.runMode === 'account-survival' ? '本次存活检测结果如下' : '本次账号状态检测结果如下'}
                  </div>
                </div>
              </div>

              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={closeCheckResultDialog}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[16px] bg-violet-400/10 px-4 py-4 text-center">
                <div className="text-xs tracking-[0.18em] text-violet-200/80">检查结果</div>
                <div className="mt-2 text-2xl font-semibold text-violet-300">本次检测 {checkResultDialog.total}</div>
              </div>

              {checkResultDialog.runMode === 'account-survival' ? (
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">存活</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.alive}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">封禁</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.banned}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">冻结</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.frozen}</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-3">
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">无限制</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.alive}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">双向</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.limited}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">临时双向</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.temporaryLimited}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                    <div className="text-xs text-slate-500">冻结</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.frozen}</div>
                  </div>
                  <div className="rounded-[12px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.18)] sm:col-span-2">
                    <div className="text-xs text-slate-500">封禁</div>
                    <div className="mt-1 font-semibold text-slate-900">{checkResultDialog.banned}</div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={closeCheckResultDialog}
                className="h-11 w-full rounded-[12px] bg-violet-400/12 text-sm font-medium text-violet-300 transition hover:bg-violet-400/16"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default memo(AccountsView)
