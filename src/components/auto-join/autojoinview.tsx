import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, Download, Play, Search, Trash2, Upload, Wand2, X } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus } from '../../lib/ui-text'
import { parseAutoJoinTargets, useAutoJoinStore, type AutoJoinLogEntry, type AutoJoinTabKey, type AutoJoinTaskSnapshot } from '../../stores/autojoinstore'

const tabs: Array<{ key: AutoJoinTabKey; label: string; icon: typeof Play }> = [
  { key: 'tasks', label: '加群任务', icon: Play },
  { key: 'logs', label: '加群日志', icon: Clock3 },
  { key: 'links', label: '群链接整理', icon: Wand2 }
]

function readAccountLabel(account: { id: number; username?: string; phone?: string; userId?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  if (typeof account.userId === 'string' && account.userId.trim()) return account.userId.trim()
  return `账号#${account.id}`
}

function getAccountStatusTone(status?: string) {
  if (status === 'alive') return 'bg-emerald-400/12 text-emerald-300'
  if (status === 'limited' || status === 'temporary_limited') return 'bg-amber-300/12 text-amber-200'
  if (status === 'frozen' || status === 'banned' || status === 'session_expired' || status === 'not_logged_in') return 'bg-rose-400/12 text-rose-200'
  if (status === 'checking') return 'bg-sky-400/12 text-sky-300'
  return 'bg-white/10 text-slate-200'
}

function getLogTone(log: AutoJoinLogEntry) {
  if (log.status === 'joined') return 'text-emerald-300'
  if (log.status === 'failed') return 'text-rose-300'
  if (log.status === 'requested' || log.status === 'already' || log.level === 'warning') return 'text-amber-200'
  return 'text-slate-200'
}

function formatLogTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
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

function NumberRangeField(props: {
  label: string
  minValue: number
  maxValue: number
  onMinChange: (value: number) => void
  onMaxChange: (value: number) => void
  min?: number
  max?: number
}) {
  const { label, minValue, maxValue, onMinChange, onMaxChange, min = 0, max = 999 } = props
  return (
    <label className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
      <div className="text-xs tracking-[0.18em] text-textMuted">{label}</div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={minValue}
          onChange={(event) => onMinChange(Math.max(min, Number(event.target.value) || min))}
          className="h-11 w-full rounded-[12px] border border-white/8 bg-black/10 px-3 text-white outline-none focus:border-violet-400/30"
        />
        <span className="text-textMuted">-</span>
        <input
          type="number"
          min={min}
          max={max}
          value={maxValue}
          onChange={(event) => onMaxChange(Math.max(min, Number(event.target.value) || min))}
          className="h-11 w-full rounded-[12px] border border-white/8 bg-black/10 px-3 text-white outline-none focus:border-violet-400/30"
        />
      </div>
      <div className="mt-2 text-xs text-textMuted">单位：秒</div>
    </label>
  )
}

function buildAccountSummary(snapshot: AutoJoinTaskSnapshot | null) {
  if (!snapshot) return [] as Array<{ accountLabel: string; success: number; requested: number; already: number; failed: number; total: number }>
  const map = new Map<string, { accountLabel: string; success: number; requested: number; already: number; failed: number; total: number }>()
  snapshot.items.forEach((item) => {
    const key = item.accountLabel || '未分配账号'
    const current = map.get(key) ?? { accountLabel: key, success: 0, requested: 0, already: 0, failed: 0, total: 0 }
    current.total += 1
    if (item.status === 'joined') current.success += 1
    else if (item.status === 'requested') current.requested += 1
    else if (item.status === 'already') current.already += 1
    else if (item.status === 'failed') current.failed += 1
    map.set(key, current)
  })
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.accountLabel.localeCompare(b.accountLabel, 'zh-CN'))
}

function ProgressCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-[10px] px-2 py-2 text-center ${className}`}>
      <div className="text-sm font-semibold">{value}</div>
      <div>{label}</div>
    </div>
  )
}

const TabBar = memo(function TabBar() {
  const activeTab = useAutoJoinStore((state) => state.activeTab)
  const setActiveTab = useAutoJoinStore((state) => state.setActiveTab)

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = activeTab === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-white/8 bg-card text-slate-200 hover:bg-white/[0.03]'}`}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
})

const TasksWorkbench = memo(function TasksWorkbench() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)

  const init = useAutoJoinStore((state) => state.init)
  const selectedAccountIds = useAutoJoinStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useAutoJoinStore((state) => state.setSelectedAccountIds)
  const linkInput = useAutoJoinStore((state) => state.linkInput)
  const setLinkInput = useAutoJoinStore((state) => state.setLinkInput)
  const clearLinkInput = useAutoJoinStore((state) => state.clearLinkInput)
  const concurrency = useAutoJoinStore((state) => state.concurrency)
  const setConcurrency = useAutoJoinStore((state) => state.setConcurrency)
  const accountIntervalMin = useAutoJoinStore((state) => state.accountIntervalMin)
  const accountIntervalMax = useAutoJoinStore((state) => state.accountIntervalMax)
  const setAccountIntervalMin = useAutoJoinStore((state) => state.setAccountIntervalMin)
  const setAccountIntervalMax = useAutoJoinStore((state) => state.setAccountIntervalMax)
  const joinIntervalMin = useAutoJoinStore((state) => state.joinIntervalMin)
  const joinIntervalMax = useAutoJoinStore((state) => state.joinIntervalMax)
  const setJoinIntervalMin = useAutoJoinStore((state) => state.setJoinIntervalMin)
  const setJoinIntervalMax = useAutoJoinStore((state) => state.setJoinIntervalMax)
  const floodRestMin = useAutoJoinStore((state) => state.floodRestMin)
  const floodRestMax = useAutoJoinStore((state) => state.floodRestMax)
  const setFloodRestMin = useAutoJoinStore((state) => state.setFloodRestMin)
  const setFloodRestMax = useAutoJoinStore((state) => state.setFloodRestMax)
  const repeatJoinEnabled = useAutoJoinStore((state) => state.repeatJoinEnabled)
  const setRepeatJoinEnabled = useAutoJoinStore((state) => state.setRepeatJoinEnabled)
  const dispatchMode = useAutoJoinStore((state) => state.dispatchMode)
  const setDispatchMode = useAutoJoinStore((state) => state.setDispatchMode)
  const startTask = useAutoJoinStore((state) => state.startTask)
  const stopTask = useAutoJoinStore((state) => state.stopTask)
  const running = useAutoJoinStore((state) => state.running)
  const stopping = useAutoJoinStore((state) => state.stopping)
  const runtimeReady = useAutoJoinStore((state) => state.runtimeReady)
  const lastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const tasks = useAutoJoinStore((state) => state.tasks)
  const taskSnapshots = useAutoJoinStore((state) => state.taskSnapshots)

  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [draftAccountIds, setDraftAccountIds] = useState<number[]>(selectedAccountIds)
  const [accountSearch, setAccountSearch] = useState('')
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('10')
  const [accountSummaryExpanded, setAccountSummaryExpanded] = useState(false)

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  useEffect(() => {
    if (!accountPickerOpen) {
      setDraftAccountIds(selectedAccountIds)
    }
  }, [accountPickerOpen, selectedAccountIds])

  useEffect(() => {
    if (!accountPickerOpen) return
    setRangeStart('1')
    setRangeEnd(String(Math.min(10, Math.max(accounts.length, 1))))
  }, [accountPickerOpen, accounts.length])

  const summary = useMemo(() => parseAutoJoinTargets(linkInput), [linkInput])
  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const nickname = readAccountLabel(account).toLowerCase()
      return [nickname, account.username || '', account.phone || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [accountSearch, accounts])
  const selectedAccounts = useMemo(() => accounts.filter((item) => selectedAccountIds.includes(item.id)), [accounts, selectedAccountIds])
  const latestTask = tasks[0] ?? null
  const latestSnapshot = useMemo(() => (latestTask ? taskSnapshots.find((item) => item.taskId === latestTask.id) ?? null : null), [latestTask, taskSnapshots])
  const accountSummary = useMemo(() => buildAccountSummary(latestSnapshot), [latestSnapshot])
  const pendingCount = latestTask ? Math.max(0, (latestTask.total || 0) - (latestTask.completed || 0)) : 0

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setLinkInput(linkInput.trim() ? `${linkInput.trim()}\n${content.trim()}` : content.trim())
    event.target.value = ''
  }

  const exportTargetsAsTxt = () => {
    const content = summary.items.map((item) => item.normalized).join('\n')
    if (!content) return
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'auto-join-targets.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const applyAccountSelection = () => {
    setSelectedAccountIds(draftAccountIds)
    setAccountPickerOpen(false)
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button type="button" onClick={() => setAccountPickerOpen(true)} className="rounded-[16px] bg-panel/80 px-4 py-4 text-left transition hover:bg-white/[0.03]">
                <div className="text-xs tracking-[0.18em] text-textMuted">账号数量</div>
                <div className="mt-2 text-2xl font-semibold text-white">{selectedAccountIds.length}</div>
                <div className="mt-1 text-xs text-textMuted">点这里选择账号</div>
              </button>

              <NumberRangeField label="每号间隔" minValue={accountIntervalMin} maxValue={accountIntervalMax} onMinChange={setAccountIntervalMin} onMaxChange={setAccountIntervalMax} min={0} max={600} />
              <NumberRangeField label="加群间隔" minValue={joinIntervalMin} maxValue={joinIntervalMax} onMinChange={setJoinIntervalMin} onMaxChange={setJoinIntervalMax} min={0} max={600} />
              <label className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">线程数</div>
                <input type="number" min={1} max={Math.max(1, selectedAccountIds.length || 1)} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Number(event.target.value) || 1))} className="mt-3 h-11 w-full rounded-[12px] border border-white/8 bg-black/10 px-3 text-white outline-none focus:border-violet-400/30" />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <NumberRangeField label="限流休息" minValue={floodRestMin} maxValue={floodRestMax} onMinChange={setFloodRestMin} onMaxChange={setFloodRestMax} min={1} max={600} />

              <label className="flex items-center gap-3 rounded-[16px] bg-panel/80 px-4 py-4 text-sm text-slate-200">
                <input type="checkbox" checked={repeatJoinEnabled} onChange={(event) => setRepeatJoinEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                重复加群
              </label>

              <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">添加顺序</div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setDispatchMode('random')} className={`flex-1 rounded-[12px] px-3 py-2.5 transition ${dispatchMode === 'random' ? 'bg-violet-400 text-slate-950' : 'bg-white/[0.05] text-white hover:bg-white/[0.08]'}`}>随机添加</button>
                  <button type="button" onClick={() => setDispatchMode('sequential')} className={`flex-1 rounded-[12px] px-3 py-2.5 transition ${dispatchMode === 'sequential' ? 'bg-violet-400 text-slate-950' : 'bg-white/[0.05] text-white hover:bg-white/[0.08]'}`}>按顺序</button>
                </div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-semibold text-white">加群目标</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportTargetsAsTxt} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Download size={14} /> TXT导出</button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                  <Upload size={14} /> 导入TXT
                  <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
                </label>
                <button type="button" onClick={clearLinkInput} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Trash2 size={14} /> 清空</button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">有效目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.items.length}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-xl font-semibold text-white">{summary.duplicates.length}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">格式不对</div><div className="mt-2 text-xl font-semibold text-white">{summary.invalids.length}</div></div>
            </div>

            <div className="mt-4">
              <textarea
                rows={12}
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="一行一个，支持 @username / t.me/xxx / t.me/+invite"
                className="w-full rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-white outline-none focus:border-violet-400/30"
              />
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-textMuted">
                <div className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-violet-300">会自动去重和过滤无效格式</div>
                <div className="rounded-[12px] bg-white/[0.05] px-4 py-2.5">不勾选重复加群时，成功/已在群/已申请的目标会自动从列表移除</div>
              </div>
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4">
            <div className="text-base font-semibold text-white">任务操作</div>
            <div className="mt-3 space-y-3">
              <button type="button" disabled={running || !runtimeReady} onClick={() => void startTask()} className="w-full rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">{running ? '执行中' : '开始加群'}</button>
              <button type="button" disabled={!running || stopping} onClick={() => void stopTask()} className="w-full rounded-[12px] bg-rose-400/12 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50">{stopping ? '停止中' : '停止任务'}</button>
            </div>
            <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '点击开始后会自动跳到日志页。'}</div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">运行环境</div>
                <div className="mt-2 text-sm font-medium text-white">{runtimeReady ? '已接好' : '未接好'}</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">已选账号</div>
                <div className="mt-2 text-sm font-medium text-white">{selectedAccounts.length} 个</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">本轮目标</div>
                <div className="mt-2 text-sm font-medium text-white">{summary.items.length} 条</div>
              </div>
              {latestTask ? (
                <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                  <div className="text-xs tracking-[0.18em] text-textMuted">最近任务</div>
                  <div className="mt-2 text-sm font-medium text-white">{latestTask.name}</div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-slate-200">
                    <ProgressCard label="成功" value={latestTask.successCount ?? 0} className="bg-emerald-400/10 text-emerald-300" />
                    <ProgressCard label="审核" value={latestTask.requestedCount ?? 0} className="bg-amber-400/10 text-amber-200" />
                    <ProgressCard label="失败" value={latestTask.failedCount ?? 0} className="bg-rose-400/10 text-rose-300" />
                    <ProgressCard label="待加入" value={pendingCount} className="bg-sky-400/10 text-sky-300" />
                  </div>

                  {latestSnapshot ? (
                    <div className="mt-4 rounded-[12px] bg-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setAccountSummaryExpanded((value) => !value)}
                        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm text-white"
                      >
                        <span>各账号群组数量</span>
                        <span className="inline-flex items-center gap-1 text-textMuted">{accountSummaryExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{accountSummary.length}</span>
                      </button>

                      {accountSummaryExpanded ? (
                        <div className="space-y-2 border-t border-white/8 px-3 py-3 text-xs text-slate-200">
                          {accountSummary.map((item) => (
                            <div key={item.accountLabel} className="rounded-[10px] bg-white/[0.04] px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="truncate text-white">{item.accountLabel}</div>
                                <div className="text-textMuted">共 {item.total} 个</div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300">成功 {item.success}</span>
                                <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-200">审核 {item.requested}</span>
                                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-slate-200">已在群 {item.already}</span>
                                <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-300">失败 {item.failed}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </div>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div className="text-lg font-semibold text-white">选择加群账号</div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="搜索手机号 / 账号名" className="h-11 w-full rounded-[12px] border border-white/8 bg-panel pl-11 pr-4 text-sm text-white outline-none focus:border-violet-400/30" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(filteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                </div>
              </div>

              {filteredAccounts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-textMuted">区间选择</div>
                  <input inputMode="numeric" value={rangeStart} onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))} placeholder="开始" className="h-10 w-20 rounded-[12px] border border-white/8 bg-panel px-3 text-sm text-white outline-none focus:border-violet-400/30" />
                  <span className="text-textMuted">-</span>
                  <input inputMode="numeric" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))} placeholder="结束" className="h-10 w-20 rounded-[12px] border border-white/8 bg-panel px-3 text-sm text-white outline-none focus:border-violet-400/30" />
                  <button
                    type="button"
                    onClick={() => {
                      const rangeIds = readCustomRangeIds(filteredAccounts, rangeStart, rangeEnd)
                      if (rangeIds.length === 0) return
                      setDraftAccountIds((current) => toggleAccountRange(current, rangeIds))
                    }}
                    className="rounded-[12px] bg-violet-400/12 px-4 py-2 text-sm text-violet-300 transition hover:bg-violet-400/18"
                  >
                    应用区间
                  </button>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[18px] border border-white/8 bg-panel">
                <div className="grid grid-cols-[64px_220px_1.4fr_160px] border-b border-white/6 px-4 py-3 text-xs uppercase tracking-[0.16em] text-textMuted">
                  <div>选择</div>
                  <div>手机号</div>
                  <div>账号名</div>
                  <div>状态</div>
                </div>

                <div className="max-h-[520px] overflow-y-auto">
                  {loading && accounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">正在读取账号...</div>
                  ) : filteredAccounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号</div>
                  ) : filteredAccounts.map((account) => {
                    const checked = draftAccountIds.includes(account.id)
                    return (
                      <label key={account.id} className={`grid cursor-pointer grid-cols-[64px_220px_1.4fr_160px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${checked ? 'bg-violet-400/10' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center"><input type="checkbox" checked={checked} onChange={(event) => setDraftAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} /></div>
                        <div className="truncate text-white">{account.phone || '—'}</div>
                        <div className="truncate text-white">{readAccountLabel(account)}</div>
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

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/8 bg-card px-5 py-4">
              <button type="button" onClick={() => setAccountPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
              <button type="button" onClick={applyAccountSelection} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-violet-300">应用账号选择</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
})

const LogsWorkbench = memo(function LogsWorkbench() {
  const logs = useAutoJoinStore((state) => state.logs)
  const clearLogs = useAutoJoinStore((state) => state.clearLogs)
  const lastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)

  return (
    <GlassPanel className="bg-card" header={<div className="flex items-center justify-between gap-3"><div><div className="text-base font-semibold text-white">加群日志</div><div className="mt-1 text-sm text-textMuted">成功绿色，失败红色，需要审核黄色。</div></div><button type="button" onClick={clearLogs} className="rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">清空日志</button></div>}>
      <div className="rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '这里会显示自动加群过程里的最新状态。'}</div>
      <div className="mt-4 space-y-2 font-mono text-sm">
        {logs.length === 0 ? <div className="text-sm text-textMuted">还没有加群日志。</div> : null}
        {logs.map((log) => (
          <div key={log.id} className={`${getLogTone(log)} break-all`}>
            [{formatLogTime(log.createdAt)}] [{log.accountLabel || '系统'}] - {log.message}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const LinksWorkbench = memo(function LinksWorkbench() {
  const linkInput = useAutoJoinStore((state) => state.linkInput)
  const setLinkInput = useAutoJoinStore((state) => state.setLinkInput)
  const summary = useMemo(() => parseAutoJoinTargets(linkInput), [linkInput])
  const cleaned = summary.items.map((item) => item.normalized).join('\n')

  const copyCleaned = async () => {
    if (!cleaned) return
    await navigator.clipboard.writeText(cleaned)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <GlassPanel className="bg-card" header={<div><div className="text-base font-semibold text-white">群链接整理</div><div className="mt-1 text-sm text-textMuted">这里专门整理链接，不混别的配置。</div></div>}>
        <textarea
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
          placeholder="把原始群链接都贴这里，支持空格、逗号、换行混着贴。"
          className="min-h-[420px] w-full rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-white outline-none focus:border-violet-400/30"
        />
      </GlassPanel>

      <div className="space-y-5">
        <GlassPanel className="bg-card" header={<div className="flex items-center justify-between gap-3"><div className="text-base font-semibold text-white">整理结果</div><button type="button" onClick={() => void copyCleaned()} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Copy size={14} /> 复制有效链接</button></div>}>
          <div className="grid gap-3">
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">有效目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.items.length}</div></div>
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-xl font-semibold text-white">{summary.duplicates.length}</div></div>
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">无效</div><div className="mt-2 text-xl font-semibold text-white">{summary.invalids.length}</div></div>
          </div>
          <div className="mt-4 rounded-[14px] bg-panel/80 p-4">
            <div className="text-sm font-medium text-white">有效链接</div>
            <div className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap text-sm text-slate-200">{cleaned || '还没有可用的群链接。'}</div>
          </div>
        </GlassPanel>

        <GlassPanel className="bg-card" header={<div className="text-sm font-medium text-white">异常项</div>}>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">重复目标</div>
              <div className="max-h-[120px] overflow-auto whitespace-pre-wrap text-amber-200">{summary.duplicates.join('\n') || '没有重复项。'}</div>
            </div>
            <div>
              <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">无效目标</div>
              <div className="max-h-[120px] overflow-auto whitespace-pre-wrap text-rose-200">{summary.invalids.join('\n') || '没有无效项。'}</div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  )
})

export default function AutoJoinView() {
  const activeTab = useAutoJoinStore((state) => state.activeTab)
  const taskSnapshots = useAutoJoinStore((state) => state.taskSnapshots)
  const completionDialogTaskId = useAutoJoinStore((state) => state.completionDialogTaskId)
  const closeCompletionDialog = useAutoJoinStore((state) => state.closeCompletionDialog)
  const completionSnapshot = useMemo(() => taskSnapshots.find((item) => item.taskId === completionDialogTaskId) ?? null, [completionDialogTaskId, taskSnapshots])
  const completionAccountSummary = useMemo(() => buildAccountSummary(completionSnapshot), [completionSnapshot])

  return (
    <>
      <div className="flex min-h-full flex-col gap-5">
        <div>
          <div className="text-[24px] font-semibold text-white">自动加群</div>
          <div className="mt-2 text-sm text-textMuted">开始后会自动跳到日志页，并按你设的线程数并发跑账号。</div>
        </div>

        <TabBar />

        {activeTab === 'tasks' ? <TasksWorkbench /> : null}
        {activeTab === 'logs' ? <LogsWorkbench /> : null}
        {activeTab === 'links' ? <LinksWorkbench /> : null}
      </div>

      <ResultDialogShell
        open={Boolean(completionSnapshot)}
        onClose={closeCompletionDialog}
        title="自动加群任务完成"
        subtitle={completionSnapshot?.message || '这轮加群已经跑完了。'}
        icon={<CheckCircle2 size={18} />}
        tone="success"
        maxWidth="max-w-[560px]"
      >
        <ResultHero label="本轮已完成" value={`${completionSnapshot?.total || 0} 条`} tone="success" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultStatCard label="成功" value={completionSnapshot?.successCount || 0} tone="success" />
          <ResultStatCard label="审核" value={completionSnapshot?.requestedCount || 0} tone="warning" />
          <ResultStatCard label="失败" value={completionSnapshot?.failedCount || 0} tone="danger" />
          <ResultStatCard label="已在群" value={completionSnapshot?.alreadyCount || 0} tone="neutral" />
        </div>

        {completionAccountSummary.length > 0 ? (
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
            <div className="text-sm font-medium text-white">各账号群组数量</div>
            <div className="mt-3 max-h-[220px] space-y-2 overflow-auto">
              {completionAccountSummary.map((item) => (
                <div key={item.accountLabel} className="rounded-[12px] bg-white/[0.04] px-3 py-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-white">{item.accountLabel}</div>
                    <div className="text-textMuted">共 {item.total} 个</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300">成功 {item.success}</span>
                    <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-200">审核 {item.requested}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-slate-200">已在群 {item.already}</span>
                    <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-300">失败 {item.failed}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <ResultPrimaryButton label="知道了" onClick={closeCompletionDialog} tone="success" />
      </ResultDialogShell>
    </>
  )
}
