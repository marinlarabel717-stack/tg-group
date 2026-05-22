import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, RefreshCcw, ScrollText, Search, Settings2, ShieldAlert, X } from 'lucide-react'
import type { AccountRecord, ReauthorizeLogEntry, ReauthorizeOperationResult, ReauthorizeOperationResultItem, ReauthorizeProgressOverview } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_NOTICE_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultStatCard } from './resultdialog'
import { AccountPickerDialog } from './accountpickerdialog'
import { useAccountStore } from '../../stores/accountstore'
import { useUIStore } from '../../stores/uistore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function readStatusBadgeClass(status: ReauthorizeOperationResultItem['status']) {
  if (status === 'success') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (status === 'password_mismatch') return 'border-amber-300/20 bg-amber-300/10 text-amber-200'
  if (status === 'session_expired') return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  return 'border-white/10 bg-white/[0.04] text-slate-200'
}

function readStatusLabel(status: ReauthorizeOperationResultItem['status']) {
  if (status === 'success') return '成功'
  if (status === 'password_mismatch') return '旧密码不匹配'
  if (status === 'session_expired') return '登录失效'
  return '重新授权失败'
}

function readStatusIcon(status: ReauthorizeOperationResultItem['status']) {
  if (status === 'success') return <CheckCircle2 size={14} />
  if (status === 'password_mismatch') return <KeyRound size={14} />
  if (status === 'session_expired') return <ShieldAlert size={14} />
  return <RefreshCcw size={14} />
}

