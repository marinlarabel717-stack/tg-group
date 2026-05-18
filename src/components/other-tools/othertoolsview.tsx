import { Copy, Filter, ImageIcon, Loader2, Radar, Search, SquareTerminal, Type, X } from 'lucide-react'
import { type ChangeEvent, memo, useEffect, useMemo, useState } from 'react'
import type { AccountRecord, BatchCreatePostType, OtherToolsSniperCandidateItem, OtherToolsSniperListenerState, OtherToolsSourceSubscribeItem, OtherToolsUsernameFilterItem, OtherToolsUsernameFilterResult } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'
import { useUIStore } from '../../stores/uistore'
import { useOtherToolsStore } from '../../stores/othertoolsstore'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_SELECT_OPTION_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'

type OtherToolsTabKey = 'filter' | 'sniper'

const tabs: Array<{ key: OtherToolsTabKey; label: string; icon: typeof Filter }> = [
  { key: 'filter', label: '筛选', icon: Filter },
  { key: 'sniper', label: '抢注系统', icon: Radar }
]

function createEmptySniperListenerState(message = '监听未启动。'): OtherToolsSniperListenerState {
  return {
    running: false,
    scanAccountId: null,
    scanAccountLabel: '',
    claimAccountId: null,
    claimAccountLabel: '',
    createCarrierAccountId: null,
    createCarrierAccountLabel: '',
    pollIntervalSeconds: 15,
    sourceCount: 0,
    expandedSourceCount: 0,
    checkedMessageCount: 0,
    candidateCount: 0,
    claimedCount: 0,
    createdCarrierCount: 0,
    seenMessageCount: 0,
    startedAt: null,
    lastTickAt: null,
    logs: [],
    message
  }
}

