import { Copy, Filter, SearchCheck } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { GlassPanel } from '../common/glasspanel'

type OtherToolsTabKey = 'filter'

type FilterCategory = 'valid' | 'replaceable' | 'placeholder' | 'invalid'

type FilterItem = {
  raw: string
  normalized: string
  category: FilterCategory
  kind: 'username' | 'link' | 'unknown'
  reason: string
}

const tabs: Array<{ key: OtherToolsTabKey; label: string; icon: typeof Filter }> = [
  { key: 'filter', label: '筛选', icon: Filter }
]

const SOFT_INPUT_CLASS = 'border border-white/[0.06] bg-black/10 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'

const PLACEHOLDER_MARKERS = ['占位', 'placeholder', '待替换', 'username', 'link', 'url', 'xxx', 'test']

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (/\{[^}]+\}/.test(value)) return true
  return PLACEHOLDER_MARKERS.some((item) => normalized.includes(item))
}

function parseUsername(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/^@+/, '')
  if (/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(cleaned)) {
    return {
      valid: true,
      normalized: `@${cleaned.toLowerCase()}`,
      replaceable: false
    }
  }

  const candidate = cleaned.toLowerCase().replace(/[^a-z0-9_]+/g, '')
  if (/^[a-z][a-z0-9_]{4,31}$/.test(candidate)) {
    return {
      valid: false,
      normalized: `@${candidate}`,
      replaceable: true
    }
  }

  return null
}

function parseLink(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const matched = trimmed.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{5,32})$/i)
  if (matched?.[1]) {
    return {
      valid: true,
      normalized: `https://t.me/${matched[1].toLowerCase()}`,
      replaceable: false
    }
  }

  const maybePath = trimmed.match(/^(?:https?:\/\/)?t\.me\/([^/?#]+)$/i)
  if (maybePath?.[1]) {
    const candidate = maybePath[1].toLowerCase().replace(/[^a-z0-9_]+/g, '')
    if (/^[a-z][a-z0-9_]{4,31}$/.test(candidate)) {
      return {
        valid: false,
        normalized: `https://t.me/${candidate}`,
        replaceable: true
      }
    }
  }

  return null
}

function classifyValue(raw: string): FilterItem {
  const value = raw.trim()
  if (!value) {
    return {
      raw,
      normalized: '',
      category: 'invalid',
      kind: 'unknown',
      reason: '空内容已跳过'
    }
  }

  if (isPlaceholderValue(value)) {
    return {
      raw,
      normalized: value,
      category: 'placeholder',
      kind: /t\.me|https?:\/\//i.test(value) ? 'link' : 'username',
      reason: '看起来是占位内容，建议后续替换'
    }
  }

  const linkResult = parseLink(value)
  if (linkResult) {
    return {
      raw,
      normalized: linkResult.normalized,
      category: linkResult.valid ? 'valid' : 'replaceable',
      kind: 'link',
      reason: linkResult.valid ? '链接格式合法' : '链接可整理成合法格式'
    }
  }

  const usernameResult = parseUsername(value)
  if (usernameResult) {
    return {
      raw,
      normalized: usernameResult.normalized,
      category: usernameResult.valid ? 'valid' : 'replaceable',
      kind: 'username',
      reason: usernameResult.valid ? '用户名格式合法' : '用户名可整理成合法格式'
    }
  }

  return {
    raw,
    normalized: value,
    category: 'invalid',
    kind: 'unknown',
    reason: '不是合法用户名/链接，也整理不成可用格式'
  }
}

function parseBulkValues(input: string) {
  const items = input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => classifyValue(item))

  return {
    items,
    valid: items.filter((item) => item.category === 'valid'),
    replaceable: items.filter((item) => item.category === 'replaceable'),
    placeholder: items.filter((item) => item.category === 'placeholder'),
    invalid: items.filter((item) => item.category === 'invalid')
  }
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

function ResultBlock(props: { title: string; items: FilterItem[]; tone: string }) {
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
              <div className={`text-xs ${tone}`}>{item.kind === 'link' ? '链接' : item.kind === 'username' ? '用户名' : '未知'}</div>
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
  const summary = useMemo(() => parseBulkValues(input), [input])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassPanel className="bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-violet-400/12 text-violet-300">
              <SearchCheck size={18} />
            </div>
            <div>
              <div className="text-base font-semibold text-white">用户名 / 链接筛选</div>
              <div className="mt-1 text-sm text-textMuted">自动把输入分成：合法、可替换、占位、无效。</div>
            </div>
          </div>

          <label className="mt-4 block rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
            <div className="text-xs tracking-[0.18em] text-textMuted">原始内容</div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={14}
              placeholder="一行一个，支持 @username / username / https://t.me/username / t.me/username"
              className={`mt-3 w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
            />
            <div className="mt-2 text-xs text-textMuted">可直接贴一整批内容，系统会自动拆分。</div>
          </label>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">统计</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                <div className="text-xs tracking-[0.16em] text-emerald-200/80">合法</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-300">{summary.valid.length}</div>
              </div>
              <div className="rounded-[14px] bg-cyan-400/8 px-4 py-3">
                <div className="text-xs tracking-[0.16em] text-cyan-200/80">可替换</div>
                <div className="mt-2 text-2xl font-semibold text-cyan-300">{summary.replaceable.length}</div>
              </div>
              <div className="rounded-[14px] bg-amber-400/8 px-4 py-3">
                <div className="text-xs tracking-[0.16em] text-amber-200/80">占位</div>
                <div className="mt-2 text-2xl font-semibold text-amber-200">{summary.placeholder.length}</div>
              </div>
              <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
                <div className="text-xs tracking-[0.16em] text-rose-200/80">无效</div>
                <div className="mt-2 text-2xl font-semibold text-rose-300">{summary.invalid.length}</div>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">规则说明</div>
            <div className="mt-4 space-y-2 text-sm text-textMuted">
              <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">合法：</span>本身就是规范用户名或 t.me 链接。</div>
              <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">可替换：</span>原值不规范，但整理后还能变成合法格式。</div>
              <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">占位：</span>像 placeholder / 待替换 / {'{rand6}'} 这类占位内容。</div>
              <div className="rounded-[14px] bg-panel/70 px-4 py-3"><span className="text-white">无效：</span>既不是合法值，也整理不成可用值。</div>
            </div>
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ResultBlock title="合法" items={summary.valid} tone="text-emerald-300" />
        <ResultBlock title="可替换" items={summary.replaceable} tone="text-cyan-300" />
        <ResultBlock title="占位" items={summary.placeholder} tone="text-amber-200" />
        <ResultBlock title="无效" items={summary.invalid} tone="text-rose-300" />
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
