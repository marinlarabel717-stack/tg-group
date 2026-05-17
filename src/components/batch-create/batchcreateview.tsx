import { CheckCircle2, ChevronDown, ChevronRight, Copy, PlusSquare, SquareTerminal, StopCircle } from 'lucide-react'
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GlassPanel } from '../common/glasspanel'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'
import { useBatchCreateStore, type BatchCreateTabKey } from '../../stores/batchcreatestore'

const tabs: Array<{ key: BatchCreateTabKey; label: string; icon: typeof PlusSquare }> = [
  { key: 'tasks', label: '创建任务', icon: PlusSquare },
  { key: 'logs', label: '执行日志', icon: SquareTerminal }
]

const SOFT_INPUT_CLASS = 'border border-white/[0.06] bg-black/10 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'

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
    <label className="block px-3 py-3 text-sm">
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="text-sm text-white">{label}</div>
          <div className="mt-1 text-xs text-textMuted">最小 - 最大（秒）</div>
        </div>
        <div className="flex max-w-[280px] items-center gap-2">
          <input type="number" min={min} max={max} value={minValue} onChange={(event) => onMinChange(Math.max(min, Number(event.target.value) || min))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          <span className="text-textMuted">-</span>
          <input type="number" min={min} max={max} value={maxValue} onChange={(event) => onMaxChange(Math.max(min, Number(event.target.value) || min))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
        </div>
      </div>
    </label>
  )
}

function FoldSection(props: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const { title, hint, defaultOpen = true, children } = props
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-white/[0.035] bg-black/[0.08] px-3.5 py-2.5 text-left transition hover:bg-white/[0.02]"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{title}</div>
          {hint ? <div className="mt-1 text-xs text-textMuted">{hint}</div> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-textMuted">
          <span>{open ? '收起' : '展开'}</span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      {open ? <div className="overflow-hidden rounded-[12px] border border-white/[0.03] bg-black/[0.06] divide-y divide-white/[0.035]">{children}</div> : null}
    </div>
  )
}

function ConfigRow(props: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  const { label, hint, children, wide = false } = props
  return (
    <div className="px-3 py-3 text-sm">
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="text-sm text-white">{label}</div>
          {hint ? <div className="mt-1 text-xs text-textMuted">{hint}</div> : null}
        </div>
        <div className={wide ? 'w-full' : 'w-full max-w-[280px]'}>{children}</div>
      </div>
    </div>
  )
}