function formatLogTime(createdAt?: string | null) {
  if (!createdAt) return '--:--:--'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function trimLiveLogs(entries: ReauthorizeLogEntry[], maxNonErrorLogs = 180) {
  let removableRegularLogs = Math.max(0, entries.filter((entry) => entry.level !== 'error').length - maxNonErrorLogs)
  if (removableRegularLogs <= 0) return entries

  return entries.filter((entry) => {
    if (entry.level === 'error') return true
    if (removableRegularLogs > 0) {
      removableRegularLogs -= 1
      return false
    }
    return true
  })
}

function appendLiveLogs(current: ReauthorizeLogEntry[], nextLogs: ReauthorizeLogEntry[]) {
  if (nextLogs.length === 0) return current
  return trimLiveLogs([...current, ...nextLogs])
}

function sortAccounts(accounts: AccountRecord[], selectedIds: number[]) {
  const selectedSet = new Set(selectedIds)
  return [...accounts].sort((left, right) => {
    const leftSelected = selectedSet.has(left.id) ? 1 : 0
    const rightSelected = selectedSet.has(right.id) ? 1 : 0
    if (leftSelected !== rightSelected) {
      return rightSelected - leftSelected
    }
    return readAccountLabel(left).localeCompare(readAccountLabel(right), 'zh-CN')
  })
}


export const AccountReauthorizeView = memo(function AccountReauthorizeView() {
  const init = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const setSelectedIds = useAccountStore((state) => state.setSelectedIds)
  const checkState = useAccountStore((state) => state.checkState)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const importProgress = useAccountStore((state) => state.importProgress)
  const accountTaskStatusMap = useAccountTaskStatusMap()
  const activeTab = useUIStore((state) => state.reauthorizeTab)
  const setActiveTab = useUIStore((state) => state.setReauthorizeTab)

  const [oldPasswords, setOldPasswords] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [deleteOfficialMessages, setDeleteOfficialMessages] = useState(false)
  const [cleanupExpiredRecovery, setCleanupExpiredRecovery] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReauthorizeOperationResult | null>(null)
  const [progressState, setProgressState] = useState<ReauthorizeProgressOverview | null>(null)
  const [logs, setLogs] = useState<ReauthorizeLogEntry[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const runIdRef = useRef<string | null>(null)

  const taskBusy = checkState.running || twoFactorState.running || profileOperationState.running || Boolean(importProgress)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const api = window.desktopAccounts
    if (!api?.getReauthorizeState || !api?.onReauthorizeProgress) return

    let cancelled = false
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let pendingProgressState: ReauthorizeProgressOverview | null = null

    const flushProgressState = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (cancelled || !pendingProgressState) return
      setProgressState(pendingProgressState)
      pendingProgressState = null
    }

    void Promise.all([
      api.getReauthorizeState(),
      api.getReauthorizeLogs?.().catch(() => []) ?? Promise.resolve([])
    ]).then(([state, initialLogs]) => {
      if (cancelled) return
      runIdRef.current = state.runId
      setProgressState(state)
      setLogs(trimLiveLogs(initialLogs))
    }).catch(() => {})

    const unsubscribeProgress = api.onReauthorizeProgress((state) => {
      if (cancelled) return
      if (runIdRef.current !== state.runId) {
        runIdRef.current = state.runId
        setLogs([])
      }
      pendingProgressState = state
      if (!state.running) {
        flushProgressState()
        return
      }
      if (flushTimer) return
      flushTimer = setTimeout(flushProgressState, 120)
    })

    const unsubscribeLogs = api.onReauthorizeLogs?.((nextLogs) => {
      if (cancelled || nextLogs.length === 0) return
      setLogs((current) => appendLiveLogs(current, nextLogs))
    })

    return () => {
      cancelled = true
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      unsubscribeProgress()
      unsubscribeLogs?.()
    }
  }, [])

  useEffect(() => {
    if (result) {
      setResultDialogOpen(true)
    }
  }, [result])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedSet.has(account.id)), [accounts, selectedSet])
  const displayedLogs = logs

  const applyPicker = (ids: number[]) => {
    setSelectedIds(ids.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
    setPickerOpen(false)
  }

  const handleStart = async () => {
    setError('')
    const api = window.desktopAccounts
    if (!api?.reauthorize) {
      setError('当前运行环境没有注入重新授权能力。')
      return
    }
    if (selectedIds.length === 0) {
      setError('请先选择需要重新授权的账号。')
      return
    }
    if (taskBusy) {
      setError('当前还有别的账号任务在运行，请等它处理完再试。')
      return
    }

    setActiveTab('logs')
    setSubmitting(true)
    setResult(null)
    setResultDialogOpen(false)
    setLogs([])
    try {
      const nextResult = await api.reauthorize({
        accountIds: selectedIds,
        oldPasswords,
        newPassword,
        deleteOfficialMessages,
        cleanupExpiredRecovery
      })
      setResult(nextResult)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '重新授权失败，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  const renderSettingsTab = () => (
    <FoldSection title="重新授权设置" hint="保持和现有账号模块同一套表单风格，不额外拆步骤页。">
      <ConfigRow label="选择账号" hint="点击按钮，从账号列表弹窗里勾选要重新授权的账号。">
        <div className="space-y-3">
          <button
            type="button"
            disabled={submitting || taskBusy}
            onClick={() => setPickerOpen(true)}
            className="h-11 w-full rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
          >
            已选 {selectedIds.length} 个账号
          </button>

          {selectedAccounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedAccounts.slice(0, 12).map((account) => (
                <span key={account.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                  {account.phone || readAccountLabel(account)}
                </span>
              ))}
              {selectedAccounts.length > 12 ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">还有 {selectedAccounts.length - 12} 个</span>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-4 py-3 text-sm text-textMuted">
              还没有选择账号。
            </div>
          )}
        </div>
      </ConfigRow>

      <ConfigRow label="旧密码" wide>
        <div className="space-y-2">
          <input
            value={oldPasswords}
            onChange={(event) => setOldPasswords(event.target.value)}
            placeholder="支持多个旧密码，使用 | 分隔"
            className={`h-11 w-full rounded-[12px] px-4 text-sm ${SOFT_INPUT_CLASS}`}
          />
          <div className="text-xs text-textMuted">如果账号本地已存旧密码，执行时也会自动一起兜底尝试。</div>
        </div>
      </ConfigRow>

      <ConfigRow label="新密码" wide>
        <div className="space-y-2">
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="可选：填写后，重新授权成功后会改成这个新密码"
            className={`h-11 w-full rounded-[12px] px-4 text-sm ${SOFT_INPUT_CLASS}`}
          />
          <div className="text-xs text-textMuted">留空则保持当前 2FA 密码不变；填写后，会在新设备登录成功后切换为这个新密码。</div>
        </div>
      </ConfigRow>

      <ConfigRow label="删除官方系统消息" hint="开启后，会删除 Telegram 官方系统消息。">
        <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
          <span>{deleteOfficialMessages ? '已开启' : '已关闭'}</span>
          <input
            type="checkbox"
            checked={deleteOfficialMessages}
            onChange={(event) => setDeleteOfficialMessages(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
        </label>
      </ConfigRow>

      <ConfigRow label="清理过期恢复方式" hint="仅清理待确认 / 已过期的恢复痕迹，不会删除已生效的 2FA 密码恢复方式。">
        <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
          <span>{cleanupExpiredRecovery ? '已开启' : '已关闭'}</span>
          <input
            type="checkbox"
            checked={cleanupExpiredRecovery}
            onChange={(event) => setCleanupExpiredRecovery(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
        </label>
      </ConfigRow>

      <ConfigRow label="新设备模式">
        <div className="flex h-11 items-center rounded-[12px] border border-white/[0.06] bg-black/10 px-4 text-sm text-white">
          桌面版（固定）
        </div>
      </ConfigRow>

      <ConfigRow label="执行线程" hint="自动跟随“设置”里的全局检测并发，无需单独再配。">
        <div className="flex h-11 items-center rounded-[12px] border border-violet-300/18 bg-violet-400/10 px-4 text-sm text-violet-100">
          自动同步全局线程配置
        </div>
      </ConfigRow>

      <ConfigRow label="开始重新授权">
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={submitting || taskBusy || selectedIds.length === 0}
          className="h-11 w-full rounded-[12px] bg-violet-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? '重新授权中...' : '开始重新授权'}
        </button>
      </ConfigRow>
    </FoldSection>
  )

  const renderLogsTab = () => {
    const currentProgress = progressState?.running ? `${progressState.completed} / ${progressState.total}` : result ? `${result.total} / ${result.total}` : `${progressState?.completed ?? 0} / ${progressState?.total ?? 0}`

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 text-center text-sm md:grid-cols-5">
          <ResultStatCard label="执行进度" value={currentProgress} tone="neutral" />
          <ResultStatCard label="并发线程" value={progressState?.concurrency ?? 1} tone="info" />
          <ResultStatCard label="成功" value={result?.successCount ?? progressState?.successCount ?? 0} tone="success" />
          <ResultStatCard label="失败" value={result?.failedCount ?? progressState?.failedCount ?? 0} tone={(result?.failedCount ?? progressState?.failedCount ?? 0) > 0 ? 'danger' : 'info'} />
          <ResultStatCard label="最近账号" value={progressState?.currentPhone || '等待中'} tone="info" />
        </div>

        {progressState?.running ? (
          <div className="flex items-center gap-2 rounded-[14px] border border-violet-300/18 bg-violet-300/10 px-4 py-3 text-sm text-violet-100">
            <Loader2 size={16} className="animate-spin" />
            <span>正在执行重新授权，页面会实时刷新步骤日志。</span>
          </div>
        ) : null}

        {result ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-3">
            <div className="text-sm text-slate-200">执行已经结束，结果汇总已放进弹窗里。</div>
            <button
              type="button"
              onClick={() => setResultDialogOpen(true)}
              className="rounded-[12px] bg-violet-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-violet-300"
            >
              查看结果汇总
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-black/[0.08]">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-sm font-medium text-white">执行日志</div>
              <div className="mt-1 text-xs text-textMuted">按你要的格式显示：时间戳 / 手机号 / 当前进度。</div>
            </div>
            <div className="text-xs text-textMuted">最新 {displayedLogs.length} 条</div>
          </div>

          <div className="max-h-[560px] overflow-auto">
            {displayedLogs.length > 0 ? (
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[120px_200px_minmax(320px,1fr)] border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.14em] text-textMuted">
                  <div>时间戳</div>
                  <div>手机号</div>
                  <div>当前进度</div>
                </div>
                {displayedLogs.map((log) => {
                  const phoneText = log.phone || (log.accountId ? `账号#${log.accountId}` : '任务总览')
                  return (
                    <div key={log.id} className="grid grid-cols-[120px_200px_minmax(320px,1fr)] border-b border-white/[0.06] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.03]">
                      <div className="pr-3 text-textMuted">{formatLogTime(log.createdAt)}</div>
                      <div className="pr-3 text-white">{phoneText}</div>
                      <div className={log.level === 'success' ? 'pr-3 text-emerald-300' : log.level === 'warning' ? 'pr-3 text-amber-200' : log.level === 'error' ? 'pr-3 text-rose-300' : 'pr-3 text-slate-200'}>{log.message}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-textMuted">
                暂无执行日志。点击“开始重新授权”后，会自动切到这里并实时显示步骤。
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <GlassPanel>
          <div className="space-y-5">
            {taskBusy ? (
              <div className="rounded-[14px] border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
                当前还有别的账号任务在运行，先等它完成，再执行重新授权会更稳。
              </div>
            ) : null}

            <div className="inline-flex gap-2 rounded-[14px] border border-white/[0.06] bg-card/70 p-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-sm ${SOFT_TAB_CLASS} ${activeTab === 'settings' ? 'border-white/[0.12] bg-violet-400/12 text-violet-200 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]' : 'border-white/[0.06] bg-white/[0.02] text-textMuted hover:border-white/[0.09] hover:bg-white/[0.05] hover:text-white'}`}
              >
                <Settings2 size={16} />
                <span>重新授权设置</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-sm ${SOFT_TAB_CLASS} ${activeTab === 'logs' ? 'border-white/[0.12] bg-violet-400/12 text-violet-200 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]' : 'border-white/[0.06] bg-white/[0.02] text-textMuted hover:border-white/[0.09] hover:bg-white/[0.05] hover:text-white'}`}
              >
                <ScrollText size={16} />
                <span>执行日志</span>
              </button>
            </div>

            {activeTab === 'settings' ? renderSettingsTab() : renderLogsTab()}

            {error ? (
              <div className="rounded-[14px] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        <AccountPickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          accounts={sortAccounts(accounts, selectedIds)}
          selectedIds={selectedIds}
          title="选择重新授权账号"
          subtitle="直接按群组成员邀请那套表格来选，筛完后在顶部确认。"
          confirmText="确认选择账号"
          onConfirm={applyPicker}
          resolveBusyMeta={(account) => {
            const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
            return { busy: taskMeta.occupied, label: taskMeta.label, tone: taskMeta.tone }
          }}
        />
      </div>

      <ResultDialogShell
        open={resultDialogOpen && Boolean(result)}
        onClose={() => setResultDialogOpen(false)}
        title="重新授权结果汇总"
        subtitle="这里专门看最终结果，执行日志只保留过程。"
        icon={<CheckCircle2 size={18} />}
        tone="violet"
        maxWidth="max-w-[760px]"
      >
        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-center text-sm md:grid-cols-4">
              <ResultStatCard label="总账号" value={result.total} tone="neutral" />
              <ResultStatCard label="成功" value={result.successCount} tone="success" />
              <ResultStatCard label="失败" value={result.failedCount} tone={result.failedCount > 0 ? 'danger' : 'info'} />
              <ResultStatCard label="成功率" value={result.total > 0 ? `${Math.round((result.successCount / result.total) * 100)}%` : '0%'} tone="violet" />
            </div>

            {result.message ? (
              <div className={`px-4 py-3 text-sm text-slate-200 ${SOFT_NOTICE_CLASS}`}>{result.message}</div>
            ) : null}

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {result.results.map((item) => (
                <div key={`${item.accountId}-${item.status}`} className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-white">{item.phone || `账号#${item.accountId}`}</div>
                    <div className="mt-1 text-xs text-textMuted break-all">{item.message}</div>
                  </div>
                  <div className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs ${readStatusBadgeClass(item.status)}`}>
                    {readStatusIcon(item.status)}
                    <span>{readStatusLabel(item.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </ResultDialogShell>
    </>
  )
})
