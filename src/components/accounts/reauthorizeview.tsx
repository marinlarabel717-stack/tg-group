import { memo, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, RefreshCcw, ScrollText, Search, Settings2, ShieldAlert, X } from 'lucide-react'
import type { AccountRecord, ReauthorizeOperationResult, ReauthorizeOperationResultItem, ReauthorizeProgressState } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_NOTICE_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultStatCard } from './resultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'

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

function getAccountStatusTone(status?: string) {
  if (status === 'alive') return 'bg-emerald-400/12 text-emerald-300'
  if (status === 'limited') return 'bg-sky-400/12 text-sky-300'
  if (status === 'temporary_limited') return 'bg-orange-400/12 text-orange-300'
  if (status === 'geo_restricted') return 'bg-amber-300/12 text-amber-200'
  if (status === 'frozen') return 'bg-cyan-400/12 text-cyan-300'
  if (status === 'multi_ip') return 'bg-indigo-400/12 text-indigo-300'
  if (status === 'timeout') return 'bg-violet-400/12 text-violet-300'
  if (status === 'banned' || status === 'session_expired' || status === 'not_logged_in') return 'bg-rose-400/12 text-rose-200'
  if (status === 'checking') return 'bg-teal-400/12 text-teal-300'
  return 'bg-white/10 text-slate-200'
}

function readCustomRangeIds<T extends { id: number }>(accounts: T[], startInput: string, endInput: string) {
  const start = Number(startInput)
  const end = Number(endInput)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [] as number[]
  const normalizedStart = Math.max(1, Math.min(start, end))
  const normalizedEnd = Math.min(accounts.length, Math.max(start, end))
  if (normalizedStart > normalizedEnd) return [] as number[]
  return accounts.slice(normalizedStart - 1, normalizedEnd).map((item) => item.id)
}

