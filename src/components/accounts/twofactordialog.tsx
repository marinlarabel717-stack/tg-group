import { memo, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, MailCheck, RotateCcw, ShieldOff } from 'lucide-react'
import type { AccountRecord, TwoFactorAction, TwoFactorOperationPayload, TwoFactorOperationResult, TwoFactorProgressState } from '../../types'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from './resultdialog'

function readActionLabel(action: TwoFactorAction) {
  if (action === 'change-2fa') return '更改 2FA'
  if (action === 'disable-2fa') return '关闭 2FA'
  return '重置 2FA'
}

function readActionIcon(action: TwoFactorAction) {
  if (action === 'change-2fa') return <KeyRound size={18} />
  if (action === 'disable-2fa') return <ShieldOff size={18} />
  return <RotateCcw size={18} />
}

function readActionTone(action: TwoFactorAction) {
  if (action === 'change-2fa') return 'violet' as const
  if (action === 'disable-2fa') return 'warning' as const
  return 'info' as const
}

export const TwoFactorManageDialog = memo(function TwoFactorManageDialog({
  open,
  action,
  accounts,
  submitting,
  onClose,
  onSubmit
}: {
  open: boolean
  action: TwoFactorAction | null
  accounts: AccountRecord[]
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: TwoFactorOperationPayload) => Promise<void>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !action) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setHint('')
    setError('')
  }, [open, action, accounts])

  const storedTwoFactorCount = useMemo(
    () => accounts.filter((account) => typeof account.profile?.twoFA === 'string' && account.profile.twoFA.trim()).length,
    [accounts]
  )

  if (!open || !action) return null

  const tone = readActionTone(action)
  const actionLabel = readActionLabel(action)

  const submitApply = async () => {
    setError('')

    if (action === 'change-2fa') {
      if (!newPassword.trim()) {
        setError('请先填写新的 2FA。')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('两次输入的新 2FA 不一致。')
        return
      }
      await onSubmit({
        action,
        phase: 'apply',
        accountIds: accounts.map((account) => account.id),
        currentPassword,
        newPassword,
        hint
      })
      return
    }

    if (action === 'disable-2fa') {
      if (!currentPassword.trim() && storedTwoFactorCount === 0) {
        setError('当前没有可用的旧 2FA，请先手动填写旧 2FA。')
        return
      }
      await onSubmit({
        action,
        phase: 'apply',
        accountIds: accounts.map((account) => account.id),
        currentPassword
      })
      return
    }

    if (action === 'reset-2fa') {
      await onSubmit({
        action: 'reset-2fa',
        phase: 'apply',
        accountIds: accounts.map((account) => account.id)
      })
      return
    }
  }

  const accountPreview = accounts.slice(0, 4).map((account) => account.phone).filter(Boolean)

  return (
    <ResultDialogShell
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={actionLabel}
      subtitle={`本次会批量处理 ${accounts.length} 个账号`}
      icon={readActionIcon(action)}
      tone={tone}
      maxWidth="max-w-[560px]"
      closable={!submitting}
    >
      <ResultHero label="处理范围" value={`已选 ${accounts.length} 个账号`} tone={tone} />

      <div className="rounded-[14px] bg-panel px-4 py-3 text-sm text-textMuted">
        <div className="text-white">优先处理账号</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {accountPreview.map((phone) => (
            <span key={phone} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{phone}</span>
          ))}
          {accounts.length > accountPreview.length ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">还有 {accounts.length - accountPreview.length} 个</span>
          ) : null}
        </div>
      </div>

      {(action === 'change-2fa' || action === 'disable-2fa') ? (
        <div className="rounded-[14px] bg-panel px-4 py-3 text-sm text-textMuted">
          当前所选账号里，有 <span className="text-white">{storedTwoFactorCount}</span> 个已经记录了本地旧 2FA。
          {storedTwoFactorCount > 0 ? ' 如果下面的旧 2FA 留空，会优先用这些本地记录去执行。' : ' 当前没有本地旧 2FA 兜底。'}
        </div>
      ) : null}

      <div className="space-y-3">
        {(action === 'change-2fa' || action === 'disable-2fa') ? (
          <div>
            <div className="mb-2 text-sm text-textMuted">旧 2FA（可留空，留空时优先用本地已记录的 2FA）</div>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="没有本地记录时，在这里填旧 2FA"
              className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
            />
          </div>
        ) : null}

        {action !== 'disable-2fa' ? (
          <>
            <div>
              <div className="mb-2 text-sm text-textMuted">新的 2FA</div>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={action === 'reset-2fa' ? '重置后统一改成这个 2FA' : '批量改成这个 2FA'}
                className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
              />
            </div>
            <div>
              <div className="mb-2 text-sm text-textMuted">确认新的 2FA</div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再输入一次新的 2FA"
                className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
              />
            </div>
            <div>
              <div className="mb-2 text-sm text-textMuted">提示词（可选）</div>
              <input
                value={hint}
                onChange={(event) => setHint(event.target.value)}
                placeholder="比如：本批 5 月新规则"
                className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
              />
            </div>
          </>
        ) : null}

        {action === 'reset-2fa' ? (
          <div className="rounded-[14px] border border-sky-400/15 bg-sky-400/8 px-4 py-3 text-sm text-sky-100">
            这里直接走 Telegram 官方的 <span className="font-medium text-white">忘记密码 / 重置 2FA</span> 链路。
            点提交后，会直接为所选账号发起重置申请；如果 Telegram 接受，会进入大约 <span className="font-medium text-white">7 天等待期</span>，到时间后 2FA 才会被自动清掉。
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-[14px] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40">
          取消
        </button>
        <button type="button" onClick={() => void submitApply()} disabled={submitting} className="h-11 rounded-[12px] bg-violet-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? '处理中...' : action === 'disable-2fa' ? '开始关闭 2FA' : action === 'reset-2fa' ? '开始重置 2FA' : '开始更改 2FA'}
        </button>
      </div>
    </ResultDialogShell>
  )
})