function splitPreviewInput(input: string) {
  return input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function PostTypeTabs({ value, onChange }: { value: BatchCreatePostType; onChange: (value: BatchCreatePostType) => void }) {
  const items = [
    { value: 'none' as const, label: '不发', icon: SquareTerminal },
    { value: 'text' as const, label: '纯文', icon: Type },
    { value: 'photo' as const, label: '图文', icon: ImageIcon }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-200' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
          >
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

const TabBar = memo(function TabBar(props: { activeTab: OtherToolsTabKey; onChange: (tab: OtherToolsTabKey) => void }) {
  const { activeTab, onChange } = props
  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = activeTab === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
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

function readKindLabel(item: OtherToolsUsernameFilterItem | OtherToolsSniperCandidateItem) {
  if (item.kind === 'link') return '链接'
  return '用户名'
}

function readEntityLabel(item: OtherToolsUsernameFilterItem | OtherToolsSniperCandidateItem) {
  if (item.entityType === 'user') return '真实用户'
  if (item.entityType === 'bot') return '机器人'
  if (item.entityType === 'group') return '群组'
  if (item.entityType === 'channel') return '频道'
  return '未细分'
}

function copyLines(lines: string[]) {
  const content = lines.join('\n').trim()
  if (!content) return Promise.resolve()
  return navigator.clipboard.writeText(content)
}

function ResultBlock(props: { title: string; items: OtherToolsUsernameFilterItem[]; tone: string }) {
  const { title, items, tone } = props

  const copyAll = async () => {
    await copyLines(items.map((item) => item.normalized || item.raw))
  }

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-textMuted">共 {items.length} 条</div>
        </div>
        <button type="button" onClick={() => void copyAll()} disabled={items.length === 0} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
          <Copy size={14} />
          复制
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {items.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">当前没有内容。</div> : items.map((item, index) => (
          <div key={`${title}_${index}_${item.raw}`} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-white break-all">{item.raw}</div>
              <div className={`text-xs ${tone}`}>{readKindLabel(item)} / {readEntityLabel(item)}</div>
            </div>
            <div className="mt-2 text-xs text-textMuted">{item.reason}</div>
            {item.normalized && item.normalized !== item.raw ? <div className="mt-2 rounded-[10px] bg-black/10 px-3 py-2 text-xs text-slate-200 break-all">整理后：{item.normalized}</div> : null}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function FilterWorkbench() {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [summary, setSummary] = useState<OtherToolsUsernameFilterResult | null>(null)
  const previewItems = useMemo(() => splitPreviewInput(input), [input])

  const handleRun = async () => {
    const api = window.desktopOtherTools
    const trimmed = input.trim()
    if (!trimmed) {
      setSummary(null)
      setErrorMessage('先贴一点用户名或 t.me 链接再筛。')
      return
    }
    if (!api) {
      setErrorMessage('当前运行环境不支持 Telegram 实查。')
      return
    }

    setRunning(true)
    setErrorMessage('')
    try {
      const result = await api.filterUsernames({ input: trimmed })
      setSummary(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message || '筛选失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <GlassPanel className="bg-card">
          <FoldSection title="筛选配置" hint="这次改成 Telegram 实查，不再只按字符串格式猜。">
            <ConfigRow label="原始内容" hint="一行一个，支持 @username / username / t.me/username / https://t.me/username。" wide>
              <div className="space-y-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={14}
                  placeholder="一行一个，支持 @username / username / https://t.me/username / t.me/username"
                  className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-textMuted">当前待查 {previewItems.length} 条。会自动清洗后再用 Telegram 实查。</div>
                  <button
                    type="button"
                    onClick={() => void handleRun()}
                    disabled={running || previewItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />}
                    {running ? '正在实查…' : '开始筛选'}
                  </button>
                </div>
                {errorMessage ? <div className="rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{errorMessage}</div> : null}
                {summary?.message ? <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.12] px-3 py-2 text-xs text-textMuted">{summary.message}</div> : null}
              </div>
            </ConfigRow>
          </FoldSection>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="统计" hint="直接按你要的三类出结果。">
              <div className="space-y-3 px-3 py-3 text-sm">
                <div className="text-sm text-white">数量统计</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-emerald-200/80">有效用户名</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{summary?.valid.length ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-cyan-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-cyan-200/80">可占位用户名</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-300">{summary?.occupiable.length ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-rose-200/80">无效且不可占位</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-300">{summary?.forbidden.length ?? 0}</div>
                  </div>
                </div>
              </div>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="规则说明" hint="现在按 Telegram 实际状态分，不再单纯看格式。" defaultOpen={false}>
              <div className="space-y-3 px-3 py-3 text-sm">
                <div className="text-sm text-white">分类口径</div>
                <div className="space-y-2 text-sm text-textMuted">
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">有效用户名：</span>已经能查到真实目标，或这个公开用户名当前已被占用。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">可占位用户名：</span>当前没人占用，或者清洗后可以继续拿来占位。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">无效且不可占位：</span>违禁、保留、规则不允许，或根本整理不成合法用户名。</div>
                </div>
              </div>
            </FoldSection>
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ResultBlock title="有效用户名（存在真实用户）" items={summary?.valid ?? []} tone="text-emerald-300" />
        <ResultBlock title="可占位用户名" items={summary?.occupiable ?? []} tone="text-cyan-300" />
        <ResultBlock title="无效用户但不可占位" items={summary?.forbidden ?? []} tone="text-rose-300" />
      </div>
    </div>
  )
}

function readAccountOptionLabel(account: AccountRecord) {
  const display = account.username ? `@${account.username}` : account.phone || `ID ${account.id}`
  return `${display} · ${account.id}`
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

function readSniperCategoryLabel(item: OtherToolsSniperCandidateItem) {
  if (item.category === 'occupied') return '已占用'
  if (item.category === 'claimable') return '可抢注'
  if (item.category === 'forbidden') return '不可用'
  return '未确认'
}

function readSniperClaimTone(item: OtherToolsSniperCandidateItem) {
  if (item.claimStatus === 'claimed') return 'text-emerald-300'
  if (item.claimStatus === 'failed') return 'text-rose-300'
  if (item.claimStatus === 'skipped') return 'text-amber-200'
  if (item.category === 'claimable') return 'text-cyan-300'
  if (item.category === 'occupied') return 'text-emerald-300'
  if (item.category === 'forbidden') return 'text-rose-300'
  return 'text-slate-300'
}

function SniperResultBlock(props: { title: string; items: OtherToolsSniperCandidateItem[] }) {
  const { title, items } = props

  const copyAll = async () => {
    await copyLines(items.map((item) => item.normalized || item.raw))
  }

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-textMuted">共 {items.length} 条</div>
        </div>
        <button type="button" onClick={() => void copyAll()} disabled={items.length === 0} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
          <Copy size={14} />
          复制
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">当前没有内容。</div> : items.map((item) => (
          <div key={item.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-white break-all">{item.normalized || item.raw}</div>
              <div className={`text-xs ${readSniperClaimTone(item)}`}>{readSniperCategoryLabel(item)} / {readKindLabel(item)} / {readEntityLabel(item)}</div>
            </div>
            <div className="mt-2 text-xs text-textMuted">{item.reason}</div>
            <div className="mt-2 text-xs text-textMuted">来源：{item.sourceTitle} · {item.sourceRef}</div>
            <div className="mt-1 text-xs text-slate-300">摘录：{item.sourceExcerpt}</div>
            {item.claimMessage ? <div className="mt-2 rounded-[10px] bg-black/10 px-3 py-2 text-xs text-slate-200 break-all">{item.claimMessage}</div> : null}
            {item.claimTargetRef ? <div className="mt-2 text-xs text-cyan-200 break-all">抢注结果：{item.claimTargetRef}</div> : null}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function SubscribeResultBlock(props: { title: string; items: OtherToolsSourceSubscribeItem[] }) {
  const { title, items } = props

  const copyAll = async () => {
    await copyLines(items.map((item) => `${item.accountLabel} | ${item.sourceRef} | ${item.message}`))
  }

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-textMuted">共 {items.length} 条</div>
        </div>
        <button type="button" onClick={() => void copyAll()} disabled={items.length === 0} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
          <Copy size={14} />
          复制
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">当前没有内容。</div> : items.map((item) => (
          <div key={item.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-white break-all">{item.accountLabel} → {item.sourceTitle}</div>
              <div className={`text-xs ${item.status === 'joined' ? 'text-emerald-300' : item.status === 'already' ? 'text-cyan-300' : item.status === 'failed' ? 'text-rose-300' : 'text-amber-200'}`}>{item.status === 'joined' ? '已加入' : item.status === 'already' ? '已在内' : item.status === 'failed' ? '失败' : '跳过'}</div>
            </div>
            <div className="mt-2 text-xs text-textMuted break-all">{item.sourceRef}</div>
            <div className="mt-2 text-xs text-slate-300">{item.message}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function SniperWorkbench() {
  const accountTaskStatusMap = useAccountTaskStatusMap()
  const setActiveModule = useUIStore((state) => state.setActiveModule)
  const setLogsContext = useUIStore((state) => state.setLogsContext)
  const initOtherToolsStore = useOtherToolsStore((state) => state.init)
  const listenerState = useOtherToolsStore((state) => state.listenerState)
  const setListenerState = useOtherToolsStore((state) => state.setListenerState)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [sourceInput, setSourceInput] = useState('')
  const [poolInput, setPoolInput] = useState('')
  const [includeKeywords, setIncludeKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [scanAccountId, setScanAccountId] = useState('')
  const [claimAccountId, setClaimAccountId] = useState('')
  const [subscribeAccountIds, setSubscribeAccountIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftSubscribeIds, setDraftSubscribeIds] = useState<number[]>([])
  const [subscribeKeyword, setSubscribeKeyword] = useState('')
  const [subscribeRangeStart, setSubscribeRangeStart] = useState('1')
  const [subscribeRangeEnd, setSubscribeRangeEnd] = useState('10')
  const [sourceMessageLimit, setSourceMessageLimit] = useState(20)
  const [candidateLimit, setCandidateLimit] = useState(80)
  const [autoClaim, setAutoClaim] = useState(true)
  const [autoSubscribeSources, setAutoSubscribeSources] = useState(true)
  const [listenerPollSeconds, setListenerPollSeconds] = useState(15)
  const [autoCreateCarrier, setAutoCreateCarrier] = useState(true)
  const [createCarrierAccountId, setCreateCarrierAccountId] = useState('')
  const [createCarrierTitleTemplate, setCreateCarrierTitleTemplate] = useState('监听占位_{candidate}')
  const [createCarrierAboutTemplate, setCreateCarrierAboutTemplate] = useState('自动监听命中 {candidate} 后创建的占位频道。')
  const [postType, setPostType] = useState<BatchCreatePostType>('none')
  const [postText, setPostText] = useState('')
  const [postImageData, setPostImageData] = useState('')

  useEffect(() => {
    let active = true
    const api = window.desktopAccounts
    if (!api) return
    api.list()
      .then((result) => {
        if (active && Array.isArray(result)) {
          setAccounts(result)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    initOtherToolsStore()
  }, [initOtherToolsStore])

  useEffect(() => {
    if (!pickerOpen) {
      setDraftSubscribeIds(subscribeAccountIds)
      setSubscribeKeyword('')
    }
  }, [pickerOpen, subscribeAccountIds])

  useEffect(() => {
    if (!pickerOpen) return
    setSubscribeRangeStart('1')
    setSubscribeRangeEnd(String(Math.min(10, Math.max(accounts.length, 1))))
  }, [pickerOpen, accounts.length])

  const sourcePreviewCount = useMemo(() => splitPreviewInput(sourceInput).length, [sourceInput])
  const poolPreviewCount = useMemo(() => splitPreviewInput(poolInput).length, [poolInput])
  const subscribeSelectedAccounts = useMemo(() => accounts.filter((account) => subscribeAccountIds.includes(account.id)), [accounts, subscribeAccountIds])
  const subscribeFilteredAccounts = useMemo(() => {
    const value = subscribeKeyword.trim().toLowerCase()
    if (!value) return accounts
    return accounts.filter((account) => [readAccountOptionLabel(account), account.username || '', account.phone || ''].some((part) => part.toLowerCase().includes(value)))
  }, [accounts, subscribeKeyword])
  const selectableSubscribeAccounts = useMemo(
    () => subscribeFilteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, subscribeFilteredAccounts]
  )
  const listening = Boolean(listenerState?.running)

  const openSniperLogs = () => {
    setLogsContext('other-tools-sniper')
    setActiveModule('logs')
  }

  const applySubscribePicker = () => {
    setSubscribeAccountIds(draftSubscribeIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
    setPickerOpen(false)
  }

  const handlePostImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPostImageData(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleStartListener = async () => {
    const api = window.desktopOtherTools
    if (!api) {
      setListenerState(createEmptySniperListenerState('当前运行环境不支持监听任务。'))
      return
    }
    if (!sourceInput.trim()) {
      setListenerState(createEmptySniperListenerState('先填白名单来源，再启动监听。'))
      return
    }

    setListenerState({
      ...(listenerState ?? createEmptySniperListenerState('实时监听启动中…')),
      running: false,
      message: '实时监听启动中…'
    })
    openSniperLogs()
    try {
      const state = await api.startSniperListener({
        sourceInput,
        poolInput,
        includeKeywords,
        excludeKeywords,
        scanAccountId: scanAccountId ? Number(scanAccountId) : null,
        claimAccountId: claimAccountId ? Number(claimAccountId) : null,
        subscribeAccountIds,
        sourceMessageLimit,
        candidateLimit,
        autoClaim,
        autoSubscribeSources,
        pollIntervalSeconds: listenerPollSeconds,
        autoCreateCarrier,
        createCarrierAccountId: createCarrierAccountId ? Number(createCarrierAccountId) : null,
        createCarrierTitleTemplate,
        createCarrierAboutTemplate,
        postType,
        postText,
        postImageData
      })
      setListenerState(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setListenerState({
        ...(listenerState ?? createEmptySniperListenerState(message || '启动监听失败')),
        running: false,
        message: message || '启动监听失败'
      })
    }
  }

  const handleStopListener = async () => {
    const api = window.desktopOtherTools
    if (!api) return
    try {
      const result = await api.stopSniperListener()
      setListenerState(createEmptySniperListenerState(result.message || '监听任务已停止。'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setListenerState({
        ...(listenerState ?? createEmptySniperListenerState(message || '停止监听失败')),
        running: false,
        message: message || '停止监听失败'
      })
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <GlassPanel className="bg-card">
          <FoldSection title="傻瓜式设置" hint="就按下面 4 步填，别的默认不用管。">
            <ConfigRow label="最简单用法" wide>
              <div className="space-y-2 text-sm text-textMuted">
                <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">1.</span> 把你要盯的频道 / 群 / addlist 链接贴进去。</div>
                <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">2.</span> 选一批账号先去加入这些来源。</div>
                <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">3.</span> 账号不懂就留空，系统会自动从账号池挑能用的。</div>
                <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">4.</span> 点 <span className="text-emerald-200">开始监听</span>，后面就一直盯新帖；命中可抢名会自动抢，池子不够就自动新建频道。</div>
              </div>
            </ConfigRow>
            <ConfigRow label="监听哪些来源" hint="一行一个。支持频道、群、机器人链接，也支持 t.me/addlist/...。" wide>
              <div className="space-y-2">
                <textarea value={sourceInput} onChange={(event) => setSourceInput(event.target.value)} rows={8} placeholder="例如：@channel_name\nhttps://t.me/xxxx_channel\nhttps://t.me/addlist/xxxxxx" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
                <div className="text-xs text-textMuted">当前 {sourcePreviewCount} 个来源。</div>
              </div>
            </ConfigRow>
            <ConfigRow label="先去加入来源的账号" hint="这些账号会先把来源加进去，后面监听更稳。" wide>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white">已选 {subscribeSelectedAccounts.length} 个账号</div>
                  <button type="button" onClick={() => setPickerOpen(true)} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">选择账号</button>
                </div>
                {subscribeSelectedAccounts.length === 0 ? (
                  <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 py-3 text-sm text-textMuted">还没选账号。</div>
                ) : (
                  <div className="space-y-2 rounded-[12px] border border-white/[0.06] bg-black/[0.08] p-3">
                    {subscribeSelectedAccounts.slice(0, 6).map((account) => {
                      const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
                      return (
                        <div key={`subscribe_preview_${account.id}`} className="flex items-center justify-between gap-3 rounded-[10px] bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
                          <div className="min-w-0">
                            <div className="truncate text-white">{readAccountOptionLabel(account)}</div>
                            {taskMeta.occupied ? <div className="mt-1 text-xs text-textMuted">任务：{taskMeta.label}</div> : null}
                          </div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${getAccountStatusTone(account.status)}`}>{formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}</span>
                        </div>
                      )
                    })}
                    {subscribeSelectedAccounts.length > 6 ? <div className="px-1 text-xs text-textMuted">其余 {subscribeSelectedAccounts.length - 6} 个账号已折叠显示。</div> : null}
                  </div>
                )}
              </div>
            </ConfigRow>
            <ConfigRow label="谁来盯新帖" hint="不懂就留空，系统自动挑一个能用的。" wide>
              <select value={scanAccountId} onChange={(event) => setScanAccountId(event.target.value)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                <option value="" className={SOFT_SELECT_OPTION_CLASS}>自动选择</option>
                {accounts.map((account) => <option key={`scan_${account.id}`} value={String(account.id)} className={SOFT_SELECT_OPTION_CLASS}>{readAccountOptionLabel(account)}</option>)}
              </select>
            </ConfigRow>
            <ConfigRow label="谁来抢名字" hint="不选也行，系统会自动从账号池挑一个能用的。" wide>
              <select value={claimAccountId} onChange={(event) => setClaimAccountId(event.target.value)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                <option value="" className={SOFT_SELECT_OPTION_CLASS}>自动选择</option>
                {accounts.map((account) => <option key={`claim_${account.id}`} value={String(account.id)} className={SOFT_SELECT_OPTION_CLASS}>{readAccountOptionLabel(account)}</option>)}
              </select>
            </ConfigRow>
            <ConfigRow label="备用空频道（可选）" hint="有的话就填进去；不填也行，系统会自动新建频道去占。" wide>
              <div className="space-y-2">
                <textarea value={poolInput} onChange={(event) => setPoolInput(event.target.value)} rows={4} placeholder="例如：@empty_pool_1\nhttps://t.me/empty_pool_2" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
                <div className="text-xs text-textMuted">当前 {poolPreviewCount} 个备用池子。</div>
              </div>
            </ConfigRow>
            <ConfigRow label="发现可抢名就自动处理" hint="建议保持开启。" wide>
              <label className="inline-flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={autoClaim} onChange={(event) => setAutoClaim(event.target.checked)} />
                自动抢注
              </label>
            </ConfigRow>
            <ConfigRow label="池子不够就自动新建频道" hint="建议保持开启。" wide>
              <label className="inline-flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={autoCreateCarrier} onChange={(event) => setAutoCreateCarrier(event.target.checked)} />
                自动新建频道占位
              </label>
            </ConfigRow>
          </FoldSection>

          <div className="mt-4" />

          <FoldSection title="高级设置" hint="看不懂就别动，默认值已经能跑。" defaultOpen={false}>
            <ConfigRow label="先帮账号加入来源" hint="建议保持开启。" wide>
              <label className="inline-flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={autoSubscribeSources} onChange={(event) => setAutoSubscribeSources(event.target.checked)} />
                启动前先批量加入来源
              </label>
            </ConfigRow>
            <ConfigRow label="只盯这些关键词（可空）" hint="留空就是全部都看。" wide>
              <input value={includeKeywords} onChange={(event) => setIncludeKeywords(event.target.value)} placeholder="例如：品牌词 产品词" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="跳过这些关键词（可空）" hint="命中这些词就不处理。" wide>
              <input value={excludeKeywords} onChange={(event) => setExcludeKeywords(event.target.value)} placeholder="例如：广告 回收" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="监听间隔（秒）" hint="多久检查一次新帖。">
              <input type="number" min={5} max={300} value={listenerPollSeconds} onChange={(event) => setListenerPollSeconds(Math.max(5, Math.min(300, Number(event.target.value) || 15)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="每次读取多少条" hint="每个来源每轮看最近多少条消息。">
              <input type="number" min={1} max={100} value={sourceMessageLimit} onChange={(event) => setSourceMessageLimit(Math.max(1, Math.min(100, Number(event.target.value) || 20)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="单轮最多处理多少个名字" hint="防止一次扫太多。">
              <input type="number" min={1} max={500} value={candidateLimit} onChange={(event) => setCandidateLimit(Math.max(1, Math.min(500, Number(event.target.value) || 80)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="自动建频道用哪个账号" hint="不选也行，系统会自动从账号池挑一个能用的。" wide>
              <select value={createCarrierAccountId} onChange={(event) => setCreateCarrierAccountId(event.target.value)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                <option value="" className={SOFT_SELECT_OPTION_CLASS}>自动选择</option>
                {accounts.map((account) => <option key={`create_carrier_${account.id}`} value={String(account.id)} className={SOFT_SELECT_OPTION_CLASS}>{readAccountOptionLabel(account)}</option>)}
              </select>
            </ConfigRow>
            <ConfigRow label="自动新建频道名称" hint="支持 {candidate} / {accountId} / {index}。" wide>
              <input value={createCarrierTitleTemplate} onChange={(event) => setCreateCarrierTitleTemplate(event.target.value)} placeholder="监听占位_{candidate}" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="自动新建频道简介" hint="支持 {candidate} / {accountId} / {index}。" wide>
              <textarea value={createCarrierAboutTemplate} onChange={(event) => setCreateCarrierAboutTemplate(event.target.value)} rows={3} className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="建频道后自动发首帖" hint="只对自动新建出来的抢注频道生效。" wide>
              <PostTypeTabs value={postType} onChange={setPostType} />
            </ConfigRow>
            {postType !== 'none' ? (
              <>
                <ConfigRow label="首帖文案" hint="可以发纯文字，或者当图文 caption。" wide>
                  <textarea value={postText} onChange={(event) => setPostText(event.target.value)} rows={4} placeholder="例如：频道已抢到，后续内容会持续更新。" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
                </ConfigRow>
                {postType === 'photo' ? (
                  <ConfigRow label="首帖图片" hint="上传后，频道创建成功会自动发图文 post。" wide>
                    <div className="space-y-3">
                      <label className="inline-flex h-10 cursor-pointer items-center rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]">
                        选择图片
                        <input type="file" accept="image/*" className="hidden" onChange={handlePostImageUpload} />
                      </label>
                      <div className="flex items-center justify-between rounded-[12px] bg-black/10 px-4 py-3 text-xs text-textMuted">
                        <span>{postImageData ? '已选择首帖图片' : '暂未选择图片'}</span>
                        {postImageData ? <button type="button" onClick={() => setPostImageData('')} className="text-white transition hover:text-rose-200">删除</button> : null}
                      </div>
                      {postImageData ? <img src={postImageData} alt="首帖预览" className="max-h-[220px] rounded-[14px] border border-white/8 object-contain" /> : null}
                    </div>
                  </ConfigRow>
                ) : null}
              </>
            ) : null}
          </FoldSection>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="开始监听" hint="点一次就直接进入监听，不再分巡检和监听两套。">
              <div className="space-y-3 px-3 py-3 text-sm">
                <div className="text-sm text-white">启动 / 停止</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleStartListener()}
                    disabled={listening || sourcePreviewCount === 0}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {listening ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
                    {listening ? '监听运行中' : '开始监听'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStopListener()}
                    disabled={!listening}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    停止监听
                  </button>
                </div>
                <div className="text-xs text-textMuted">点“开始监听”后会直接跳到日志中心，并持续盯新帖；命中可抢名时会自动抢，池子不够就自动新建频道。</div>
                {listenerState?.message ? <div className="rounded-[12px] border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100">{listenerState.message}</div> : null}
              </div>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="监听统计" hint="开始后这里只看监听状态。">
              <div className="space-y-3 px-3 py-3 text-sm">
                <div className="text-sm text-white">数量统计</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">来源 / 池子</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{sourcePreviewCount} / {poolPreviewCount}</div>
                  </div>
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">订阅账号</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{subscribeSelectedAccounts.length}</div>
                  </div>
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">已检查消息</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{listenerState?.checkedMessageCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-cyan-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-cyan-200/80">发现候选</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-300">{listenerState?.candidateCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-emerald-200/80">已抢到</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{listenerState?.claimedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-violet-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-violet-200/80">自动新建频道</div>
                    <div className="mt-2 text-2xl font-semibold text-violet-300">{listenerState?.createdCarrierCount ?? 0}</div>
                  </div>
                </div>
              </div>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="说明" hint="现在主流程就是直接监听；开始后会常驻轮询新帖。" defaultOpen={false}>
              <ConfigRow label="第一版边界" wide>
                <div className="space-y-2 text-sm text-textMuted">
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">主体：</span>走用户号，不走 Bot API。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">入口：</span>支持你混填频道 / 群 / 机器人白名单，以及 `t.me/addlist/...` 分组分享链接。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">抢注：</span>优先使用你手动提供的池子载体；池子不够时，可自动新建频道秒占。</div>
                </div>
              </ConfigRow>
            </FoldSection>
          </GlassPanel>
        </div>
      </div>

      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-white">实时监听日志</div>
            <div className="mt-1 text-sm text-textMuted">最新 {listenerState?.logs.length ?? 0} 条</div>
          </div>
          <div className="text-xs text-textMuted">{listenerState?.running ? '监听运行中' : '监听未启动'}</div>
        </div>
        <div className="mt-4 space-y-2">
          {!listenerState || listenerState.logs.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">启动监听后，这里会显示新帖命中、自动建频道、抢注成功/失败等日志。</div> : listenerState.logs.map((log) => (
            <div key={log.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={log.level === 'success' ? 'text-emerald-300' : log.level === 'error' ? 'text-rose-300' : log.level === 'warning' ? 'text-amber-200' : 'text-slate-200'}>{log.message}</div>
                <div className="text-xs text-textMuted">{new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</div>
              </div>
              {(log.sourceTitle || log.candidate || log.targetRef || log.accountLabel) ? <div className="mt-1 text-xs text-textMuted break-all">{[log.sourceTitle, log.candidate, log.targetRef, log.accountLabel].filter(Boolean).join(' · ')}</div> : null}
            </div>
          ))}
        </div>
      </GlassPanel>

      {pickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div className="text-lg font-semibold text-white">选择订阅账号</div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setPickerOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input value={subscribeKeyword} onChange={(event) => setSubscribeKeyword(event.target.value)} placeholder="搜索手机号 / 账号名" className={`h-11 w-full rounded-[12px] pl-11 pr-4 text-sm ${SOFT_INPUT_CLASS}`} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftSubscribeIds(selectableSubscribeAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftSubscribeIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                </div>
              </div>

              {subscribeFilteredAccounts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-textMuted">区间选择</div>
                  <input inputMode="numeric" value={subscribeRangeStart} onChange={(event) => setSubscribeRangeStart(event.target.value.replace(/[^\d]/g, ''))} placeholder="开始" className={`h-10 w-20 rounded-[12px] px-3 text-sm ${SOFT_INPUT_CLASS}`} />
                  <span className="text-textMuted">-</span>
                  <input inputMode="numeric" value={subscribeRangeEnd} onChange={(event) => setSubscribeRangeEnd(event.target.value.replace(/[^\d]/g, ''))} placeholder="结束" className={`h-10 w-20 rounded-[12px] px-3 text-sm ${SOFT_INPUT_CLASS}`} />
                  <button
                    type="button"
                    onClick={() => {
                      const rangeIds = readCustomRangeIds(selectableSubscribeAccounts, subscribeRangeStart, subscribeRangeEnd)
                      if (rangeIds.length === 0) return
                      setDraftSubscribeIds((current) => toggleAccountRange(current, rangeIds))
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
                  {subscribeFilteredAccounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号</div>
                  ) : subscribeFilteredAccounts.map((account) => {
                    const checked = draftSubscribeIds.includes(account.id)
                    const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
                    return (
                      <label key={`subscribe_picker_${account.id}`} className={`grid grid-cols-[64px_220px_1.4fr_160px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${taskMeta.occupied ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${checked ? 'bg-violet-400/10' : taskMeta.occupied ? '' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center"><input type="checkbox" checked={checked} disabled={taskMeta.occupied} onChange={(event) => setDraftSubscribeIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} /></div>
                        <div className="truncate text-white">{account.phone || '—'}</div>
                        <div className="min-w-0">
                          <div className="truncate text-white">{readAccountOptionLabel(account)}</div>
                          {taskMeta.occupied ? <div className="mt-1 text-xs text-textMuted">任务：{taskMeta.label}</div> : null}
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${getAccountStatusTone(account.status)}`}>
                            {formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/8 bg-card px-5 py-4">
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
              <button type="button" onClick={applySubscribePicker} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-violet-300">应用账号选择</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function OtherToolsView() {
  const [activeTab, setActiveTab] = useState<OtherToolsTabKey>('filter')

  return (
    <>
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-5">
        {activeTab === 'filter' ? <FilterWorkbench /> : null}
        {activeTab === 'sniper' ? <SniperWorkbench /> : null}
      </div>
    </>
  )
}