function readAccountLabel(account: { id: number; username?: string; phone?: string; userId?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  if (account.userId?.trim()) return account.userId.trim()
  return `账号#${account.id}`
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

const TabBar = memo(function TabBar() {
  const activeTab = useBatchCreateStore((state) => state.activeTab)
  const setActiveTab = useBatchCreateStore((state) => state.setActiveTab)

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
            className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-300' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
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
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const init = useBatchCreateStore((state) => state.init)
  const selectedAccountIds = useBatchCreateStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useBatchCreateStore((state) => state.setSelectedAccountIds)
  const createMode = useBatchCreateStore((state) => state.createMode)
  const setCreateMode = useBatchCreateStore((state) => state.setCreateMode)
  const countPerAccount = useBatchCreateStore((state) => state.countPerAccount)
  const setCountPerAccount = useBatchCreateStore((state) => state.setCountPerAccount)
  const createIntervalMin = useBatchCreateStore((state) => state.createIntervalMin)
  const createIntervalMax = useBatchCreateStore((state) => state.createIntervalMax)
  const setCreateIntervalMin = useBatchCreateStore((state) => state.setCreateIntervalMin)
  const setCreateIntervalMax = useBatchCreateStore((state) => state.setCreateIntervalMax)
  const autoWaitOnFlood = useBatchCreateStore((state) => state.autoWaitOnFlood)
  const setAutoWaitOnFlood = useBatchCreateStore((state) => state.setAutoWaitOnFlood)
  const titleTemplate = useBatchCreateStore((state) => state.titleTemplate)
  const setTitleTemplate = useBatchCreateStore((state) => state.setTitleTemplate)
  const aboutTemplate = useBatchCreateStore((state) => state.aboutTemplate)
  const setAboutTemplate = useBatchCreateStore((state) => state.setAboutTemplate)
  const usernameTemplate = useBatchCreateStore((state) => state.usernameTemplate)
  const setUsernameTemplate = useBatchCreateStore((state) => state.setUsernameTemplate)
  const randomTitleEnabled = useBatchCreateStore((state) => state.randomTitleEnabled)
  const setRandomTitleEnabled = useBatchCreateStore((state) => state.setRandomTitleEnabled)
  const randomAboutEnabled = useBatchCreateStore((state) => state.randomAboutEnabled)
  const setRandomAboutEnabled = useBatchCreateStore((state) => state.setRandomAboutEnabled)
  const randomUsernameEnabled = useBatchCreateStore((state) => state.randomUsernameEnabled)
  const setRandomUsernameEnabled = useBatchCreateStore((state) => state.setRandomUsernameEnabled)
  const randomLength = useBatchCreateStore((state) => state.randomLength)
  const setRandomLength = useBatchCreateStore((state) => state.setRandomLength)
  const running = useBatchCreateStore((state) => state.running)
  const stopping = useBatchCreateStore((state) => state.stopping)
  const lastActionMessage = useBatchCreateStore((state) => state.lastActionMessage)
  const errorMessage = useBatchCreateStore((state) => state.errorMessage)
  const tasks = useBatchCreateStore((state) => state.tasks)
  const startTask = useBatchCreateStore((state) => state.startTask)
  const stopTask = useBatchCreateStore((state) => state.stopTask)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<number[]>(selectedAccountIds)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  useEffect(() => {
    if (!pickerOpen) {
      setDraftIds(selectedAccountIds)
    }
  }, [pickerOpen, selectedAccountIds])

  const filteredAccounts = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    if (!value) return accounts
    return accounts.filter((account) => [readAccountLabel(account), account.username || '', account.phone || ''].some((part) => part.toLowerCase().includes(value)))
  }, [accounts, keyword])
  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedAccountIds.includes(account.id)), [accounts, selectedAccountIds])
  const latestTask = tasks[0] ?? null
  const totalWillCreate = selectedAccountIds.length * countPerAccount * (createMode === 'both' ? 2 : 1)

  const applyPicker = () => {
    setSelectedAccountIds(draftIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
    setPickerOpen(false)
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="基础配置" hint="每个参数一行，需要时再展开改，不再堆一屏按钮。">
              <ConfigRow label="选择账号" hint="点右侧按钮挑选要拿来创建的账号。">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white">已选 {selectedAccountIds.length} 个账号</div>
                  <button type="button" disabled={running || stopping} onClick={() => setPickerOpen(true)} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">选择账号</button>
                </div>
              </ConfigRow>

              <ConfigRow label="创建类型" hint="公开群组、公开频道，或两种都建。">
                <select value={createMode} onChange={(event) => setCreateMode(event.target.value as typeof createMode)} disabled={running || stopping} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                  <option value="group" className="bg-white text-slate-950">公开群组</option>
                  <option value="channel" className="bg-white text-slate-950">公开频道</option>
                  <option value="both" className="bg-white text-slate-950">两种都建</option>
                </select>
              </ConfigRow>

              <ConfigRow label="单号创建数量" hint="每个账号本轮要创建多少个公开目标。">
                <input type="number" min={1} max={50} value={countPerAccount} onChange={(event) => setCountPerAccount(Number(event.target.value) || 1)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <NumberRangeField label="每次创建间隔" minValue={createIntervalMin} maxValue={createIntervalMax} onMinChange={setCreateIntervalMin} onMaxChange={setCreateIntervalMax} min={0} max={600} />

              <ConfigRow label="创建频繁自动等待" hint="Telegram 明确要求等多久，就按它要求的时间继续。">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{autoWaitOnFlood ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={autoWaitOnFlood} onChange={(event) => setAutoWaitOnFlood(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="预计创建" hint="按当前账号数和类型算出来的总量。">
                <div className="text-sm font-medium text-white">{totalWillCreate} 个</div>
              </ConfigRow>
            </FoldSection>

            <div className="mt-4" />

            <FoldSection title="自定义数据" hint="关闭随机后，就按你填写的数据创建；不会偷偷给自定义值补 accountId 或 index。" defaultOpen>
              <ConfigRow label="群名 / 频道名" hint="不勾随机时，默认直接用这里的内容。占位符可选，不强制。">
                <input value={titleTemplate} onChange={(event) => setTitleTemplate(event.target.value)} placeholder="例如：品牌交流群" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <ConfigRow label="公开链接" hint="不勾随机时，默认直接按这里创建公开链接。">
                <input value={usernameTemplate} onChange={(event) => setUsernameTemplate(event.target.value)} placeholder="例如：brandgroup01" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <ConfigRow label="简介" hint="不勾随机时，默认直接用这里的简介。" wide>
                <textarea value={aboutTemplate} onChange={(event) => setAboutTemplate(event.target.value)} rows={4} placeholder="例如：欢迎加入品牌交流群" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <ConfigRow label="随机群名 / 频道名">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomTitleEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomTitleEnabled} onChange={(event) => setRandomTitleEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机公开链接">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomUsernameEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomUsernameEnabled} onChange={(event) => setRandomUsernameEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机简介">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomAboutEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomAboutEnabled} onChange={(event) => setRandomAboutEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机位数" hint="只有启用随机群名或随机公开链接时才会用到。">
                <input type="number" min={4} max={24} value={randomLength} onChange={(event) => setRandomLength(Number(event.target.value) || 8)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <div className="rounded-[14px] bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                支持公开群组 / 公开频道。若公开链接撞名，系统只会在重试时补随机后缀，不会在第一次创建时私自改你的自定义值。
              </div>
            </FoldSection>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">任务操作</div>
            <div className="mt-3 space-y-3 text-sm text-textMuted">
              <div className="rounded-[14px] bg-panel/70 px-4 py-3">当前会创建 <span className="text-white">公开</span> 群/频道，不走私密链接。</div>
              <div className="rounded-[14px] bg-panel/70 px-4 py-3">若公开链接撞名，系统会自动换几次随机后缀再试。</div>
            </div>

            <div className="mt-4 grid gap-3">
              <button type="button" disabled={running || stopping || selectedAccountIds.length === 0} onClick={() => void startTask()} className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                <PlusSquare size={16} />
                开始批量创建
              </button>
              <button type="button" disabled={!running || stopping} onClick={() => void stopTask()} className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-rose-400/12 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-60">
                <StopCircle size={16} />
                {stopping ? '正在停止' : '停止任务'}
              </button>
            </div>

            <div className="mt-4 rounded-[16px] bg-panel/70 px-4 py-4 text-sm">
              <div className="text-xs tracking-[0.18em] text-textMuted">当前状态</div>
              <div className="mt-2 text-white">{lastActionMessage || '这里会显示最新执行状态。'}</div>
              {errorMessage ? <div className="mt-3 rounded-[12px] bg-rose-400/10 px-3 py-3 text-rose-200">{errorMessage}</div> : null}
            </div>

            {latestTask ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                  <div className="text-xs tracking-[0.16em] text-emerald-200/80">成功</div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-300">{latestTask.successCount}</div>
                </div>
                <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
                  <div className="text-xs tracking-[0.16em] text-rose-200/80">失败</div>
                  <div className="mt-2 text-2xl font-semibold text-rose-300">{latestTask.failedCount}</div>
                </div>
                <div className="rounded-[14px] bg-sky-400/8 px-4 py-3">
                  <div className="text-xs tracking-[0.16em] text-sky-200/80">公开群组</div>
                  <div className="mt-2 text-2xl font-semibold text-sky-300">{latestTask.groupCount}</div>
                </div>
                <div className="rounded-[14px] bg-violet-400/8 px-4 py-3">
                  <div className="text-xs tracking-[0.16em] text-violet-200/80">公开频道</div>
                  <div className="mt-2 text-2xl font-semibold text-violet-300">{latestTask.channelCount}</div>
                </div>
              </div>
            ) : null}
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">已选账号</div>
            <div className="mt-3 space-y-2">
              {selectedAccounts.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">还没选账号。</div> : selectedAccounts.map((account) => (
                <div key={account.id} className="rounded-[14px] bg-panel/70 px-4 py-3">
                  <div className="text-sm text-white">{readAccountLabel(account)}</div>
                  <div className="mt-1 text-xs text-textMuted">{formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/62 px-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-[920px] rounded-[20px] border border-white/[0.08] bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">选择创建账号</div>
                <div className="mt-1 text-sm text-textMuted">占用中的账号会自动禁选。</div>
              </div>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索账号 / 用户名 / 手机号" className={`h-11 w-full max-w-[280px] rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setDraftIds(filteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied).map((account) => account.id))} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">全选可用</button>
              <button type="button" onClick={() => setDraftIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">清空</button>
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
              {loading ? <div className="rounded-[14px] bg-panel/70 px-4 py-6 text-sm text-textMuted">正在加载账号...</div> : filteredAccounts.map((account) => {
                const occupied = getAccountTaskMeta(accountTaskStatusMap, account.id).occupied
                const checked = draftIds.includes(account.id)
                return (
                  <label key={account.id} className={`flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 ${occupied ? 'bg-white/[0.03] opacity-55' : 'bg-panel/70'}`}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" disabled={occupied} checked={checked} onChange={(event) => setDraftIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                      <div>
                        <div className="text-sm text-white">{readAccountLabel(account)}</div>
                        <div className="mt-1 text-xs text-textMuted">{account.phone || account.username || `账号#${account.id}`}</div>
                      </div>
                    </div>
                    <div className="text-xs text-textMuted">{occupied ? '占用中' : formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}</div>
                  </label>
                )
              })}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">取消</button>
              <button type="button" onClick={applyPicker} className="rounded-[12px] bg-violet-400 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-110">确认选择</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
})

const LogsPanel = memo(function LogsPanel() {
  const tasks = useBatchCreateStore((state) => state.tasks)
  const logs = useBatchCreateStore((state) => state.logs)
  const taskSnapshots = useBatchCreateStore((state) => state.taskSnapshots)
  const clearLogs = useBatchCreateStore((state) => state.clearLogs)

  const latestTask = tasks[0] ?? null
  const latestSnapshot = taskSnapshots[0] ?? null

  return (
    <div className="space-y-5">
      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold text-white">执行日志</div>
          <button type="button" onClick={clearLogs} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">清空日志</button>
        </div>

        {latestTask ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3"><div className="text-xs tracking-[0.16em] text-emerald-200/80">成功</div><div className="mt-2 text-2xl font-semibold text-emerald-300">{latestTask.successCount}</div></div>
            <div className="rounded-[14px] bg-rose-400/8 px-4 py-3"><div className="text-xs tracking-[0.16em] text-rose-200/80">失败</div><div className="mt-2 text-2xl font-semibold text-rose-300">{latestTask.failedCount}</div></div>
            <div className="rounded-[14px] bg-sky-400/8 px-4 py-3"><div className="text-xs tracking-[0.16em] text-sky-200/80">公开群组</div><div className="mt-2 text-2xl font-semibold text-sky-300">{latestTask.groupCount}</div></div>
            <div className="rounded-[14px] bg-violet-400/8 px-4 py-3"><div className="text-xs tracking-[0.16em] text-violet-200/80">公开频道</div><div className="mt-2 text-2xl font-semibold text-violet-300">{latestTask.channelCount}</div></div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {logs.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">这里还没有日志。</div> : logs.map((log) => (
            <div key={log.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={log.level === 'success' ? 'text-emerald-300' : log.level === 'error' ? 'text-rose-300' : 'text-slate-200'}>{log.message}</div>
                <div className="text-xs text-textMuted">{formatTime(log.createdAt)}</div>
              </div>
              {(log.accountLabel || log.targetLabel) ? <div className="mt-1 text-xs text-textMuted">{[log.accountLabel, log.targetLabel].filter(Boolean).join(' · ')}</div> : null}
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="text-base font-semibold text-white">本轮结果</div>
        <div className="mt-4 space-y-2">
          {!latestSnapshot || latestSnapshot.items.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">完成后这里会显示创建结果。</div> : latestSnapshot.items.map((item) => (
            <div key={item.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-white">{item.title || '未命名目标'} <span className="ml-2 text-xs text-textMuted">{item.entityType === 'group' ? '公开群组' : '公开频道'}</span></div>
                  <div className="mt-1 text-xs text-textMuted">{item.accountLabel}</div>
                </div>
                <div className={item.status === 'success' ? 'text-emerald-300' : 'text-rose-300'}>{item.status === 'success' ? '成功' : '失败'}</div>
              </div>
              <div className="mt-2 text-xs text-textMuted">{item.message}</div>
              {item.publicLink ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="rounded-[10px] bg-black/10 px-3 py-2 text-xs text-slate-200">{item.publicLink}</div>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(item.publicLink)} className="inline-flex items-center gap-1 rounded-[10px] bg-white/[0.05] px-3 py-2 text-xs text-white transition hover:bg-white/[0.08]"><Copy size={13} />复制</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  )
})

export default function BatchCreateView() {
  const activeTab = useBatchCreateStore((state) => state.activeTab)
  const taskSnapshots = useBatchCreateStore((state) => state.taskSnapshots)
  const completionDialogTaskId = useBatchCreateStore((state) => state.completionDialogTaskId)
  const closeCompletionDialog = useBatchCreateStore((state) => state.closeCompletionDialog)

  const completionSnapshot = useMemo(() => taskSnapshots.find((item) => item.taskId === completionDialogTaskId) ?? null, [completionDialogTaskId, taskSnapshots])

  return (
    <>
      <TabBar />
      <div className="mt-5">{activeTab === 'tasks' ? <TasksWorkbench /> : <LogsPanel />}</div>

      <ResultDialogShell
        open={Boolean(completionSnapshot)}
        onClose={closeCompletionDialog}
        title={completionSnapshot?.stopped ? '批量创建任务已停止' : '批量创建任务完成'}
        subtitle={completionSnapshot?.message || '这轮任务已经结束。'}
        icon={<CheckCircle2 size={18} />}
        tone={completionSnapshot?.stopped ? 'warning' : 'success'}
        maxWidth="max-w-[560px]"
      >
        <ResultHero label={completionSnapshot?.stopped ? '本轮已停止' : '本轮已完成'} value={`${completionSnapshot?.completed || 0} / ${completionSnapshot?.total || 0}`} tone={completionSnapshot?.stopped ? 'warning' : 'success'} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultStatCard label="成功" value={completionSnapshot?.successCount || 0} tone="success" />
          <ResultStatCard label="失败" value={completionSnapshot?.failedCount || 0} tone="danger" />
          <ResultStatCard label="公开群组" value={completionSnapshot?.groupCount || 0} tone="cyan" />
          <ResultStatCard label="公开频道" value={completionSnapshot?.channelCount || 0} tone="violet" />
        </div>
        <ResultPrimaryButton label="知道了" onClick={closeCompletionDialog} tone={completionSnapshot?.stopped ? 'warning' : 'success'} />
      </ResultDialogShell>
    </>
  )
}
