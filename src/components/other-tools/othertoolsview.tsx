import { Copy, Filter, Loader2, Radar, Search, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import type { AccountRecord, OtherToolsSniperCandidateItem, OtherToolsSniperResult, OtherToolsSourceSubscribeItem, OtherToolsUsernameFilterItem, OtherToolsUsernameFilterResult } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_SELECT_OPTION_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'

type OtherToolsTabKey = 'filter' | 'sniper'

const tabs: Array<{ key: OtherToolsTabKey; label: string; icon: typeof Filter }> = [
  { key: 'filter', label: '筛选', icon: Filter },
  { key: 'sniper', label: '抢注系统', icon: Radar }
]

function splitPreviewInput(input: string) {
  return input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
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
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
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
              <ConfigRow label="数量统计" wide>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
              </ConfigRow>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="规则说明" hint="现在按 Telegram 实际状态分，不再单纯看格式。" defaultOpen={false}>
              <ConfigRow label="分类口径" wide>
                <div className="space-y-2 text-sm text-textMuted">
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">有效用户名：</span>已经能查到真实目标，或这个公开用户名当前已被占用。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">可占位用户名：</span>当前没人占用，或者清洗后可以继续拿来占位。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">无效且不可占位：</span>违禁、保留、规则不允许，或根本整理不成合法用户名。</div>
                </div>
              </ConfigRow>
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
  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [summary, setSummary] = useState<OtherToolsSniperResult | null>(null)

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

  const applySubscribePicker = () => {
    setSubscribeAccountIds(draftSubscribeIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
    setPickerOpen(false)
  }

  const handleRun = async () => {
    const api = window.desktopOtherTools
    if (!api) {
      setErrorMessage('当前运行环境不支持抢注系统。')
      return
    }
    if (!sourceInput.trim()) {
      setErrorMessage('先填白名单来源。')
      return
    }

    setRunning(true)
    setErrorMessage('')
    try {
      const result = await api.scanAndClaim({
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
        autoSubscribeSources
      })
      setSummary(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message || '巡检失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <GlassPanel className="bg-card">
          <FoldSection title="抢注配置" hint="第一版先做白名单来源巡检 + 可抢名自动占位，不做常驻后台监听。">
            <ConfigRow label="白名单来源" hint="一行一个，支持频道 / 群 / 机器人用户名、普通 t.me 链接，以及分组分享链接 t.me/addlist/...。" wide>
              <div className="space-y-2">
                <textarea value={sourceInput} onChange={(event) => setSourceInput(event.target.value)} rows={8} placeholder="如：@nav_bot / https://t.me/xxxx_channel / https://t.me/addlist/xxxxxx / @supply_group" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
                <div className="text-xs text-textMuted">当前 {sourcePreviewCount} 个来源。混着填 addlist 分组链接和频道链接也行，系统会先自动识别分组链接并把里面的频道/群导进监听来源。</div>
              </div>
            </ConfigRow>
            <ConfigRow label="池子载体" hint="一行一个，填你自己能改用户名的公开群 / 频道。抢到后会直接改它们的公开用户名。" wide>
              <div className="space-y-2">
                <textarea value={poolInput} onChange={(event) => setPoolInput(event.target.value)} rows={6} placeholder="如：@pool_holder_1 / https://t.me/pool_holder_2" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
                <div className="text-xs text-textMuted">当前 {poolPreviewCount} 个池子载体。建议只放真正的空壳频道/群，避免误改正式业务号。</div>
              </div>
            </ConfigRow>
            <ConfigRow label="包含关键词" hint="可留空；填了后只巡检包含这些词的消息。" wide>
              <input value={includeKeywords} onChange={(event) => setIncludeKeywords(event.target.value)} placeholder="品牌词 行业词 区域词" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="排除关键词" hint="命中这些词的消息会直接跳过。" wide>
              <input value={excludeKeywords} onChange={(event) => setExcludeKeywords(event.target.value)} placeholder="广告 无码 回收" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="订阅账号" hint="这些账号会对白名单里的普通频道链接和 addlist 分组链接一起去加入/订阅。" wide>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white">已选 {subscribeSelectedAccounts.length} 个账号</div>
                  <button type="button" onClick={() => setPickerOpen(true)} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">选择账号</button>
                </div>
                {subscribeSelectedAccounts.length === 0 ? (
                  <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 py-3 text-sm text-textMuted">还没选订阅账号。</div>
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
            <ConfigRow label="自动订阅来源" hint="开启后，选中的账号会先去加入普通频道链接和 addlist 分组里的目标。" wide>
              <label className="inline-flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={autoSubscribeSources} onChange={(event) => setAutoSubscribeSources(event.target.checked)} />
                白名单来源先批量订阅，再继续巡检
              </label>
            </ConfigRow>
            <ConfigRow label="监听账号" hint="不选就自动拿第一个可用账号。" wide>
              <select value={scanAccountId} onChange={(event) => setScanAccountId(event.target.value)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                <option value="" className={SOFT_SELECT_OPTION_CLASS}>自动选择</option>
                {accounts.map((account) => <option key={`scan_${account.id}`} value={String(account.id)} className={SOFT_SELECT_OPTION_CLASS}>{readAccountOptionLabel(account)}</option>)}
              </select>
            </ConfigRow>
            <ConfigRow label="抢注账号" hint="不选默认跟监听账号共用；建议后面单独拆抢注号。" wide>
              <select value={claimAccountId} onChange={(event) => setClaimAccountId(event.target.value)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                <option value="" className={SOFT_SELECT_OPTION_CLASS}>自动选择</option>
                {accounts.map((account) => <option key={`claim_${account.id}`} value={String(account.id)} className={SOFT_SELECT_OPTION_CLASS}>{readAccountOptionLabel(account)}</option>)}
              </select>
            </ConfigRow>
            <ConfigRow label="每源读取条数" hint="每个来源抓最近多少条消息。">
              <input type="number" min={1} max={100} value={sourceMessageLimit} onChange={(event) => setSourceMessageLimit(Math.max(1, Math.min(100, Number(event.target.value) || 20)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="候选上限" hint="本轮最多处理多少个候选名。">
              <input type="number" min={1} max={500} value={candidateLimit} onChange={(event) => setCandidateLimit(Math.max(1, Math.min(500, Number(event.target.value) || 80)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
            </ConfigRow>
            <ConfigRow label="自动抢注" hint="关闭后只巡检和判定，不会改池子载体的用户名。" wide>
              <label className="inline-flex items-center gap-3 text-sm text-white">
                <input type="checkbox" checked={autoClaim} onChange={(event) => setAutoClaim(event.target.checked)} />
                命中可抢名后，立即用池子载体占位
              </label>
            </ConfigRow>
          </FoldSection>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="执行" hint="先做一键巡检版，把闭环跑通。">
              <ConfigRow label="开始执行" wide>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => void handleRun()}
                    disabled={running || sourcePreviewCount === 0}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
                    {running ? '巡检中…' : '开始巡检'}
                  </button>
                  <div className="text-xs text-textMuted">开启自动抢注时，系统会直接修改你填写的池子载体公开用户名。</div>
                  {errorMessage ? <div className="rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{errorMessage}</div> : null}
                  {summary?.message ? <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.12] px-3 py-2 text-xs text-textMuted">{summary.message}</div> : null}
                </div>
              </ConfigRow>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="统计" hint="本轮巡检与抢注汇总。">
              <ConfigRow label="数量统计" wide>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">来源 / 池子</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{summary?.sourceCount ?? 0} / {summary?.poolCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">订阅账号 / 已加入</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{summary?.subscribeAccountCount ?? 0} / {summary?.subscribeJoinedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-white/[0.04] px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">已巡检消息</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{summary?.inspectedMessageCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-cyan-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-cyan-200/80">可抢注</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-300">{summary?.claimable.length ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-emerald-200/80">已抢到</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{summary?.claimed.length ?? 0}</div>
                  </div>
                </div>
              </ConfigRow>
            </FoldSection>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <FoldSection title="说明" hint="这一版先做成可控的一键巡检，不常驻后台。" defaultOpen={false}>
              <ConfigRow label="第一版边界" wide>
                <div className="space-y-2 text-sm text-textMuted">
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">主体：</span>走用户号，不走 Bot API。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">入口：</span>支持你混填频道 / 群 / 机器人白名单，以及 `t.me/addlist/...` 分组分享链接。</div>
                  <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">抢注：</span>当前通过你手动提供的池子载体秒改用户名；后面再补自动维护空频道池。</div>
                </div>
              </ConfigRow>
            </FoldSection>
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SubscribeResultBlock title="订阅结果" items={summary?.subscribeItems ?? []} />
        <SniperResultBlock title="已抢到" items={summary?.claimed ?? []} />
        <SniperResultBlock title="可抢注" items={summary?.claimable ?? []} />
        <SniperResultBlock title="已占用" items={summary?.occupied ?? []} />
        <SniperResultBlock title="不可用" items={summary?.forbidden ?? []} />
      </div>

      <div className="grid gap-5 xl:grid-cols-1">
        <SniperResultBlock title="未确认 / 读取失败" items={summary?.uncertain ?? []} />
      </div>

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
