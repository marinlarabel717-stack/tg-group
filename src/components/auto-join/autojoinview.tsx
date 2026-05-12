import { memo, useEffect, useMemo, type ChangeEvent } from 'react'
import { CheckCircle2, Clock3, Copy, Link2, LoaderCircle, Play, RefreshCw, ShieldAlert, Square, Upload, Users, Wand2 } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatDateTimeFull } from '../../lib/ui-text'
import { parseAutoJoinTargets, useAutoJoinStore, type AutoJoinLogEntry, type AutoJoinTabKey } from '../../stores/autojoinstore'

const tabs: Array<{ key: AutoJoinTabKey; label: string; icon: typeof Play }> = [
  { key: 'tasks', label: '加群任务', icon: Play },
  { key: 'logs', label: '加群日志', icon: Clock3 },
  { key: 'links', label: '群链接整理', icon: Wand2 }
]

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function getLogTone(log: AutoJoinLogEntry) {
  if (log.level === 'success') return 'border-emerald-400/18 bg-emerald-400/10 text-emerald-200'
  if (log.level === 'warning') return 'border-amber-400/18 bg-amber-400/10 text-amber-200'
  if (log.level === 'error') return 'border-rose-400/18 bg-rose-400/10 text-rose-200'
  return 'border-white/10 bg-white/[0.03] text-slate-200'
}

