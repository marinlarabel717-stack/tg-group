import { Copy, Filter, Loader2, Radar } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import type { AccountRecord, OtherToolsSniperCandidateItem, OtherToolsSniperResult, OtherToolsUsernameFilterItem, OtherToolsUsernameFilterResult } from '../../types'
import { GlassPanel } from '../common/glasspanel'
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

function SniperWorkbench() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [sourceInput, setSourceInput] = useState('')
  const [poolInput, setPoolInput] = useState('')
  const [includeKeywords, setIncludeKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [scanAccountId, setScanAccountId] = useState('')
  const [claimAccountId, setClaimAccountId] = useState('')
  const [sourceMessageLimit, setSourceMessageLimit] = useState(20)
  const [candidateLimit, setCandidateLimit] = useState(80)
  const [autoClaim, setAutoClaim] = useState(true)
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

  const sourcePreviewCount = useMemo(() => splitPreviewInput(sourceInput).length, [sourceInput])
  const poolPreviewCount = useMemo(() => splitPreviewInput(poolInput).length, [poolInput])

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
        sourceMessageLimit,
        candidateLimit,
        autoClaim
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
        <SniperResultBlock title="已抢到" items={summary?.claimed ?? []} />
        <SniperResultBlock title="可抢注" items={summary?.claimable ?? []} />
        <SniperResultBlock title="已占用" items={summary?.occupied ?? []} />
        <SniperResultBlock title="不可用" items={summary?.forbidden ?? []} />
      </div>

      <div className="grid gap-5 xl:grid-cols-1">
        <SniperResultBlock title="未确认 / 读取失败" items={summary?.uncertain ?? []} />
      </div>
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
