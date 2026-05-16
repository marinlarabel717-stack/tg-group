import { memo, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useAccountStore } from '../../stores/accountstore'
import { formatDateTimeFull } from '../../lib/ui-text'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

export const CheckResultDialog = memo(function CheckResultDialog() {
  const checkResultDialog = useAccountStore((state) => state.checkResultDialog)
  const checkState = useAccountStore((state) => state.checkState)
  const accounts = useAccountStore((state) => state.accounts)
  const closeCheckResultDialog = useAccountStore((state) => state.closeCheckResultDialog)

  const frozenDetails = useMemo(() => {
    const seen = new Set<number>()
    const rows: Array<{ id: number; phone: string; freezeSinceDisplay: string; freezeUntilDisplay: string }> = []

    for (const log of checkState.logs) {
      if (log.status !== 'frozen' || typeof log.accountId !== 'number' || seen.has(log.accountId)) continue
      seen.add(log.accountId)
      const account = accounts.find((item) => item.id === log.accountId)
      const freezeSinceRaw = account?.profile?.freeze_since_date
      const freezeUntilRaw = account?.profile?.freeze_until_date
      const freezeSince = formatDateTimeFull(typeof freezeSinceRaw === 'number' ? new Date(freezeSinceRaw).toISOString() : freezeSinceRaw ?? null)
      const freezeUntil = formatDateTimeFull(typeof freezeUntilRaw === 'number' ? new Date(freezeUntilRaw).toISOString() : freezeUntilRaw ?? null)
      rows.push({
        id: log.accountId,
        phone: account?.phone || log.phone || `账号#${log.accountId}`,
        freezeSinceDisplay: freezeSince !== '—' ? freezeSince : 'Telegram 暂未返回冻结开始时间',
        freezeUntilDisplay: freezeUntil !== '—' ? freezeUntil : 'Telegram 暂未返回冻结结束时间'
      })
    }

    return rows
  }, [accounts, checkState.logs])

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
          <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="cyan" />
          <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" />
          <ResultStatCard label="多 IP 登录" value={checkResultDialog.multiIp} tone="indigo" />
          <ResultStatCard label="超时" value={checkResultDialog.timeout} tone="violet" />
          <ResultStatCard label="地理位置限制" value={checkResultDialog.geoRestricted} tone="warning" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-3 xl:grid-cols-4">
          <ResultStatCard label="无限制" value={checkResultDialog.alive} tone="success" />
          <ResultStatCard label="双向" value={checkResultDialog.limited} tone="info" />
          <ResultStatCard label="临时双向" value={checkResultDialog.temporaryLimited} tone="orange" />
          <ResultStatCard label="地理位置限制" value={checkResultDialog.geoRestricted} tone="warning" />
          <ResultStatCard label="冻结" value={checkResultDialog.frozen} tone="cyan" />
          <ResultStatCard label="封禁" value={checkResultDialog.banned} tone="danger" />
          <ResultStatCard label="多 IP 登录" value={checkResultDialog.multiIp} tone="indigo" />
          <ResultStatCard label="超时" value={checkResultDialog.timeout} tone="violet" />
        </div>
      )}

      {frozenDetails.length > 0 ? (
        <div className="space-y-3 rounded-[14px] border border-cyan-300/12 bg-cyan-300/6 px-4 py-4 text-sm">
          <div className="text-sm font-semibold text-white">本次冻结时间</div>
          <div className="space-y-2">
            {frozenDetails.map((item) => (
              <div key={item.id} className="rounded-[12px] bg-black/10 px-4 py-3">
                <div className="text-sm font-medium text-white">{item.phone}</div>
                <div className="mt-2 text-xs text-cyan-100/85">冻结开始：{item.freezeSinceDisplay}</div>
                <div className="mt-1 text-xs text-cyan-100/85">冻结结束：{item.freezeUntilDisplay}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ResultPrimaryButton label="知道了" onClick={closeCheckResultDialog} tone="violet" />
    </ResultDialogShell>
  )
})
