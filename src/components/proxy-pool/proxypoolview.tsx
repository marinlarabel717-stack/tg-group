import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, Loader2, Play, RefreshCw, ShoppingBag, Shuffle, ShieldCheck, ShieldX, WandSparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useUIStore } from '../../stores/uistore'
import { formatDateTime } from '../../lib/ui-text'

function buildProxyText(values: { value: string }[]) {
  return values.map((item) => item.value).join('\n')
}

const typeOptions = [
  { label: 'http', value: 'http' },
  { label: 'https', value: 'https' },
  { label: 'socks5', value: 'socks5' }
] as const

const ipOptions = [
  { label: 'IPv4', value: 'ipv4' },
  { label: 'IPv6', value: 'ipv6' }
] as const

const SummaryCard = memo(function SummaryCard({ title, value, tone }: { title: string; value: string | number; tone: 'blue' | 'emerald' | 'rose' | 'violet' }) {
  const toneClass = tone === 'emerald'
    ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/15'
    : tone === 'rose'
      ? 'text-rose-300 bg-rose-400/10 border-rose-400/15'
      : tone === 'violet'
        ? 'text-violet-300 bg-violet-400/10 border-violet-400/15'
        : 'text-sky-300 bg-sky-400/10 border-sky-400/15'

  return (
    <div className={`rounded-[16px] border p-4 ${toneClass}`}>
      <div className="text-xs tracking-[0.18em] opacity-80">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
    </div>
  )
})