export const TwoFactorProgressDialog = memo(function TwoFactorProgressDialog({
  state
}: {
  state: TwoFactorProgressState | null
}) {
  if (!state?.running) return null

  const tone = state.action ? readActionTone(state.action) : 'violet'
  const actionLabel = state.action ? readActionLabel(state.action) : '2FA 处理'

  return (
    <ResultDialogShell
      open={true}
      onClose={() => {}}
      title={`${actionLabel}进行中`}
      subtitle={state.action === 'reset-2fa' ? '正在为所选账号发起忘记密码 / 7 天重置申请' : '正在逐个处理你选中的账号'}
      icon={<Loader2 size={18} className="animate-spin" />}
      tone={tone}
      maxWidth="max-w-[620px]"
      closable={false}
    >
      <ResultHero label="当前进度" value={`${state.completed} / ${state.total}`} tone={tone} />

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <ResultStatCard label="成功" value={state.successCount} tone="success" />
        <ResultStatCard label="失败" value={state.failedCount} tone="danger" />
        <ResultStatCard label="当前账号" value={state.currentPhone || '等待中'} tone="neutral" />
      </div>

      <div className="rounded-[14px] border border-white/8 bg-panel/80 p-3">
        <div className="mb-3 flex items-center gap-2 text-sm text-white">
          <MailCheck size={16} className="text-violet-300" />
          运行日志
        </div>
        <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1 text-sm">
          {state.logs.length === 0 ? (
            <div className="rounded-[12px] bg-white/[0.03] px-3 py-3 text-textMuted">正在准备任务...</div>
          ) : state.logs.map((log) => (
            <div key={log.id} className="rounded-[12px] bg-white/[0.03] px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-textMuted">
                <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                {log.phone ? <span>{log.phone}</span> : null}
              </div>
              <div className={`mt-1 ${log.level === 'error' ? 'text-rose-200' : log.level === 'success' ? 'text-emerald-200' : log.level === 'warning' ? 'text-amber-200' : 'text-slate-200'}`}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ResultDialogShell>
  )
})

export const TwoFactorResultDialog = memo(function TwoFactorResultDialog({
  result,
  onClose
}: {
  result: TwoFactorOperationResult | null
  onClose: () => void
}) {
  if (!result) return null

  const tone = readActionTone(result.action)
  const actionLabel = readActionLabel(result.action)
  const failedItems = result.results.filter((item) => !item.success)

  return (
    <ResultDialogShell
      open={true}
      onClose={onClose}
      title={`${actionLabel}完成`}
      subtitle={result.action === 'reset-2fa' ? '忘记密码 / 7 天重置结果如下' : '本次批量处理结果如下'}
      icon={failedItems.length > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      tone={failedItems.length > 0 ? 'warning' : tone}
      maxWidth="max-w-[620px]"
    >
      <ResultHero label="处理结果" value={`成功 ${result.successCount} / ${result.total}`} tone={failedItems.length > 0 ? 'warning' : tone} />

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <ResultStatCard label="总账号" value={result.total} tone="neutral" />
        <ResultStatCard label="成功" value={result.successCount} tone="success" />
        <ResultStatCard label="失败" value={result.failedCount} tone={result.failedCount > 0 ? 'danger' : 'neutral'} />
      </div>

      {result.action === 'reset-2fa' ? (
        <div className="rounded-[14px] border border-sky-400/15 bg-sky-400/8 px-4 py-3 text-sm text-sky-100">
          这一步只是向 Telegram 发起重置 2FA 申请。若 Telegram 接受，会进入等待期，到时间后才会自动把 2FA 清掉，不需要你再手动填验证码。
        </div>
      ) : null}

      {failedItems.length > 0 ? (
        <div className="rounded-[14px] border border-rose-400/15 bg-rose-400/8 p-3">
          <div className="mb-3 text-sm font-medium text-rose-100">失败明细</div>
          <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1 text-sm text-rose-100">
            {failedItems.map((item) => (
              <div key={item.accountId} className="rounded-[12px] bg-black/10 px-3 py-3">
                <div className="font-medium">{item.phone}</div>
                <div className="mt-1 text-rose-200/90">{item.message}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ResultPrimaryButton label="知道了" onClick={onClose} tone={failedItems.length > 0 ? 'warning' : tone} />
    </ResultDialogShell>
  )
})
