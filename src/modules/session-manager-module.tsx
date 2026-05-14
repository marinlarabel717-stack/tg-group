import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Clock3, Copy, FolderSearch2, Hash, Link2, ListFilter, Play, RadioTower, Square, Trash2, Upload } from 'lucide-react'
import { GlassPanel } from '../components/common/glasspanel'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../components/accounts/resultdialog'
import { useAccountStore } from '../stores/accountstore'
import { useDirectMessageStore } from '../stores/directmessagestore'
import { useUIStore } from '../stores/uistore'
import type {
  AccountRecord,
  CheckLogLevel,
  GroupCollectorFilterPayload,
  GroupCollectorLastSeenBucket,
  GroupCollectorMode,
  GroupCollectorRole,
  GroupCollectorTaskProgress,
  GroupCollectorTaskResult,
  GroupCollectorTaskStatus
} from '../types'

type CollectorTabKey = 'groups' | 'channels' | 'keywords' | 'logs'

type GroupSourceKind = 'username' | 'invite'

interface GroupSourceRecord {
  id: string
  raw: string
  normalized: string
  displayValue: string
  kind: GroupSourceKind
}

interface CollectorTaskLogView {
  id: string
  level: CheckLogLevel
  createdAt: string
  message: string
  accountPhone: string
  source: string
}

interface CollectorTaskView {
  id: string
  title: string
  status: GroupCollectorTaskStatus
  totalGroups: number
  processedGroups: number
  totalAccounts: number
  joinedCount: number
  successCount: number
  failedCount: number
  message: string
  logs: CollectorTaskLogView[]
  usernames: string[]
  result: GroupCollectorTaskResult | null
  selectedAccountIds: number[]
  groups: GroupSourceRecord[]
  createdAt: string
}

const tabs: Array<{ key: CollectorTabKey; label: string; icon: typeof FolderSearch2 }> = [
  { key: 'groups', label: '采集群组', icon: FolderSearch2 },
  { key: 'channels', label: '采集频道', icon: RadioTower },
  { key: 'keywords', label: '采集关键词', icon: Hash },
  { key: 'logs', label: '采集日志', icon: Clock3 }
]

const modeOptions: Array<{ value: GroupCollectorMode; label: string; description: string }> = [
  { value: 'public_members', label: '公开采集', description: '直接读取公开群成员列表。' },
  { value: 'hidden_history', label: '隐藏成员采集', description: '看不到成员时，改扫历史聊天发送者。' }
]

const roleOptions: Array<{ value: GroupCollectorRole; label: string }> = [
  { value: 'owner', label: '群主' },
  { value: 'admin', label: '管理员' }
]

const avatarOptions = [
  { value: 'has', label: '有头像' },
  { value: 'none', label: '无头像' }
] as const

const usernameOptions = [
  { value: 'has', label: '有用户名' },
  { value: 'none', label: '无用户名' }
] as const

const premiumOptions = [
  { value: 'premium', label: '有会员' },
  { value: 'normal', label: '无会员' }
] as const

const lastSeenOptions: Array<{ value: GroupCollectorLastSeenBucket; label: string }> = [
  { value: 'online', label: '在线' },
  { value: 'recent', label: '最近在线' },
  { value: 'week', label: '近一周' },
  { value: 'month', label: '近一月' },
  { value: 'offline', label: '离线/更早' }
]

const SOFT_INPUT_CLASS = 'border border-white/[0.06] bg-black/10 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'
const MAX_GROUPS_PER_ACCOUNT = 5

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function readAccountPhone(account: Pick<AccountRecord, 'phone'> | null | undefined) {
  const phone = account?.phone?.trim() || ''
  if (!phone) return ''
  return phone.startsWith('+') ? phone : `+${phone}`
}