function toggleAccountRange(currentIds: number[], rangeIds: number[]) {
  const currentSet = new Set(currentIds)
  const fullySelected = rangeIds.every((id) => currentSet.has(id))
  if (fullySelected) {
    return currentIds.filter((id) => !rangeIds.includes(id))
  }
  const next = [...currentIds]
  rangeIds.forEach((id) => {
    if (!currentSet.has(id)) next.push(id)
  })
  return next
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

  const [oldPasswords, setOldPasswords] = useState('')
  const [deleteOfficialMessages, setDeleteOfficialMessages] = useState(false)
  const [cleanupExpiredRecovery, setCleanupExpiredRecovery] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReauthorizeOperationResult | null>(null)
  const [progressState, setProgressState] = useState<ReauthorizeProgressState | null>(null)
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<number[]>(selectedIds)
  const [keyword, setKeyword] = useState('')
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('10')

  const taskBusy = checkState.running || twoFactorState.running || profileOperationState.running || Boolean(importProgress)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const api = window.desktopAccounts
    if (!api?.getReauthorizeState || !api?.onReauthorizeProgress) return

    void api.getReauthorizeState().then(setProgressState).catch(() => {})
    return api.onReauthorizeProgress((state) => {
      setProgressState(state)
    })
  }, [])

  useEffect(() => {
    if (!pickerOpen) {
      setDraftIds(selectedIds)
    }
  }, [pickerOpen, selectedIds])

  useEffect(() => {
    if (!pickerOpen) return
    setRangeStart('1')
    setRangeEnd(String(Math.min(10, Math.max(accounts.length, 1))))
  }, [pickerOpen, accounts.length])

  useEffect(() => {
    if (result) {
      setResultDialogOpen(true)
    }
  }, [result])

  const sortedAccounts = useMemo(() => sortAccounts(accounts, selectedIds), [accounts, selectedIds])
  const filteredAccounts = useMemo(() => {
    const searchValue = keyword.trim().toLowerCase()
    if (!searchValue) return sortedAccounts

    return sortedAccounts.filter((account) => {
      const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name : ''
      const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name : ''
      const haystack = [
        account.phone,
        account.username,
        account.userId,
        firstName,
        lastName,
        readAccountLabel(account)
      ].join(' ').toLowerCase()

      return haystack.includes(searchValue)
    })
  }, [accounts, keyword, sortedAccounts])

  const selectableFilteredAccounts = useMemo(
    () => filteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, filteredAccounts]
  )

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedSet.has(account.id)), [accounts, selectedSet])
  const displayedLogs = useMemo(() => [...(progressState?.logs ?? [])].reverse(), [progressState])

  const applyPicker = () => {
    setSelectedIds(draftIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
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
    try {
      const nextResult = await api.reauthorize({
        accountIds: selectedIds,
        oldPasswords,
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
        <div className="grid grid-cols-1 gap-3 text-center text-sm md:grid-cols-4">
          <ResultStatCard label="执行进度" value={currentProgress} tone="neutral" />
          <ResultStatCard label="成功" value={result?.successCount ?? progressState?.successCount ?? 0} tone="success" />
          <ResultStatCard label="失败" value={result?.failedCount ?? progressState?.failedCount ?? 0} tone={(result?.failedCount ?? progressState?.failedCount ?? 0) > 0 ? 'danger' : 'info'} />
          <ResultStatCard label="当前账号" value={progressState?.currentPhone || '等待中'} tone="info" />
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
            <div className={`px-4 py-3 text-sm text-slate-200 ${SOFT_NOTICE_CLASS}`}>
              这里只做 <span className="text-white">合法账号持有人的重新授权</span>。会把所选账号重新切到 <span className="text-white">桌面版（固定）</span> 模式，并在成功后只保留当前新设备。
            </div>

            {taskBusy ? (
              <div className="rounded-[14px] border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
                当前还有别的账号任务在运行，先等它完成，再执行重新授权会更稳。
              </div>
            ) : null}

            <div className="inline-flex rounded-[14px] border border-white/[0.06] bg-black/[0.06] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm ${SOFT_TAB_CLASS} ${activeTab === 'settings' ? 'border-violet-300 bg-violet-400 text-slate-950 shadow-[0_8px_24px_rgba(167,139,250,0.28)]' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
              >
                <Settings2 size={16} />
                <span>重新授权设置</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm ${SOFT_TAB_CLASS} ${activeTab === 'logs' ? 'border-violet-300 bg-violet-400 text-slate-950 shadow-[0_8px_24px_rgba(167,139,250,0.28)]' : 'bg-white/[0.06] text-textMain hover:bg-white/[0.1]'}`}
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

        {pickerOpen ? (
          <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setPickerOpen(false)}>
            <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-card px-5 py-4">
                <div className="text-lg font-semibold text-white">账号列表</div>
                <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setPickerOpen(false)}><X size={16} /></button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-[360px]">
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索手机号 / 用户名" className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel pl-11 pr-4 text-sm text-white outline-none focus:border-white/[0.12]" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => setDraftIds(selectableFilteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">选中筛选结果</button>
                    <button type="button" onClick={() => setDraftIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                  </div>
                </div>

                {filteredAccounts.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm text-textMuted">范围</div>
                    <input
                      inputMode="numeric"
                      value={rangeStart}
                      onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))}
                      placeholder="开始"
                      className="h-10 w-20 rounded-[12px] border border-white/[0.06] bg-panel px-3 text-sm text-white outline-none focus:border-white/[0.12]"
                    />
                    <span className="text-textMuted">-</span>
                    <input
                      inputMode="numeric"
                      value={rangeEnd}
                      onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))}
                      placeholder="结束"
                      className="h-10 w-20 rounded-[12px] border border-white/[0.06] bg-panel px-3 text-sm text-white outline-none focus:border-white/[0.12]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const rangeIds = readCustomRangeIds(selectableFilteredAccounts, rangeStart, rangeEnd)
                        if (rangeIds.length === 0) return
                        setDraftIds((current) => toggleAccountRange(current, rangeIds))
                      }}
                      className="rounded-[12px] bg-violet-400/12 px-4 py-2 text-sm text-violet-300 transition hover:bg-violet-400/18"
                    >
                      应用范围
                    </button>
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-panel/80">
                  <div className="grid grid-cols-[64px_220px_1.4fr_160px] border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.18em] text-textMuted">
                    <div className="text-center">选择</div>
                    <div>手机号</div>
                    <div>账号</div>
                    <div>状态</div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {filteredAccounts.length === 0 ? (
                      <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号</div>
                    ) : filteredAccounts.map((account) => {
                      const checked = draftIds.includes(account.id)
                      const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
                      return (
                        <label key={account.id} className={`grid grid-cols-[64px_220px_1.4fr_160px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${taskMeta.occupied ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${checked ? 'bg-violet-400/10' : taskMeta.occupied ? '' : 'hover:bg-white/[0.04]'}`}>
                          <div className="flex items-center justify-center"><input type="checkbox" checked={checked} disabled={taskMeta.occupied} onChange={(event) => setDraftIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} /></div>
                          <div className="truncate text-white">{account.phone || '-'}</div>
                          <div className="min-w-0">
                            <div className="truncate text-white">{readAccountLabel(account)}</div>
                            <div className="mt-1 truncate text-xs text-textMuted">{account.username ? `@${account.username}` : account.userId || `账号#${account.id}`}</div>
                            {taskMeta.occupied ? <div className="mt-1 text-xs text-textMuted">占用中：{taskMeta.label}</div> : null}
                          </div>
                          <div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${getAccountStatusTone(account.status)}`}>
                              {formatAccountStatus(account.status)}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/[0.06] bg-card px-5 py-4">
                <button type="button" onClick={() => setPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
                <button type="button" onClick={applyPicker} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-violet-300">确认选择</button>
              </div>
            </div>
          </div>
        ) : null}
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