export default memo(function ProxyPoolView() {
  const init = useProxyPoolStore((state) => state.init)
  const replaceProxyList = useProxyPoolStore((state) => state.replaceProxyList)
  const updateSettings = useProxyPoolStore((state) => state.updateSettings)
  const startCheck = useProxyPoolStore((state) => state.startCheck)
  const state = useProxyPoolStore((store) => store.state)
  const loading = useProxyPoolStore((store) => store.loading)
  const saving = useProxyPoolStore((store) => store.saving)
  const errorMessage = useProxyPoolStore((store) => store.errorMessage)
  const lastActionMessage = useProxyPoolStore((store) => store.lastActionMessage)
  const setActiveModule = useUIStore((store) => store.setActiveModule)
  const setLogsContext = useUIStore((store) => store.setLogsContext)

  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!dirty) {
      setDraft(buildProxyText(state.proxies))
    }
  }, [dirty, state.proxies])

  const summary = state.checkState
  const availableRatio = summary.totalCount > 0 ? `${Math.round((summary.aliveCount / summary.totalCount) * 100)}%` : '—'
  const recentLogs = useMemo(() => summary.logs.slice(-6).reverse(), [summary.logs])

  const handleSaveList = async () => {
    await replaceProxyList(draft)
    setDirty(false)
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return
      setDraft((current) => (current.trim() ? `${current.trim()}\n${text.trim()}` : text.trim()))
      setDirty(true)
      textareaRef.current?.focus()
    } catch {
      // ignore clipboard permission failures
    }
  }

  const handleStartCheck = async () => {
    await replaceProxyList(draft)
    setDirty(false)
    setLogsContext('proxy-pool')
    setActiveModule('logs')
    await startCheck()
  }

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="text-sm font-medium text-white">代理池</div>
          <div className="mt-1 text-xs text-textMuted">先把代理列表贴进来，再一键检查可用性；不可用代理会在检查后自动剔除。</div>
        </div>

        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.25fr_0.9fr]">
          <div className="space-y-5">
            <div className="rounded-[16px] bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => textareaRef.current?.focus()}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-hover"
                >
                  <ClipboardList size={16} />
                  代理列表
                </button>
                <button
                  type="button"
                  onClick={() => void handlePasteFromClipboard()}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-hover"
                >
                  <WandSparkles size={16} />
                  从剪贴板粘贴
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.04] px-4 text-sm font-medium text-textMuted transition hover:bg-hover hover:text-white"
                >
                  <ShoppingBag size={16} />
                  购买代理
                </button>
              </div>

              <div className="mt-4 rounded-[14px] border border-white/6 bg-slate-950/35 p-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setDirty(true)
                  }}
                  placeholder={'一行一个代理，例如：\n127.0.0.1:7890\n127.0.0.1:7890:user:pass\nhttp://user:pass@127.0.0.1:7890'}
                  className="h-[340px] w-full resize-none rounded-[12px] border border-white/5 bg-panel px-4 py-4 font-mono text-[13px] leading-6 text-white outline-none transition focus:border-sky-400/40"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-textMuted">
                <div>当前输入 {draft.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length} 条</div>
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={() => void handleSaveList()}
                  className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  保存代理列表
                </button>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">其他选项</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>默认代理类型</span>
                  <select
                    value={state.settings.defaultType}
                    onChange={(event) => void updateSettings({ defaultType: event.target.value as 'http' | 'https' | 'socks5' })}
                    className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                  >
                    {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>IP 代理版本</span>
                  <select
                    value={state.settings.ipVersion}
                    onChange={(event) => void updateSettings({ ipVersion: event.target.value as 'ipv4' | 'ipv6' })}
                    className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                  >
                    {ipOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-[14px] border border-white/6 bg-slate-950/35 px-4 py-4">
                <div>
                  <div className="text-sm font-medium text-white">随机选择代理</div>
                  <div className="mt-1 text-xs text-textMuted">开启后会在检查时打乱顺序，避免固定批次偏差。</div>
                </div>
                <button
                  type="button"
                  onClick={() => void updateSettings({ randomize: !state.settings.randomize })}
                  className={`inline-flex h-9 w-16 items-center rounded-full px-1 transition ${state.settings.randomize ? 'bg-sky-500/80' : 'bg-white/10'}`}
                >
                  <span className={`h-7 w-7 rounded-full bg-white shadow transition ${state.settings.randomize ? 'translate-x-7' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
              <SummaryCard title="当前代理数" value={state.proxies.length} tone="blue" />
              <SummaryCard title="可用数量" value={summary.aliveCount} tone="emerald" />
              <SummaryCard title="不可用数量" value={summary.deadCount} tone="rose" />
              <SummaryCard title="可用率" value={availableRatio} tone="violet" />
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white">当前池子</div>
                  <div className="mt-1 text-xs text-textMuted">检查完成后会自动删除不可用代理，列表会保留可用项。</div>
                </div>
                {loading ? <Loader2 size={18} className="animate-spin text-textMuted" /> : null}
              </div>

              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {state.proxies.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/10 px-4 py-10 text-center text-sm text-textMuted">
                    还没有代理，先把代理列表贴到左边。
                  </div>
                ) : state.proxies.map((proxy) => (
                  <div key={proxy.id} className="rounded-[14px] border border-white/6 bg-slate-950/35 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm text-white">{proxy.value}</div>
                      <div className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${proxy.status === 'alive'
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : proxy.status === 'dead'
                          ? 'bg-rose-400/10 text-rose-300'
                          : proxy.status === 'checking'
                            ? 'bg-sky-400/10 text-sky-300'
                            : 'bg-white/10 text-textMuted'}`}
                      >
                        {proxy.status === 'alive' ? '可用' : proxy.status === 'dead' ? '不可用' : proxy.status === 'checking' ? '检查中' : '待检查'}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-textMuted">
                      <span>{proxy.type.toUpperCase()}</span>
                      <span>{proxy.ipVersion.toUpperCase()}</span>
                      <span>{proxy.latencyMs ? `${proxy.latencyMs}ms` : '—'}</span>
                      <span>{proxy.lastCheckedAt ? formatDateTime(proxy.lastCheckedAt) : '未检查'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white">最近日志</div>
                  <div className="mt-1 text-xs text-textMuted">点击右下角开始检查后，会自动跳到日志中心查看完整过程。</div>
                </div>
                <Shuffle size={18} className="text-neonSoft" />
              </div>
              <div className="mt-4 space-y-2">
                {recentLogs.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-textMuted">暂无代理检查日志</div>
                ) : recentLogs.map((log) => (
                  <div key={log.id} className={`rounded-[12px] px-3 py-2 text-sm ${log.level === 'success'
                    ? 'bg-emerald-400/10 text-emerald-200'
                    : log.level === 'error'
                      ? 'bg-rose-400/10 text-rose-200'
                      : 'bg-white/[0.04] text-textMuted'}`}
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {(lastActionMessage || errorMessage) ? (
          <div className="border-t border-white/5 px-5 py-4">
            {lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
            {errorMessage ? <div className="mt-3 rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
          </div>
        ) : null}
      </GlassPanel>

      <div className="sticky bottom-0 z-10 flex justify-end pb-1">
        <button
          type="button"
          disabled={saving || loading || state.proxies.length === 0 && !draft.trim()}
          onClick={() => void handleStartCheck()}
          className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-sky-500 px-5 text-sm font-semibold text-white shadow-[0_10px_32px_rgba(59,130,246,0.28)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-65"
        >
          {saving || summary.running ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
          检查代理
        </button>
      </div>
    </div>
  )
})
