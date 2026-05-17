import { Copy, Filter, Loader2 } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { OtherToolsUsernameFilterItem, OtherToolsUsernameFilterResult } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'

type OtherToolsTabKey = 'filter'

const tabs: Array<{ key: OtherToolsTabKey; label: string; icon: typeof Filter }> = [
  { key: 'filter', label: '筛选', icon: Filter }
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

function readKindLabel(item: OtherToolsUsernameFilterItem) {
  if (item.kind === 'link') return '链接'
  return '用户名'
}

function readEntityLabel(item: OtherToolsUsernameFilterItem) {
  if (item.entityType === 'user') return '真实用户'
  if (item.entityType === 'bot') return '机器人'
  if (item.entityType === 'group') return '群组'
  if (item.entityType === 'channel') return '频道'
  return '未细分'
}

function ResultBlock(props: { title: string; items: OtherToolsUsernameFilterItem[]; tone: string }) {
  const { title, items, tone } = props

  const copyAll = async () => {
    const content = items.map((item) => item.normalized || item.raw).join('\n')
    if (!content) return
    await navigator.clipboard.writeText(content)
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

export default function OtherToolsView() {
  const [activeTab, setActiveTab] = useState<OtherToolsTabKey>('filter')

  return (
    <>
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-5">
        {activeTab === 'filter' ? <FilterWorkbench /> : null}
      </div>
    </>
  )
}