function tokenizeText(input: string) {
  return input
    .split(/\r?\n|,|，|;|；|\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeGroupSource(input: string): Omit<GroupSourceRecord, 'id'> | null {
  const raw = input.trim()
  if (!raw) return null

  const inviteMatched = raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
  if (inviteMatched?.[1]) {
    const hash = inviteMatched[1].trim()
    return {
      raw,
      normalized: `invite:${hash.toLowerCase()}`,
      displayValue: `https://t.me/+${hash}`,
      kind: 'invite'
    }
  }

  const publicMatched = raw.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,})(?:\?.*)?$/i)
  if (publicMatched?.[1]) {
    const username = publicMatched[1].replace(/^@+/, '').trim()
    return {
      raw,
      normalized: `username:${username.toLowerCase()}`,
      displayValue: `@${username}`,
      kind: 'username'
    }
  }

  if (/^@?[A-Za-z0-9_]{5,}$/i.test(raw)) {
    const username = raw.replace(/^@+/, '').trim()
    return {
      raw,
      normalized: `username:${username.toLowerCase()}`,
      displayValue: `@${username}`,
      kind: 'username'
    }
  }

  return null
}

function appendGroupSources(current: GroupSourceRecord[], input: string) {
  const seen = new Set(current.map((item) => item.normalized))
  const next = [...current]
  let added = 0
  let duplicate = 0
  let invalid = 0

  tokenizeText(input).forEach((token) => {
    const normalized = normalizeGroupSource(token)
    if (!normalized) {
      invalid += 1
      return
    }
    if (seen.has(normalized.normalized)) {
      duplicate += 1
      return
    }
    seen.add(normalized.normalized)
    next.push({ id: createId('collector_group'), ...normalized })
    added += 1
  })

  return { next, added, duplicate, invalid }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function toggleSelection<T extends string>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-[12px] px-3 py-2 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-300' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
    >
      {label}
    </button>
  )
}

function getTaskTone(status: GroupCollectorTaskStatus) {
  if (status === 'completed') return 'text-emerald-300 bg-emerald-400/10'
  if (status === 'stopped') return 'text-amber-200 bg-amber-300/10'
  if (status === 'failed') return 'text-rose-300 bg-rose-400/10'
  return 'text-sky-300 bg-sky-400/10'
}

function TabBar({ activeTab, setActiveTab }: { activeTab: CollectorTabKey; setActiveTab: (tab: CollectorTabKey) => void }) {
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
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <GlassPanel>
      <div className="rounded-[16px] bg-panel/80 px-5 py-6">
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="mt-2 text-sm leading-6 text-textMuted">{description}</div>
      </div>
    </GlassPanel>
  )
}

