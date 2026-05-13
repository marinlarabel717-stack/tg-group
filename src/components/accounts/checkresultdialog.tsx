import { memo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useAccountStore } from '../../stores/accountstore'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

export const CheckResultDialog = memo(function CheckResultDialog() {
  const checkResultDialog = useAccountStore((state) => state.checkResultDialog)
  const closeCheckResultDialog = useAccountStore((state) => state.closeCheckResultDialog)

  if (!checkResultDialog.open) {
    return null
  }

  return (
    <ResultDialogShell
      open={checkResultDialog.open}
      onClose={closeCheckResultDialog}
      title="检查完成"
      subtitle={checkResultDialog.runMode === 'account-survival' ? '本次存活检测结果如下' : '本次账号状态检测结果如下'}
      icon={<CheckCircle2 size={18} />}
      tone="violet"
      maxWidth="max-w-[440px]"
    >
      <ResultHero label="检查结果" value={`本次检测 ${checkResultDialog.total}`} tone="violet" />

      {checkResultDialog.runMode === 'account-survival' ? (
        <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-3">
          <ResultStatCard label="存活" value={checkResultDialog.alive} tone="success" />
          <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" />
          <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="info" />
          <ResultStatCard label="超时" value={checkResultDialog.timeout} tone="violet" />
          <ResultStatCard label="未知" value={checkResultDialog.unknown} tone="neutral" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-3">
          <ResultStatCard label="无限制" value={checkResultDialog.alive} tone="success" />
          <ResultStatCard label="双向" value={checkResultDialog.limited} tone="info" />
          <ResultStatCard label="临时双向" value={checkResultDialog.temporaryLimited} tone="warning" />
          <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="violet" />
          <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" />
          <ResultStatCard label="超时" value={checkResultDialog.timeout} tone="violet" />
          <ResultStatCard label="未知" value={checkResultDialog.unknown} tone="neutral" />
        </div>
      )}

      <ResultPrimaryButton label="知道了" onClick={closeCheckResultDialog} tone="violet" />
    </ResultDialogShell>
  )
})