function readStatusTone(status?: string) {
  if (status === 'alive') return 'bg-emerald-400/12 text-emerald-300'
  if (status === 'limited' || status === 'temporary_limited') return 'bg-amber-300/12 text-amber-200'
  if (status === 'frozen' || status === 'banned' || status === 'session_expired' || status === 'not_logged_in') return 'bg-rose-400/12 text-rose-200'
  return 'bg-white/10 text-slate-200'
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
            className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/8 bg-card text-slate-200 hover:bg-white/[0.03]'}`}
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
  const loadingAccounts = useAccountStore((state) => state.loading)

  const init = useAutoJoinStore((state) => state.init)
  const selectedAccountIds = useAutoJoinStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useAutoJoinStore((state) => state.setSelectedAccountIds)
  const taskName = useAutoJoinStore((state) => state.taskName)
  const setTaskName = useAutoJoinStore((state) => state.setTaskName)
  const linkInput = useAutoJoinStore((state) => state.linkInput)
  const setLinkInput = useAutoJoinStore((state) => state.setLinkInput)
  const clearLinkInput = useAutoJoinStore((state) => state.clearLinkInput)
  const concurrency = useAutoJoinStore((state) => state.concurrency)
  const setConcurrency = useAutoJoinStore((state) => state.setConcurrency)
  const intervalSeconds = useAutoJoinStore((state) => state.intervalSeconds)
  const setIntervalSeconds = useAutoJoinStore((state) => state.setIntervalSeconds)
  const retryLimit = useAutoJoinStore((state) => state.retryLimit)
  const setRetryLimit = useAutoJoinStore((state) => state.setRetryLimit)
  const autoRetryOnFloodWait = useAutoJoinStore((state) => state.autoRetryOnFloodWait)
  const setAutoRetryOnFloodWait = useAutoJoinStore((state) => state.setAutoRetryOnFloodWait)
  const running = useAutoJoinStore((state) => state.running)
  const stopping = useAutoJoinStore((state) => state.stopping)
  const runtimeReady = useAutoJoinStore((state) => state.runtimeReady)
  const startTask = useAutoJoinStore((state) => state.startTask)
  const stopTask = useAutoJoinStore((state) => state.stopTask)
  const lastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const tasks = useAutoJoinStore((state) => state.tasks)

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  const summary = useMemo(() => parseAutoJoinTargets(linkInput), [linkInput])
  const selectedAccounts = useMemo(() => accounts.filter((item) => selectedAccountIds.includes(item.id)), [accounts, selectedAccountIds])

  const toggleAccount = (accountId: number) => {
    if (selectedAccountIds.includes(accountId)) {
      setSelectedAccountIds(selectedAccountIds.filter((id) => id !== accountId))
      return
    }
    setSelectedAccountIds([...selectedAccountIds, accountId])
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setLinkInput(linkInput.trim() ? `${linkInput.trim()}\n${content.trim()}` : content.trim())
    event.target.value = ''
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4">
        <GlassPanel
          header={
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white">加群任务</div>
                <div className="mt-1 text-sm text-textMuted">先做能跑的第一版：导入链接、选账号、稳定执行。</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs ${runtimeReady ? 'bg-emerald-400/12 text-emerald-200' : 'bg-rose-400/12 text-rose-200'}`}>
                {runtimeReady ? '运行环境已就绪' : '运行环境未接好'}
              </div>
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-200">
              <span>任务名字</span>
              <input
                value={taskName}
                onChange={(event) => setTaskName(event.target.value)}
                placeholder="例如：今天早上第一批加群"
                className="h-11 w-full rounded-[14px] border border-white/10 bg-panel px-4 text-sm text-white outline-none transition focus:border-cyan-400/35"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-2 text-sm text-slate-200">
                <span>账号并发</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={concurrency}
                  onChange={(event) => setConcurrency(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                  className="h-11 w-full rounded-[14px] border border-white/10 bg-panel px-3 text-sm text-white outline-none transition focus:border-cyan-400/35"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                <span>每号间隔</span>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={intervalSeconds}
                  onChange={(event) => setIntervalSeconds(Math.max(1, Math.min(300, Number(event.target.value) || 1)))}
                  className="h-11 w-full rounded-[14px] border border-white/10 bg-panel px-3 text-sm text-white outline-none transition focus:border-cyan-400/35"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                <span>失败重试</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={retryLimit}
                  onChange={(event) => setRetryLimit(Math.max(0, Math.min(5, Number(event.target.value) || 0)))}
                  className="h-11 w-full rounded-[14px] border border-white/10 bg-panel px-3 text-sm text-white outline-none transition focus:border-cyan-400/35"
                />
              </label>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-[14px] border border-white/8 bg-panel px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={autoRetryOnFloodWait}
              onChange={(event) => setAutoRetryOnFloodWait(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-transparent"
            />
            遇到 Telegram 限流 / 等待时自动排队继续，不直接判失败
          </label>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[16px] border border-white/8 bg-panel p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">选择账号</div>
                  <div className="mt-1 text-xs text-textMuted">执行模型：单号串行，多号并发</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAccountIds(accounts.filter((item) => item.status === 'alive').map((item) => item.id))}
                  className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.03]"
                >
                  <RefreshCw size={13} />
                  一键选存活号
                </button>
              </div>

              <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
                {loadingAccounts ? <div className="text-sm text-textMuted">正在读取账号列表…</div> : null}
                {accounts.map((account) => {
                  const checked = selectedAccountIds.includes(account.id)
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={`rounded-[14px] border px-3 py-3 text-left transition ${checked ? 'border-cyan-400/25 bg-cyan-400/10' : 'border-white/8 bg-card hover:bg-white/[0.03]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{readAccountLabel(account)}</div>
                          <div className="mt-1 text-xs text-textMuted">{account.phone || account.userId || `账号#${account.id}`}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${readStatusTone(account.status)}`}>
                          {formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[16px] border border-white/8 bg-panel p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">群链接 / 群用户名</div>
                  <div className="mt-1 text-xs text-textMuted">支持 t.me 链接、@groupname、joinchat/+ 邀请链接</div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.03]">
                    <Upload size={13} />
                    导入 TXT
                    <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <button
                    type="button"
                    onClick={() => clearLinkInput()}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.03]"
                  >
                    清空
                  </button>
                </div>
              </div>
              <textarea
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="每行一个，例如：\nhttps://t.me/testgroup\n@testgroup\nhttps://t.me/+xxxxxx"
                className="min-h-[240px] w-full rounded-[14px] border border-white/10 bg-[#09101d] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/35"
              />
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-[14px] border border-emerald-400/12 bg-emerald-400/10 px-3 py-3 text-emerald-200">
                  <div className="text-xl font-semibold text-white">{summary.items.length}</div>
                  <div className="mt-1 text-xs">有效目标</div>
                </div>
                <div className="rounded-[14px] border border-amber-400/12 bg-amber-400/10 px-3 py-3 text-amber-200">
                  <div className="text-xl font-semibold text-white">{summary.duplicates.length}</div>
                  <div className="mt-1 text-xs">重复目标</div>
                </div>
                <div className="rounded-[14px] border border-rose-400/12 bg-rose-400/10 px-3 py-3 text-rose-200">
                  <div className="text-xl font-semibold text-white">{summary.invalids.length}</div>
                  <div className="mt-1 text-xs">无效目标</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void startTask()}
              disabled={running || !runtimeReady}
              className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-cyan-400 px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
              开始自动加群
            </button>
            <button
              type="button"
              onClick={() => void stopTask()}
              disabled={!running || stopping}
              className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-white/10 px-4 text-sm text-slate-100 transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? <LoaderCircle size={16} className="animate-spin" /> : <Square size={15} />}
              停止任务
            </button>
            <div className="rounded-[14px] border border-white/8 bg-panel px-4 py-3 text-sm text-slate-300">
              {lastActionMessage || '准备好之后直接开始，先做能跑版。'}
            </div>
          </div>
        </GlassPanel>
      </div>

      <div className="space-y-4">
        <GlassPanel header={<div className="text-base font-semibold text-white">当前概览</div>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
              <div className="text-2xl font-semibold text-white">{selectedAccounts.length}</div>
              <div className="mt-1 text-xs text-textMuted">已选账号</div>
            </div>
            <div className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
              <div className="text-2xl font-semibold text-white">{summary.items.length}</div>
              <div className="mt-1 text-xs text-textMuted">准备加群数</div>
            </div>
            <div className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
              <div className="text-2xl font-semibold text-white">{concurrency}</div>
              <div className="mt-1 text-xs text-textMuted">账号并发</div>
            </div>
            <div className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
              <div className="text-2xl font-semibold text-white">{intervalSeconds}s</div>
              <div className="mt-1 text-xs text-textMuted">每号间隔</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedAccounts.slice(0, 12).map((account) => (
              <span key={account.id} className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-200">
                {readAccountLabel(account)}
              </span>
            ))}
            {selectedAccounts.length > 12 ? <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-200">+{selectedAccounts.length - 12}</span> : null}
          </div>
        </GlassPanel>

        <GlassPanel header={<div className="text-base font-semibold text-white">任务历史</div>}>
          <div className="space-y-3">
            {tasks.length === 0 ? <div className="text-sm text-textMuted">还没有跑过自动加群任务。</div> : null}
            {tasks.map((task) => (
              <div key={task.id} className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{task.name}</div>
                    <div className="mt-1 text-xs text-textMuted">{task.startedAt ? formatDateTimeFull(task.startedAt) : '刚创建'}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${task.status === 'running' ? 'bg-cyan-400/12 text-cyan-200' : task.status === 'completed' ? 'bg-emerald-400/12 text-emerald-200' : task.status === 'stopped' ? 'bg-amber-400/12 text-amber-200' : 'bg-white/10 text-slate-200'}`}>
                    {task.status === 'running' ? '执行中' : task.status === 'completed' ? '已完成' : task.status === 'stopped' ? '已停止' : '草稿'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-[12px] bg-white/[0.04] px-2 py-2 text-slate-200">
                    <div className="text-lg font-semibold text-white">{task.total}</div>
                    <div>总数</div>
                  </div>
                  <div className="rounded-[12px] bg-emerald-400/10 px-2 py-2 text-emerald-200">
                    <div className="text-lg font-semibold text-white">{task.successCount}</div>
                    <div>加入成功</div>
                  </div>
                  <div className="rounded-[12px] bg-amber-400/10 px-2 py-2 text-amber-200">
                    <div className="text-lg font-semibold text-white">{task.alreadyCount}</div>
                    <div>已在群里</div>
                  </div>
                  <div className="rounded-[12px] bg-rose-400/10 px-2 py-2 text-rose-200">
                    <div className="text-lg font-semibold text-white">{task.failedCount}</div>
                    <div>失败</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-textMuted">{task.lastMessage}</div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  )
})

const LogsWorkbench = memo(function LogsWorkbench() {
  const logs = useAutoJoinStore((state) => state.logs)
  const clearLogs = useAutoJoinStore((state) => state.clearLogs)

  return (
    <GlassPanel
      header={
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-white">加群日志</div>
            <div className="mt-1 text-sm text-textMuted">这里只看执行结果，失败原因尽量说人话。</div>
          </div>
          <button
            type="button"
            onClick={clearLogs}
            className="rounded-[12px] border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.03]"
          >
            清空日志
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {logs.length === 0 ? <div className="text-sm text-textMuted">还没有加群日志。</div> : null}
        {logs.map((log) => (
          <div key={log.id} className={`rounded-[14px] border px-4 py-3 ${getLogTone(log)}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>{formatDateTimeFull(log.createdAt)}</span>
              {log.accountLabel ? <span className="rounded-full bg-black/10 px-2 py-1">{log.accountLabel}</span> : null}
              {log.groupTitle ? <span className="rounded-full bg-black/10 px-2 py-1">{log.groupTitle}</span> : null}
              {log.target ? <span className="rounded-full bg-black/10 px-2 py-1">{log.target}</span> : null}
            </div>
            <div className="mt-2 text-sm text-white">{log.message}</div>
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
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <GlassPanel
        header={
          <div>
            <div className="text-base font-semibold text-white">群链接整理</div>
            <div className="mt-1 text-sm text-textMuted">先把链接清干净，后面跑任务就省心很多。</div>
          </div>
        }
      >
        <textarea
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
          placeholder="把原始链接都贴这里，支持空格、逗号、换行混着贴。"
          className="min-h-[360px] w-full rounded-[14px] border border-white/10 bg-[#09101d] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/35"
        />
      </GlassPanel>

      <div className="space-y-4">
        <GlassPanel header={<div className="flex items-center justify-between gap-3"><span className="text-base font-semibold text-white">整理结果</span><button type="button" onClick={() => void copyCleaned()} className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/[0.03]"><Copy size={13} />复制有效链接</button></div>}>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-[14px] border border-emerald-400/12 bg-emerald-400/10 px-3 py-3 text-emerald-200">
              <div className="text-xl font-semibold text-white">{summary.items.length}</div>
              <div className="mt-1 text-xs">有效</div>
            </div>
            <div className="rounded-[14px] border border-amber-400/12 bg-amber-400/10 px-3 py-3 text-amber-200">
              <div className="text-xl font-semibold text-white">{summary.duplicates.length}</div>
              <div className="mt-1 text-xs">重复</div>
            </div>
            <div className="rounded-[14px] border border-rose-400/12 bg-rose-400/10 px-3 py-3 text-rose-200">
              <div className="text-xl font-semibold text-white">{summary.invalids.length}</div>
              <div className="mt-1 text-xs">无效</div>
            </div>
          </div>

          <div className="mt-4 rounded-[14px] border border-white/8 bg-panel p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><Link2 size={15} />有效目标</div>
            <div className="max-h-[240px] overflow-auto whitespace-pre-wrap text-sm text-slate-200">{cleaned || '还没有可用的群链接。'}</div>
          </div>
        </GlassPanel>

        <div className="grid gap-4 md:grid-cols-2">
          <GlassPanel header={<div className="text-sm font-medium text-white">重复目标</div>}>
            <div className="max-h-[220px] overflow-auto whitespace-pre-wrap text-sm text-amber-200">{summary.duplicates.join('\n') || '没有重复项。'}</div>
          </GlassPanel>
          <GlassPanel header={<div className="text-sm font-medium text-white">无效目标</div>}>
            <div className="max-h-[220px] overflow-auto whitespace-pre-wrap text-sm text-rose-200">{summary.invalids.join('\n') || '没有无效项。'}</div>
          </GlassPanel>
        </div>
      </div>
    </div>
  )
})

export default function AutoJoinView() {
  const activeTab = useAutoJoinStore((state) => state.activeTab)

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[24px] font-semibold text-white">自动加群</div>
          <div className="mt-2 text-sm text-textMuted">先把第一版做出来：导入群链接，选择账号，多号并发稳定加群，后面再继续优化。</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-2 text-emerald-200"><CheckCircle2 size={13} />支持 @username / t.me / 邀请链接</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-2 text-cyan-200"><Users size={13} />单号串行 + 多号并发</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-2 text-amber-200"><ShieldAlert size={13} />先做能跑版，后面再细抠风控</span>
        </div>
      </div>

      <TabBar />

      {activeTab === 'tasks' ? <TasksWorkbench /> : null}
      {activeTab === 'logs' ? <LogsWorkbench /> : null}
      {activeTab === 'links' ? <LinksWorkbench /> : null}
    </div>
  )
}