export default function SessionManagerModule() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)

  const [activeTab, setActiveTab] = useState<CollectorTabKey>('groups')
  const [mode, setMode] = useState<GroupCollectorMode>('public_members')
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [groupInput, setGroupInput] = useState('')
  const [groupSources, setGroupSources] = useState<GroupSourceRecord[]>([])
  const [participantLimit, setParticipantLimit] = useState('')
  const [historyLimit, setHistoryLimit] = useState('1000')
  const [roleFilters, setRoleFilters] = useState<GroupCollectorRole[]>([])
  const [onlyBots, setOnlyBots] = useState(false)
  const [avatarFilters, setAvatarFilters] = useState<Array<'has' | 'none'>>([])
  const [usernameFilters, setUsernameFilters] = useState<Array<'has' | 'none'>>([])
  const [premiumFilters, setPremiumFilters] = useState<Array<'premium' | 'normal'>>([])
  const [lastSeenFilters, setLastSeenFilters] = useState<GroupCollectorLastSeenBucket[]>([])
  const [tasks, setTasks] = useState<CollectorTaskView[]>([])
  const [activeTaskId, setActiveTaskId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [hintMessage, setHintMessage] = useState('')
  const [resultDialog, setResultDialog] = useState<{ open: boolean; result: GroupCollectorTaskResult | null }>({ open: false, result: null })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void initAccounts()
  }, [initAccounts])

  useEffect(() => {
    const unsubscribe = window.desktopDirectMessage?.onGroupCollectorProgress((payload: GroupCollectorTaskProgress) => {
      setTasks((current) => {
        const existing = current.find((task) => task.id === payload.taskId)
        const nextTask: CollectorTaskView = {
          id: payload.taskId,
          title: existing?.title || `任务 ${current.length + 1}`,
          status: payload.status,
          totalGroups: payload.totalGroups,
          processedGroups: payload.processedGroups,
          totalAccounts: payload.totalAccounts,
          joinedCount: payload.joinedCount,
          successCount: payload.successCount,
          failedCount: payload.failedCount,
          message: payload.message,
          logs: payload.log ? [
            ...(existing?.logs || []),
            {
              id: payload.log.id,
              level: payload.log.level,
              createdAt: payload.log.createdAt,
              message: payload.log.message,
              accountPhone: payload.log.accountPhone,
              source: payload.log.source
            }
          ].slice(-600) : (existing?.logs || []),
          usernames: payload.result?.usernames || existing?.usernames || [],
          result: payload.result || existing?.result || null,
          selectedAccountIds: existing?.selectedAccountIds || [],
          groups: existing?.groups || [],
          createdAt: existing?.createdAt || new Date().toISOString()
        }

        if (!existing) {
          return [nextTask, ...current]
        }

        return [nextTask, ...current.filter((task) => task.id !== payload.taskId)]
      })

      if (payload.status === 'completed' || payload.status === 'stopped' || payload.status === 'failed') {
        if (payload.result) {
          setResultDialog({ open: true, result: payload.result })
        }
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const filters = useMemo<GroupCollectorFilterPayload>(() => ({
    roleFilters,
    onlyBots,
    avatarFilters,
    usernameFilters,
    premiumFilters,
    lastSeenFilters
  }), [avatarFilters, lastSeenFilters, onlyBots, premiumFilters, roleFilters, usernameFilters])

  const busyAccountIds = useMemo(() => new Set(
    tasks.filter((task) => task.status === 'running').flatMap((task) => task.selectedAccountIds)
  ), [tasks])

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account.id)),
    [accounts, selectedAccountIds]
  )

  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    return accounts.filter((account) => {
      if (!keyword) return true
      const label = `${readAccountLabel(account)} ${readAccountPhone(account)}`.toLowerCase()
      return label.includes(keyword)
    })
  }, [accountSearch, accounts])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) || tasks[0] || null,
    [activeTaskId, tasks]
  )

  useEffect(() => {
    if (!activeTaskId && tasks[0]) {
      setActiveTaskId(tasks[0].id)
    }
    if (activeTask && activeTask.id !== activeTaskId) {
      setActiveTaskId(activeTask.id)
    }
  }, [activeTask, activeTaskId, tasks])

  const canStart = selectedAccountIds.length > 0 && groupSources.length > 0 && !loading

  const applyGroupInput = (input: string) => {
    const { next, added, duplicate, invalid } = appendGroupSources(groupSources, input)
    setGroupSources(next)
    setGroupInput('')
    setHintMessage(`已添加 ${added} 个群${duplicate > 0 ? `，去重 ${duplicate} 个` : ''}${invalid > 0 ? `，过滤错误 ${invalid} 个` : ''}。`)
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    applyGroupInput(text)
  }

  const handleStart = async () => {
    setErrorMessage('')
    setHintMessage('')

    if (selectedAccountIds.length === 0) {
      setErrorMessage('请先选择采集账号。')
      return
    }
    if (groupSources.length === 0) {
      setErrorMessage('请先添加采集群列表。')
      return
    }
    if (groupSources.length > selectedAccountIds.length * MAX_GROUPS_PER_ACCOUNT) {
      setErrorMessage(`当前最多只能采集 ${selectedAccountIds.length * MAX_GROUPS_PER_ACCOUNT} 个群。默认一个账号最多 5 个群。`)
      return
    }

    const taskId = createId('collector_task')
    const taskTitle = `任务 ${tasks.length + 1}`

    setTasks((current) => [{
      id: taskId,
      title: taskTitle,
      status: 'running',
      totalGroups: groupSources.length,
      processedGroups: 0,
      totalAccounts: selectedAccountIds.length,
      joinedCount: 0,
      successCount: 0,
      failedCount: 0,
      message: '任务启动中...',
      logs: [],
      usernames: [],
      result: null,
      selectedAccountIds,
      groups: groupSources,
      createdAt: new Date().toISOString()
    }, ...current])
    setActiveTaskId(taskId)

    try {
      await window.desktopDirectMessage?.startGroupCollectorTask({
        taskId,
        accountIds: selectedAccountIds,
        sources: groupSources.map((item) => item.displayValue),
        mode,
        participantLimit: participantLimit.trim() ? Number(participantLimit) : undefined,
        historyLimit: historyLimit.trim() ? Number(historyLimit) : undefined,
        filters,
        maxGroupsPerAccount: MAX_GROUPS_PER_ACCOUNT
      })
      setActiveTab('logs')
      setHintMessage('采集任务已开始，已自动跳转到采集日志。')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      setTasks((current) => current.filter((task) => task.id !== taskId))
    }
  }

  const handleStopTask = async (taskId: string) => {
    try {
      const result = await window.desktopDirectMessage?.stopGroupCollectorTask(taskId)
      setHintMessage(result?.message || '已发送停止指令。')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const handleCopyToDirectMessage = async () => {
    if (!activeTask || activeTask.usernames.length === 0) {
      setErrorMessage('当前任务还没有可复制的 @username。')
      return
    }
    useDirectMessageStore.getState().importTargets(activeTask.usernames.join('\n'), { mode: 'append', source: 'collect' })
    useDirectMessageStore.getState().setActiveTab('send')
    useUIStore.getState().setActiveModule('direct-message')
    setHintMessage(`已把 ${activeTask.usernames.length} 个用户追加到私信用户列表。`)
  }

  const handleExportTxt = () => {
    if (!activeTask || activeTask.usernames.length === 0) {
      setErrorMessage('当前任务还没有可导出的 @username。')
      return
    }

    const content = `${activeTask.usernames.join('\r\n')}\r\n`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${activeTask.title.replace(/\s+/g, '_')}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setHintMessage('采集用户 TXT 已导出。')
  }

  const clearFilters = () => {
    setRoleFilters([])
    setOnlyBots(false)
    setAvatarFilters([])
    setUsernameFilters([])
    setPremiumFilters([])
    setLastSeenFilters([])
  }

  const clearCurrentTaskLogs = () => {
    if (!activeTask) return
    setTasks((current) => current.map((task) => task.id === activeTask.id ? { ...task, logs: [] } : task))
    setHintMessage('当前任务日志已清空。')
  }

  const clearGroups = () => {
    setGroupSources([])
    setGroupInput('')
    setHintMessage('采集群列表已清空。')
  }

  const summaryText = `已选 ${selectedAccountIds.length} 个账号，已添加 ${groupSources.length} 个群，默认一个账号最多 ${MAX_GROUPS_PER_ACCOUNT} 个群。`

  const groupTabContent = (
    <div className="space-y-5 contain-layout">
      {errorMessage ? (
        <GlassPanel className="bg-card py-0">
          <div className="text-sm font-medium text-white">{errorMessage}</div>
        </GlassPanel>
      ) : null}

      {!errorMessage && hintMessage ? (
        <GlassPanel className="bg-card py-0">
          <div className="text-sm font-medium text-white">{hintMessage}</div>
        </GlassPanel>
      ) : null}

      <GlassPanel>
        <div className="space-y-4">
          <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.18em] text-textMuted">采集账号</div>
                <div className="mt-2 text-sm text-white">{selectedAccounts.length > 0 ? `已选择 ${selectedAccounts.length} 个账号` : '点击选择账号'}</div>
              </div>
              <button
                type="button"
                onClick={() => setAccountPickerOpen((current) => !current)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-4 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
              >
                选择账号
                <ChevronDown size={15} className={`transition ${accountPickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {selectedAccounts.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAccounts.map((account) => (
                  <span key={account.id} className="inline-flex rounded-full bg-violet-400/10 px-3 py-1 text-xs text-violet-200">
                    {readAccountPhone(account) || readAccountLabel(account)}
                  </span>
                ))}
              </div>
            ) : null}

            {accountPickerOpen ? (
              <div className="mt-4 rounded-[16px] bg-black/10 px-4 py-4">
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="搜索手机号 / 用户名"
                  className={`h-11 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
                />
                <div className="mt-3 max-h-[260px] space-y-2 overflow-auto pr-1">
                  {filteredAccounts.map((account) => {
                    const active = selectedAccountIds.includes(account.id)
                    const busy = busyAccountIds.has(account.id) && !active
                    return (
                      <button
                        key={account.id}
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedAccountIds((current) => current.includes(account.id) ? current.filter((item) => item !== account.id) : [...current, account.id])}
                        className={`flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left text-sm transition ${busy ? 'cursor-not-allowed bg-white/[0.03] text-white/28' : active ? 'bg-violet-400/10 text-violet-200' : 'bg-panel text-slate-200 hover:bg-white/[0.03]'}`}
                      >
                        <div>
                          <div className="font-medium text-white">{readAccountPhone(account) || readAccountLabel(account)}</div>
                          <div className="mt-1 text-xs text-textMuted">{readAccountLabel(account)}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {busy ? <span className="text-amber-200">任务占用中</span> : null}
                          {active ? <Check size={14} /> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.18em] text-textMuted">采集群列表</div>
                <div className="mt-2 text-sm text-white">支持直接粘贴一批群链接，也支持导入 txt。</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <Upload size={14} />
                  导入TXT
                </button>
                <button
                  type="button"
                  onClick={clearGroups}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <Trash2 size={14} />
                  清空群列表
                </button>
              </div>
            </div>

            <textarea
              value={groupInput}
              onChange={(event) => setGroupInput(event.target.value)}
              placeholder="支持 @用户名、公开链接、私密邀请链接；可直接粘贴多行"
              className={`mt-4 min-h-[120px] w-full rounded-[14px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => applyGroupInput(groupInput)}
                disabled={!groupInput.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-violet-300/16 bg-violet-400/10 px-4 text-sm font-medium text-violet-200 transition hover:bg-violet-400/16 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Link2 size={15} />
                添加群列表
              </button>
              <div className="text-sm text-textMuted">已识别 {groupSources.length} 个群，自动去重并过滤格式错误。</div>
            </div>

            <div className="mt-4 max-h-[220px] space-y-2 overflow-auto pr-1">
              {groupSources.length === 0 ? (
                <div className="rounded-[14px] bg-black/10 px-4 py-6 text-sm text-textMuted">这里会显示本次要采集的群列表。</div>
              ) : groupSources.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-[12px] bg-black/10 px-4 py-3 text-sm text-white">
                  <div className="min-w-0 truncate">{item.displayValue}</div>
                  <button
                    type="button"
                    onClick={() => setGroupSources((current) => current.filter((entry) => entry.id !== item.id))}
                    className="ml-3 text-textMuted transition hover:text-white"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
              <div className="text-xs tracking-[0.18em] text-textMuted">采集类型</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={`rounded-[14px] px-4 py-4 text-left ${SOFT_TAB_CLASS} ${mode === option.value ? 'border-white/[0.12] bg-violet-400/10 text-violet-300' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
                  >
                    <div className="text-sm font-medium text-white">{option.label}</div>
                    <div className="mt-2 text-xs leading-5 text-textMuted">{option.description}</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="rounded-[14px] bg-black/10 px-4 py-4 text-sm">
                  <div className="text-xs tracking-[0.18em] text-textMuted">公开采集数量</div>
                  <input
                    value={participantLimit}
                    onChange={(event) => setParticipantLimit(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="留空尽量全量"
                    className={`mt-3 h-11 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
                  />
                </label>
                <label className="rounded-[14px] bg-black/10 px-4 py-4 text-sm">
                  <div className="text-xs tracking-[0.18em] text-textMuted">隐藏成员历史消息数</div>
                  <input
                    value={historyLimit}
                    onChange={(event) => setHistoryLimit(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="例如 1000"
                    className={`mt-3 h-11 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs tracking-[0.18em] text-textMuted">过滤条件</div>
                  <div className="mt-2 text-sm text-white">不勾就不参与过滤。</div>
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <ListFilter size={14} />
                  清空筛选
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">身份</div>
                  <div className="flex flex-wrap gap-2">
                    {roleOptions.map((item) => (
                      <FilterChip key={item.value} active={roleFilters.includes(item.value)} label={item.label} onClick={() => setRoleFilters((current) => toggleSelection(current, item.value))} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">账号类型</div>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip active={onlyBots} label="机器人" onClick={() => setOnlyBots((current) => !current)} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">头像</div>
                  <div className="flex flex-wrap gap-2">
                    {avatarOptions.map((item) => (
                      <FilterChip key={item.value} active={avatarFilters.includes(item.value)} label={item.label} onClick={() => setAvatarFilters((current) => toggleSelection(current, item.value))} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">用户名</div>
                  <div className="flex flex-wrap gap-2">
                    {usernameOptions.map((item) => (
                      <FilterChip key={item.value} active={usernameFilters.includes(item.value)} label={item.label} onClick={() => setUsernameFilters((current) => toggleSelection(current, item.value))} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">会员</div>
                  <div className="flex flex-wrap gap-2">
                    {premiumOptions.map((item) => (
                      <FilterChip key={item.value} active={premiumFilters.includes(item.value)} label={item.label} onClick={() => setPremiumFilters((current) => toggleSelection(current, item.value))} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">在线时间</div>
                  <div className="flex flex-wrap gap-2">
                    {lastSeenOptions.map((item) => (
                      <FilterChip key={item.value} active={lastSeenFilters.includes(item.value)} label={item.label} onClick={() => setLastSeenFilters((current) => toggleSelection(current, item.value))} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void handleStart()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-violet-300/16 bg-violet-400/10 px-4 text-sm font-medium text-violet-200 transition hover:bg-violet-400/16 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={15} />
              开始采集
            </button>
            <div className="text-sm text-textMuted">{summaryText}</div>
          </div>
        </div>
      </GlassPanel>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          void handleImportFile(file)
          event.currentTarget.value = ''
        }}
      />
    </div>
  )

  const logsTabContent = (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <GlassPanel>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">采集任务</div>
              <div className="mt-1 text-xs text-textMuted">可同时查看任务 1、任务 2 的日志。</div>
            </div>
            <div className="text-xs text-textMuted">进行中 {tasks.filter((task) => task.status === 'running').length}</div>
          </div>

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="rounded-[14px] bg-panel/80 px-4 py-6 text-sm text-textMuted">还没有采集任务，先去“采集群组”页发起任务。</div>
            ) : tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setActiveTaskId(task.id)}
                className={`w-full rounded-[14px] px-4 py-4 text-left transition ${activeTask?.id === task.id ? 'bg-violet-400/10' : 'bg-panel/80 hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{task.title}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${getTaskTone(task.status)}`}>{task.status === 'running' ? '进行中' : task.status === 'completed' ? '已完成' : task.status === 'stopped' ? '已停止' : '失败'}</span>
                </div>
                <div className="mt-2 text-xs text-textMuted">{task.totalAccounts} 个账号 / {task.totalGroups} 个群</div>
                <div className="mt-1 text-xs text-textMuted">成功 {task.successCount} / 失败 {task.failedCount}</div>
              </button>
            ))}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel>
        {!activeTask ? (
          <div className="rounded-[14px] bg-panel/80 px-4 py-10 text-sm text-textMuted">先选择一个任务查看日志。</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-white">{activeTask.title}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${getTaskTone(activeTask.status)}`}>{activeTask.status === 'running' ? '进行中' : activeTask.status === 'completed' ? '已完成' : activeTask.status === 'stopped' ? '已停止' : '失败'}</span>
                </div>
                <div className="mt-2 text-sm text-textMuted">{activeTask.message}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <Upload size={14} />
                  导出采集用户TXT
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyToDirectMessage()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <Copy size={14} />
                  一键复制到私信用户列表
                </button>
                <button
                  type="button"
                  disabled={activeTask.status !== 'running'}
                  onClick={() => void handleStopTask(activeTask.id)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-amber-300/14 bg-amber-300/10 px-3 text-sm text-amber-200 transition hover:bg-amber-300/14 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Square size={14} />
                  停止任务
                </button>
                <button
                  type="button"
                  onClick={clearCurrentTaskLogs}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-panel px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                >
                  <Trash2 size={14} />
                  清空日志
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.16em] text-textMuted">已加入群</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeTask.joinedCount}</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.16em] text-textMuted">成功采集用户</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeTask.successCount}</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.16em] text-textMuted">失败群数</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeTask.failedCount}</div>
              </div>
            </div>

            <div className="rounded-[14px] bg-panel/80 px-4 py-4 text-sm text-textMuted">
              进度：{activeTask.processedGroups} / {activeTask.totalGroups} 个群，账号 {activeTask.totalAccounts} 个。
            </div>

            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {activeTask.logs.length === 0 ? (
                <div className="rounded-[14px] bg-panel/80 px-4 py-6 text-sm text-textMuted">当前任务还没有日志。</div>
              ) : activeTask.logs.map((log) => (
                <div key={log.id} className="rounded-[14px] bg-panel/80 px-4 py-3 text-sm text-slate-200">
                  <div className="leading-6 text-white">[{formatTime(log.createdAt)}] {log.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  )

  const tabContent = useMemo(() => {
    if (activeTab === 'groups') return groupTabContent
    if (activeTab === 'channels') return <PlaceholderTab title="采集频道" description="频道采集下一轮再接，后面按评论用户 / 反应用户继续做。" />
    if (activeTab === 'keywords') return <PlaceholderTab title="采集关键词" description="关键词采集下一轮再接，后面按指定来源 + 关键词命中消息发送者来做。" />
    return logsTabContent
  }, [activeTab, groupTabContent, logsTabContent])

  return (
    <>
      <div className="space-y-5 contain-layout">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        {tabContent}
      </div>

      <ResultDialogShell
        open={resultDialog.open && Boolean(resultDialog.result)}
        onClose={() => setResultDialog({ open: false, result: null })}
        title="采集完成"
        subtitle="本次采集结果如下"
        icon={<Check size={18} />}
        tone={resultDialog.result?.status === 'completed' ? 'success' : 'warning'}
        maxWidth="max-w-[440px]"
      >
        <ResultHero
          label="采集结果"
          value={resultDialog.result ? `成功采集 ${resultDialog.result.successCount} 个去重用户` : '0'}
          tone={resultDialog.result?.status === 'completed' ? 'success' : 'warning'}
        />

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <ResultStatCard label="已加入群" value={resultDialog.result?.joinedCount ?? 0} tone="info" />
          <ResultStatCard label="成功采集用户" value={resultDialog.result?.successCount ?? 0} tone="success" />
          <ResultStatCard label="失败" value={resultDialog.result?.failedCount ?? 0} tone="warning" />
        </div>

        <ResultPrimaryButton
          label="知道了"
          onClick={() => setResultDialog({ open: false, result: null })}
          tone={resultDialog.result?.status === 'completed' ? 'success' : 'warning'}
        />
      </ResultDialogShell>
    </>
  )
}
