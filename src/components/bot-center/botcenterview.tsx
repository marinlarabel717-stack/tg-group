import { memo, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Bot, Image as ImageIcon, Loader2, Play, Plus, RefreshCw, Save, Square, Trash2, Type } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useBotCenterStore } from '../../stores/botcenterstore'
import { formatDateTimeFull } from '../../lib/ui-text'
import type { BotCenterButtonStyle, BotCenterKeywordMatchType, BotCenterKeywordRule, BotCenterReplyButton, BotCenterReplyKind } from '../../types'

function createLocalButton(): BotCenterReplyButton {
  return {
    id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: '',
    url: '',
    style: 'primary'
  }
}

function createLocalRule(): BotCenterKeywordRule {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    keyword: '',
    matchType: 'contains',
    replyEnabled: true,
    replyType: 'text',
    title: 'TG-Matrix',
    text: '你好，我已收到你的召唤。\n\n你刚刚发送的是：{text}',
    imageUrl: '',
    buttons: []
  }
}

function StatusBadge({ active, text }: { active: boolean; text: string }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.08] text-textMuted'}`}>{text}</span>
}

function ReplyTypeTabs({ value, onChange }: { value: BotCenterReplyKind; onChange: (value: BotCenterReplyKind) => void }) {
  const items: { value: BotCenterReplyKind; label: string; icon: typeof Type }[] = [
    { value: 'text', label: '纯文字', icon: Type },
    { value: 'photo', label: '图片', icon: ImageIcon }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = value === item.value
        return (
          <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`inline-flex h-10 items-center gap-2 rounded-[12px] border px-4 text-sm transition ${active ? 'border-sky-400/30 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-slate-950/35 text-textMuted hover:bg-white/[0.05]'}`}>
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function MatchTypeTabs({ value, onChange }: { value: BotCenterKeywordMatchType; onChange: (value: BotCenterKeywordMatchType) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['contains', 'equals'] as BotCenterKeywordMatchType[]).map((item) => {
        const active = value === item
        return (
          <button key={item} type="button" onClick={() => onChange(item)} className={`inline-flex h-9 items-center rounded-[10px] border px-3 text-xs transition ${active ? 'border-violet-400/30 bg-violet-400/15 text-violet-200' : 'border-white/10 bg-slate-950/35 text-textMuted hover:bg-white/[0.05]'}`}>
            {item === 'contains' ? '包含关键词' : '完全等于'}
          </button>
        )
      })}
    </div>
  )
}

