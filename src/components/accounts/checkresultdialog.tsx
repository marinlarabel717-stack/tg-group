import { memo } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useAccountStore } from '../../stores/accountstore'

function ResultStatCard({
  label,
  value,
  tone,
  wide = false
}: {
  label: string
  value: number
  tone: 'success' | 'info' | 'warning' | 'danger' | 'violet'
  wide?: boolean
}) {
  const toneClass = {
    success: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-100',
    info: 'border-sky-400/20 bg-sky-400/12 text-sky-100',
    warning: 'border-amber-400/20 bg-amber-400/12 text-amber-100',
    danger: 'border-rose-400/20 bg-rose-400/12 text-rose-100',
    violet: 'border-violet-400/20 bg-violet-400/12 text-violet-100'
  }[tone]

  const valueClass = {
    success: 'text-emerald-300',
    info: 'text-sky-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300',
    violet: 'text-violet-300'
  }[tone]

  return (
    <div className={`rounded-[14px] border px-3 py-3 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)] ${toneClass} ${wide ? 'sm:col-span-2' : ''}`}>
      <div className="text-xs tracking-[0.08em] opacity-85">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

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
              <ResultStatCard label="存活" value={checkResultDialog.alive} tone="success" />
              <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" />
              <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="info" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-3">
              <ResultStatCard label="无限制" value={checkResultDialog.alive} tone="success" />
              <ResultStatCard label="双向" value={checkResultDialog.limited} tone="info" />
              <ResultStatCard label="临时双向" value={checkResultDialog.temporaryLimited} tone="warning" />
              <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="violet" />
              <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" wide />
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
