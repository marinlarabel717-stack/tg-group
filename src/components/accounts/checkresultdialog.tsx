import { memo } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useAccountStore } from '../../stores/accountstore'

export const CheckResultDialog = memo(function CheckResultDialog() {
  const checkResultDialog = useAccountStore((state) => state.checkResultDialog)
  const closeCheckResultDialog = useAccountStore((state) => state.closeCheckResultDialog)

  if (!checkResultDialog.open) {
    return null
  }

  return (
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
  )
})