function ButtonStyleSelect({ value, onChange }: { value: BotCenterButtonStyle; onChange: (value: BotCenterButtonStyle) => void }) {
  const items: { value: BotCenterButtonStyle; label: string; className: string }[] = [
    { value: 'default', label: '默认', className: 'bg-white/[0.08] text-white' },
    { value: 'primary', label: '蓝色', className: 'bg-sky-500/20 text-sky-200' },
    { value: 'success', label: '绿色', className: 'bg-emerald-500/20 text-emerald-200' },
    { value: 'danger', label: '红色', className: 'bg-rose-500/20 text-rose-200' }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button key={item.value} type="button" onClick={() => onChange(item.value)} className={`inline-flex h-9 items-center rounded-[10px] px-3 text-xs transition ${item.className} ${value === item.value ? 'ring-1 ring-white/35' : 'opacity-75 hover:opacity-100'}`}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

function ButtonsEditor({
  title,
  buttons,
  onChange
}: {
  title: string
  buttons: BotCenterReplyButton[]
  onChange: (buttons: BotCenterReplyButton[]) => void
}) {
  const updateButton = (id: string, patch: Partial<BotCenterReplyButton>) => {
    onChange(buttons.map((item) => item.id !== id ? item : { ...item, ...patch }))
  }

  const removeButton = (id: string) => {
    onChange(buttons.filter((item) => item.id !== id))
  }

  const addButton = () => {
    onChange([...buttons, createLocalButton()])
  }

  const moveButton = (id: string, direction: -1 | 1) => {
    const index = buttons.findIndex((item) => item.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= buttons.length) return
    const next = [...buttons]
    const [current] = next.splice(index, 1)
    next.splice(targetIndex, 0, current)
    onChange(next)
  }

  return (
    <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-xs text-textMuted">支持多个按钮；最终会按你这里的顺序从左到右显示。</div>
        </div>
        <button type="button" onClick={addButton} className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-violet-500/20 px-3 text-xs font-medium text-violet-200 transition hover:bg-violet-500/30">
          <Plus size={14} />
          新增按钮
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {buttons.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-white/8 px-4 py-6 text-center text-xs text-textMuted">当前还没有按钮。</div>
        ) : buttons.map((button, index) => (
          <div key={button.id} className="rounded-[12px] border border-white/8 bg-black/10 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-white">按钮 #{index + 1}</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveButton(button.id, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => moveButton(button.id, 1)} disabled={index === buttons.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => removeButton(button.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>按钮文字</span>
                <input value={button.text} onChange={(event) => updateButton(button.id, { text: event.target.value })} placeholder="立即联系" className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
              </label>
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>按钮链接</span>
                <input value={button.url} onChange={(event) => updateButton(button.id, { url: event.target.value })} placeholder="https://..." className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
              </label>
              <div className="md:col-span-2">
                <div className="mb-2 text-sm text-textMuted">按钮颜色</div>
                <ButtonStyleSelect value={button.style} onChange={(value) => updateButton(button.id, { style: value })} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(function BotCenterView() {
  const init = useBotCenterStore((state) => state.init)
  const runtime = useBotCenterStore((state) => state.state)
  const loading = useBotCenterStore((state) => state.loading)
  const saving = useBotCenterStore((state) => state.saving)
  const saveConfig = useBotCenterStore((state) => state.saveConfig)
  const refreshProfile = useBotCenterStore((state) => state.refreshProfile)
  const start = useBotCenterStore((state) => state.start)
  const stop = useBotCenterStore((state) => state.stop)
  const clearLogs = useBotCenterStore((state) => state.clearLogs)

  const [botToken, setBotToken] = useState(runtime.config.botToken)
  const [guestReplyTitle, setGuestReplyTitle] = useState(runtime.config.guestReplyTitle)
  const [guestReplyText, setGuestReplyText] = useState(runtime.config.guestReplyText)
  const [guestReplyType, setGuestReplyType] = useState<BotCenterReplyKind>(runtime.config.guestReplyType)
  const [guestReplyImageUrl, setGuestReplyImageUrl] = useState(runtime.config.guestReplyImageUrl)
  const [guestReplyButtons, setGuestReplyButtons] = useState<BotCenterReplyButton[]>(runtime.config.guestReplyButtons)
  const [autoStart, setAutoStart] = useState(runtime.config.autoStart)
  const [guestReplyEnabled, setGuestReplyEnabled] = useState(runtime.config.guestReplyEnabled)
  const [keywordRules, setKeywordRules] = useState<BotCenterKeywordRule[]>(runtime.config.keywordRules)

  useEffect(() => { void init() }, [init])

  useEffect(() => {
    setBotToken(runtime.config.botToken)
    setGuestReplyTitle(runtime.config.guestReplyTitle)
    setGuestReplyText(runtime.config.guestReplyText)
    setGuestReplyType(runtime.config.guestReplyType)
    setGuestReplyImageUrl(runtime.config.guestReplyImageUrl)
    setGuestReplyButtons(runtime.config.guestReplyButtons.map((item) => ({ ...item })))
    setAutoStart(runtime.config.autoStart)
    setGuestReplyEnabled(runtime.config.guestReplyEnabled)
    setKeywordRules(runtime.config.keywordRules.map((item) => ({ ...item, buttons: item.buttons.map((button) => ({ ...button })) })))
  }, [runtime.config])

  const dirty = useMemo(() => JSON.stringify({
    botToken,
    guestReplyTitle,
    guestReplyText,
    guestReplyType,
    guestReplyImageUrl,
    guestReplyButtons,
    autoStart,
    guestReplyEnabled,
    keywordRules
  }) !== JSON.stringify({
    botToken: runtime.config.botToken,
    guestReplyTitle: runtime.config.guestReplyTitle,
    guestReplyText: runtime.config.guestReplyText,
    guestReplyType: runtime.config.guestReplyType,
    guestReplyImageUrl: runtime.config.guestReplyImageUrl,
    guestReplyButtons: runtime.config.guestReplyButtons,
    autoStart: runtime.config.autoStart,
    guestReplyEnabled: runtime.config.guestReplyEnabled,
    keywordRules: runtime.config.keywordRules
  }), [autoStart, botToken, guestReplyButtons, guestReplyEnabled, guestReplyImageUrl, guestReplyText, guestReplyTitle, guestReplyType, keywordRules, runtime.config])

  const openBotFather = () => { void window.desktopWindow?.openExternal?.('https://t.me/BotFather') }

  const updateRule = (id: string, patch: Partial<BotCenterKeywordRule>) => {
    setKeywordRules((current) => current.map((item) => item.id !== id ? item : { ...item, ...patch }))
  }

  const removeRule = (id: string) => { setKeywordRules((current) => current.filter((item) => item.id !== id)) }
  const addRule = () => { setKeywordRules((current) => [...current, createLocalRule()]) }

  const moveRule = (id: string, direction: -1 | 1) => {
    setKeywordRules((current) => {
      const index = current.findIndex((item) => item.id === id)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [rule] = next.splice(index, 1)
      next.splice(targetIndex, 0, rule)
      return next
    })
  }

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-white">机器人中心</div>
            <div className="mt-1 text-xs leading-6 text-textMuted">现在这版已经支持：<span className="font-semibold text-white">多个按钮 + 关键词优先级上下调整</span>，关键词按列表从上到下优先命中。</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge active={runtime.profile.valid} text={runtime.profile.valid ? 'Bot 已连通' : 'Bot 未验证'} />
            <StatusBadge active={runtime.profile.supportsGuestQueries} text={runtime.profile.supportsGuestQueries ? 'Guest Mode 已开启' : 'Guest Mode 未开启'} />
            <StatusBadge active={runtime.running} text={runtime.running ? '监听中' : '未监听'} />
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">Bot 接入配置</div>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>Bot Token</span>
                  <input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456:AA..." className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                </label>
                <div className="grid gap-3 rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm text-textMuted">
                  <label className="flex items-center justify-between gap-3"><span>启动软件时自动拉起 Bot 监听</span><input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} className="h-4 w-4 accent-sky-400" /></label>
                  <label className="flex items-center justify-between gap-3"><span>收到 Guest 消息后自动回复</span><input type="checkbox" checked={guestReplyEnabled} onChange={(event) => setGuestReplyEnabled(event.target.checked)} className="h-4 w-4 accent-sky-400" /></label>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">默认回复配置</div>
              <div className="mt-4 space-y-4">
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>回复标题</span>
                  <input value={guestReplyTitle} onChange={(event) => setGuestReplyTitle(event.target.value)} placeholder="TG-Matrix" className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                </label>

                <div>
                  <div className="mb-2 text-sm text-textMuted">回复类型</div>
                  <ReplyTypeTabs value={guestReplyType} onChange={setGuestReplyType} />
                </div>

                {guestReplyType === 'photo' ? (
                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>图片 URL</span>
                    <input value={guestReplyImageUrl} onChange={(event) => setGuestReplyImageUrl(event.target.value)} placeholder="https://..." className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                  </label>
                ) : null}

                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>{guestReplyType === 'photo' ? '图片说明 / 文案' : 'Guest 自动回复内容'}</span>
                  <textarea value={guestReplyText} onChange={(event) => setGuestReplyText(event.target.value)} rows={6} className="rounded-[12px] border border-white/10 bg-slate-950/45 px-3 py-3 text-white outline-none transition focus:border-sky-400/50" />
                </label>

                <ButtonsEditor title="默认回复按钮" buttons={guestReplyButtons} onChange={setGuestReplyButtons} />

                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 px-4 py-3 text-xs leading-6 text-textMuted">
                  可用变量：<span className="text-white">{'{text}'}</span>、<span className="text-white">{'{caller_name}'}</span>、<span className="text-white">{'{caller_username}'}</span>、<span className="text-white">{'{chat_title}'}</span>、<span className="text-white">{'{bot_username}'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">关键词回复</div>
                  <div className="mt-1 text-xs leading-6 text-textMuted">支持优先级调整：<span className="font-semibold text-white">越靠上优先级越高</span>，命中第一条就直接回复。</div>
                </div>
                <button type="button" onClick={addRule} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-violet-500/20 px-4 text-sm font-medium text-violet-200 transition hover:bg-violet-500/30"><Plus size={16} />新增关键词</button>
              </div>

              <div className="mt-4 space-y-4">
                {keywordRules.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/8 bg-slate-950/25 px-4 py-8 text-center text-sm text-textMuted">还没有关键词规则。你可以加多个，然后用上下按钮调整优先级。</div>
                ) : keywordRules.map((rule, index) => (
                  <div key={rule.id} className="rounded-[16px] border border-white/8 bg-slate-950/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">关键词规则 #{index + 1}</div>
                        <div className="mt-1 text-xs text-textMuted">当前优先级：{index + 1}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => moveRule(rule.id, -1)} disabled={index === 0} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.06] text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={15} /></button>
                        <button type="button" onClick={() => moveRule(rule.id, 1)} disabled={index === keywordRules.length - 1} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.06] text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"><ArrowDown size={15} /></button>
                        <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} className="h-4 w-4 accent-sky-400" />启用</label>
                        <button type="button" onClick={() => removeRule(rule.id)} className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-rose-500/15 px-3 text-xs text-rose-200 transition hover:bg-rose-500/25"><Trash2 size={14} />删除</button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-textMuted">
                        <span>关键词</span>
                        <input value={rule.keyword} onChange={(event) => updateRule(rule.id, { keyword: event.target.value })} placeholder="比如：价格" className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-textMuted">
                        <span>回复标题</span>
                        <input value={rule.title} onChange={(event) => updateRule(rule.id, { title: event.target.value })} placeholder="TG-Matrix" className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[0.75fr_1fr]">
                      <div className="space-y-4 rounded-[14px] border border-white/8 bg-black/10 p-4">
                        <div>
                          <div className="mb-2 text-sm text-textMuted">匹配方式</div>
                          <MatchTypeTabs value={rule.matchType} onChange={(value) => updateRule(rule.id, { matchType: value })} />
                        </div>
                        <div>
                          <div className="mb-2 text-sm text-textMuted">回复类型</div>
                          <ReplyTypeTabs value={rule.replyType} onChange={(value) => updateRule(rule.id, { replyType: value })} />
                        </div>
                        <label className="flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.03] px-3 py-3 text-sm text-textMuted"><span>命中后允许回复</span><input type="checkbox" checked={rule.replyEnabled} onChange={(event) => updateRule(rule.id, { replyEnabled: event.target.checked })} className="h-4 w-4 accent-sky-400" /></label>
                      </div>

                      <div className="space-y-4">
                        {rule.replyType === 'photo' ? (
                          <label className="flex flex-col gap-2 text-sm text-textMuted">
                            <span>图片 URL</span>
                            <input value={rule.imageUrl} onChange={(event) => updateRule(rule.id, { imageUrl: event.target.value })} placeholder="https://..." className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50" />
                          </label>
                        ) : null}

                        <label className="flex flex-col gap-2 text-sm text-textMuted">
                          <span>{rule.replyType === 'photo' ? '图片说明 / 文案' : '回复内容'}</span>
                          <textarea value={rule.text} onChange={(event) => updateRule(rule.id, { text: event.target.value })} rows={5} className="rounded-[12px] border border-white/10 bg-slate-950/45 px-3 py-3 text-white outline-none transition focus:border-sky-400/50" />
                        </label>

                        <ButtonsEditor title="关键词命中按钮" buttons={rule.buttons} onChange={(buttons) => updateRule(rule.id, { buttons })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={saving || !dirty} onClick={() => void saveConfig({ botToken, guestReplyTitle, guestReplyText, guestReplyType, guestReplyImageUrl, guestReplyButtons, autoStart, guestReplyEnabled, keywordRules })} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}保存配置</button>
              <button type="button" disabled={saving || loading} onClick={() => void refreshProfile()} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={16} />检查 Bot / Guest Mode</button>
              <button type="button" disabled={saving || runtime.running} onClick={() => void start()} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-emerald-500 px-4 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"><Play size={16} />启动监听</button>
              <button type="button" disabled={saving || !runtime.running} onClick={() => void stop()} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-amber-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"><Square size={16} />停止监听</button>
              <button type="button" onClick={openBotFather} className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/10 bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/[0.04]"><Bot size={16} />打开 BotFather</button>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">运行日志</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-textMuted">这里只保留最近 200 条，方便你盯 Guest 消息有没有真正进来、命中了哪条关键词。</div>
                <button type="button" disabled={saving || runtime.logs.length === 0} onClick={() => void clearLogs()} className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-white/[0.06] px-3 text-xs font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"><Trash2 size={14} />清空日志</button>
              </div>
              <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
                {runtime.logs.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/8 bg-slate-950/25 px-4 py-10 text-center text-sm text-textMuted">还没有日志。先保存 Token，再检查 Guest Mode，最后启动监听。</div>
                ) : runtime.logs.map((log) => (
                  <div key={log.id} className={`rounded-[12px] border px-4 py-3 text-sm ${log.level === 'error' ? 'border-rose-400/15 bg-rose-400/10 text-rose-200' : log.level === 'warning' ? 'border-amber-400/15 bg-amber-400/10 text-amber-100' : log.level === 'success' ? 'border-emerald-400/15 bg-emerald-400/10 text-emerald-200' : 'border-white/8 bg-slate-950/30 text-slate-200'}`}>
                    <div className="mb-1 text-[11px] text-white/55">{formatDateTimeFull(log.createdAt)}</div>
                    <div className="leading-6">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">Bot 状态</div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-xs text-textMuted">当前 Bot</div>
                  <div className="mt-1 text-base font-semibold text-white">{runtime.profile.username ? `@${runtime.profile.username}` : '未连接'}</div>
                  <div className="mt-2 text-xs leading-6 text-textMuted">名称：{runtime.profile.firstName || '—'}<br />ID：{runtime.profile.id ?? '—'}</div>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>是否允许进群：<span className="text-white">{runtime.profile.canJoinGroups ? '允许' : '不允许'}</span></div>
                  <div>是否读取全部群消息：<span className="text-white">{runtime.profile.canReadAllGroupMessages ? '是' : '否'}</span></div>
                  <div>Guest Mode：<span className="text-white">{runtime.profile.supportsGuestQueries ? '已开启' : '未开启'}</span></div>
                  <div>最近刷新：<span className="text-white">{formatDateTimeFull(runtime.profile.fetchedAt)}</span></div>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">监听运行态</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>运行状态：<span className="text-white">{runtime.running ? '监听中' : '已停止'}</span></div>
                  <div>轮询状态：<span className="text-white">{runtime.polling ? '正在长轮询' : '空闲'}</span></div>
                  <div>启动时间：<span className="text-white">{formatDateTimeFull(runtime.startedAt)}</span></div>
                  <div>最近轮询：<span className="text-white">{formatDateTimeFull(runtime.lastPollAt)}</span></div>
                  <div>当前 offset：<span className="text-white">{runtime.updateOffset}</span></div>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>收到 Guest 消息：<span className="text-white">{runtime.stats.receivedGuestCount}</span></div>
                  <div>成功回复：<span className="text-white">{runtime.stats.answeredGuestCount}</span></div>
                  <div>回复失败：<span className="text-white">{runtime.stats.failedGuestCount}</span></div>
                  <div>最近 Guest 消息：<span className="text-white">{formatDateTimeFull(runtime.stats.lastGuestAt)}</span></div>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5 text-sm leading-7 text-textMuted">
              <div className="text-sm font-semibold text-white">当前工作方式</div>
              <div className="mt-3">1. 先按关键词列表从上到下匹配，越靠上优先级越高</div>
              <div>2. 命中第一条规则后直接回复</div>
              <div>3. 没命中时，回落到默认回复</div>
              <div>4. 多个按钮会按配置顺序从左到右展示</div>
            </div>

            {runtime.lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{runtime.lastActionMessage}</div> : null}
            {runtime.lastError ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{runtime.lastError}</div> : null}
          </div>
        </div>
      </GlassPanel>
    </div>
  )
})
