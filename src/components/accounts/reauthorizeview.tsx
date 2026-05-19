import { memo, useMemo, useState } from 'react'
import { CheckCircle2, KeyRound, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import type { AccountRecord, ReauthorizeOperationResult, ReauthorizeOperationResultItem } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_NOTICE_CLASS } from '../common/settings-ui'
import { ResultStatCard } from './resultdialog'
import { useAccountStore } from '../../stores/accountstore'

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
  const accounts = useAccountStore((state) => state.accounts)
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const setSelectedIds = useAccountStore((state) => state.setSelectedIds)
  const checkState = useAccountStore((state) => state.checkState)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const importProgress = useAccountStore((state) => state.importProgress)

  const [search, setSearch] = useState('')
  const [oldPasswords, setOldPasswords] = useState('')
  const [deleteOfficialMessages, setDeleteOfficialMessages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReauthorizeOperationResult | null>(null)

  const taskBusy = checkState.running || twoFactorState.running || profileOperationState.running || Boolean(importProgress)

  const sortedAccounts = useMemo(() => sortAccounts(accounts, selectedIds), [accounts, selectedIds])
  const filteredAccounts = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return sortedAccounts

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

      return haystack.includes(keyword)
    })
  }, [accounts, search, sortedAccounts])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedSet.has(account.id)), [accounts, selectedSet])

  const toggleAccount = (accountId: number) => {
    if (selectedSet.has(accountId)) {
      setSelectedIds(selectedIds.filter((id) => id !== accountId))
      return
    }
    setSelectedIds([...selectedIds, accountId])
  }

  const selectFilteredAccounts = () => {
    setSelectedIds(Array.from(new Set(filteredAccounts.map((account) => account.id))))
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

    setSubmitting(true)
    try {
      const nextResult = await api.reauthorize({
        accountIds: selectedIds,
        oldPasswords,
        deleteOfficialMessages
      })
      setResult(nextResult)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '重新授权失败，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <GlassPanel>
        <div className="space-y-5">
          <div className={`px-4 py-3 text-sm text-slate-200 ${SOFT_NOTICE_CLASS}`}>
            这里只做 <span className="text-white">合法账号持有人的重新授权</span>。会把所选账号重新切到 <span className="text-white">桌面版（固定）</span> 模式；如勾选，还会顺手清理官方系统消息。
          </div>

          {taskBusy ? (
            <div className="rounded-[14px] border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
              当前还有别的账号任务在运行，先等它完成，再执行重新授权会更稳。
            </div>
          ) : null}

          <FoldSection title="重新授权设置" hint="保持和现有账号模块同一套表单风格，不额外拆步骤页。">
            <ConfigRow label="选择账号" wide>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={selectFilteredAccounts} className="h-10 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.09]">
                    选中当前列表
                  </button>
                  <button type="button" onClick={() => setSelectedIds([])} className="h-10 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.09]">
                    清空选择
                  </button>
                  <span className="text-sm text-textMuted">已选 {selectedIds.length} 个账号</span>
                </div>

                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索手机号 / 用户名 / 昵称"
                    className={`h-11 w-full rounded-[12px] pl-10 pr-4 text-sm ${SOFT_INPUT_CLASS}`}
                  />
                </label>

                <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-[14px] border border-white/[0.06] bg-black/[0.08] p-2">
                  {filteredAccounts.map((account) => {
                    const checked = selectedSet.has(account.id)
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => toggleAccount(account.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-3 text-left transition ${checked ? 'border-violet-300/30 bg-violet-300/10' : 'border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]'}`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border text-xs ${checked ? 'border-violet-300/50 bg-violet-300 text-slate-950' : 'border-white/12 bg-black/10 text-transparent'}`}>
                            ✓
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-white">{readAccountLabel(account)}</div>
                            <div className="mt-1 truncate text-xs text-textMuted">
                              {account.phone || '—'} {account.username ? `· ${account.username}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-textMuted">#{account.id}</div>
                      </button>
                    )
                  })}
                  {filteredAccounts.length === 0 ? (
                    <div className="rounded-[12px] px-3 py-6 text-center text-sm text-textMuted">当前没有匹配到账号。</div>
                  ) : null}
                </div>

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
                ) : null}
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

            <ConfigRow label="删除官方系统消息">
              <label className="flex h-11 items-center gap-3 rounded-[12px] border border-white/[0.06] bg-black/10 px-4 text-sm text-white">
                <input
                  type="checkbox"
                  checked={deleteOfficialMessages}
                  onChange={(event) => setDeleteOfficialMessages(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-violet-300"
                />
                <span>执行后顺手清理当前账号里的官方系统消息</span>
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

          {error ? (
            <div className="rounded-[14px] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </div>
      </GlassPanel>

      <GlassPanel>
        <FoldSection title="执行结果" defaultOpen>
          <div className="space-y-4 px-3 py-3">
            {result ? (
              <>
                <div className="grid grid-cols-1 gap-3 text-center text-sm md:grid-cols-3">
                  <ResultStatCard label="处理总数" value={result.total} tone="neutral" />
                  <ResultStatCard label="成功" value={result.successCount} tone="success" />
                  <ResultStatCard label="失败" value={result.failedCount} tone={result.failedCount > 0 ? 'danger' : 'info'} />
                </div>

                {result.message ? (
                  <div className={`px-4 py-3 text-sm text-slate-200 ${SOFT_NOTICE_CLASS}`}>{result.message}</div>
                ) : null}

                <div className="space-y-2">
                  {result.results.map((item) => (
                    <div key={`${item.accountId}-${item.status}`} className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm text-white">{item.phone || `账号#${item.accountId}`}</div>
                        <div className="mt-1 text-xs text-textMuted">{item.message}</div>
                      </div>
                      <div className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs ${readStatusBadgeClass(item.status)}`}>
                        {item.status === 'success' ? <CheckCircle2 size={14} /> : item.status === 'password_mismatch' ? <KeyRound size={14} /> : item.status === 'session_expired' ? <ShieldAlert size={14} /> : <RefreshCcw size={14} />}
                        <span>{readStatusLabel(item.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-8 text-center text-sm text-textMuted">
                暂无执行结果。开始重新授权后，会在这里按账号展示：成功 / 旧密码不匹配 / 登录失效 / 重新授权失败。
              </div>
            )}
          </div>
        </FoldSection>
      </GlassPanel>
    </div>
  )
})
