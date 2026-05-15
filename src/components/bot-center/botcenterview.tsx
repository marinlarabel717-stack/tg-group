import { memo, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Bot, Image as ImageIcon, Loader2, Play, Plus, RefreshCw, Save, Square, Trash2, Type } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useBotCenterStore } from '../../stores/botcenterstore'
import { formatDateTimeFull } from '../../lib/ui-text'
import type { BotCenterBotState, BotCenterButtonStyle, BotCenterKeywordMatchType, BotCenterKeywordRule, BotCenterReplyButton, BotCenterReplyKind } from '../../types'

const SOFT_INPUT_CLASS = 'h-11 rounded-[12px] border border-white/[0.06] bg-black/10 px-3 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TEXTAREA_CLASS = 'rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'

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

function StatusPill({ active, text }: { active: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center rounded-[999px] px-3 py-1 text-xs ${active ? 'bg-violet-400/12 text-violet-200' : 'bg-white/[0.05] text-textMuted'}`}>
      {text}
    </span>
  )
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

function MatchTypeTabs({ value, onChange }: { value: BotCenterKeywordMatchType; onChange: (value: BotCenterKeywordMatchType) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['contains', 'equals'] as BotCenterKeywordMatchType[]).map((item) => {
        const active = value === item
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={`inline-flex h-9 items-center rounded-[12px] px-3 text-xs ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-200' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
          >
            {item === 'contains' ? '包含关键词' : '完全等于'}
          </button>
        )
      })}
    </div>
  )
}

function ButtonStyleSelect({ value, onChange }: { value: BotCenterButtonStyle; onChange: (value: BotCenterButtonStyle) => void }) {
  const items: { value: BotCenterButtonStyle; label: string; className: string }[] = [
    { value: 'default', label: '默认', className: 'bg-white/[0.05] text-white' },
    { value: 'primary', label: '蓝色', className: 'bg-sky-500/18 text-sky-200' },
    { value: 'success', label: '绿色', className: 'bg-emerald-500/18 text-emerald-200' },
    { value: 'danger', label: '红色', className: 'bg-rose-500/18 text-rose-200' }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`inline-flex h-9 items-center rounded-[12px] px-3 text-xs transition ${item.className} ${value === item.value ? 'ring-1 ring-white/25' : 'opacity-75 hover:opacity-100'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function ButtonsEditor({ title, buttons, onChange }: { title: string; buttons: BotCenterReplyButton[]; onChange: (buttons: BotCenterReplyButton[]) => void }) {
  const updateButton = (id: string, patch: Partial<BotCenterReplyButton>) => {
    onChange(buttons.map((item) => item.id !== id ? item : { ...item, ...patch }))
  }

  const addButton = () => onChange([...buttons, createLocalButton()])
  const removeButton = (id: string) => onChange(buttons.filter((item) => item.id !== id))
  const moveButton = (id: string, direction: -1 | 1) => {
    const index = buttons.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= buttons.length) return
    const next = [...buttons]
    const [current] = next.splice(index, 1)
    next.splice(target, 0, current)
    onChange(next)
  }

  return (
    <div className="space-y-3 rounded-[16px] bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-xs text-textMuted">支持多个按钮，按这里的顺序从左到右展示。</div>
        </div>
        <button type="button" onClick={addButton} className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-violet-400/10 px-3 text-xs text-violet-200 transition hover:bg-violet-400/16">
          <Plus size={14} />新增按钮
        </button>
      </div>

      {buttons.length === 0 ? (
        <div className="rounded-[12px] bg-black/10 px-4 py-5 text-center text-xs text-textMuted">当前还没有按钮。</div>
      ) : (
        <div className="space-y-3">
          {buttons.map((button, index) => (
            <div key={button.id} className="rounded-[14px] bg-black/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs text-white">按钮 #{index + 1}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => moveButton(button.id, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveButton(button.id, 1)} disabled={index === buttons.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => removeButton(button.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-rose-500/12 text-rose-200 transition hover:bg-rose-500/18"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>按钮文字</span>
                  <input value={button.text} onChange={(event) => updateButton(button.id, { text: event.target.value })} placeholder="立即联系" className={SOFT_INPUT_CLASS} />
                </label>
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>按钮链接</span>
                  <input value={button.url} onChange={(event) => updateButton(button.id, { url: event.target.value })} placeholder="https://..." className={SOFT_INPUT_CLASS} />
                </label>
                <div className="md:col-span-2">
                  <div className="mb-2 text-sm text-textMuted">按钮颜色</div>
                  <ButtonStyleSelect value={button.style} onChange={(value) => updateButton(button.id, { style: value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function readActiveBot(runtimeBots: BotCenterBotState[], activeBotId: string | null) {
  return runtimeBots.find((bot) => bot.id === activeBotId) ?? runtimeBots[0] ?? null
}

export default memo(function BotCenterView() {
  const init = useBotCenterStore((state) => state.init)
  const runtime = useBotCenterStore((state) => state.state)
  const loading = useBotCenterStore((state) => state.loading)
  const saving = useBotCenterStore((state) => state.saving)
  const addBot = useBotCenterStore((state) => state.addBot)
  const removeBot = useBotCenterStore((state) => state.removeBot)
  const selectBot = useBotCenterStore((state) => state.selectBot)
  const saveConfig = useBotCenterStore((state) => state.saveConfig)
  const refreshProfile = useBotCenterStore((state) => state.refreshProfile)
  const start = useBotCenterStore((state) => state.start)
  const stop = useBotCenterStore((state) => state.stop)
  const clearLogs = useBotCenterStore((state) => state.clearLogs)

  const activeBot = useMemo(() => readActiveBot(runtime.bots, runtime.activeBotId), [runtime.activeBotId, runtime.bots])
  const runningCount = useMemo(() => runtime.bots.filter((bot) => bot.running).length, [runtime.bots])

  const [name, setName] = useState('')
  const [botToken, setBotToken] = useState('')
  const [guestReplyTitle, setGuestReplyTitle] = useState('')
  const [guestReplyText, setGuestReplyText] = useState('')
  const [guestReplyType, setGuestReplyType] = useState<BotCenterReplyKind>('text')
  const [guestReplyImageUrl, setGuestReplyImageUrl] = useState('')
  const [guestReplyButtons, setGuestReplyButtons] = useState<BotCenterReplyButton[]>([])
  const [autoStart, setAutoStart] = useState(false)
  const [guestReplyEnabled, setGuestReplyEnabled] = useState(true)
  const [keywordRules, setKeywordRules] = useState<BotCenterKeywordRule[]>([])

  useEffect(() => { void init() }, [init])

  useEffect(() => {
    if (!activeBot) return
    setName(activeBot.config.name)
    setBotToken(activeBot.config.botToken)
    setGuestReplyTitle(activeBot.config.guestReplyTitle)
    setGuestReplyText(activeBot.config.guestReplyText)
    setGuestReplyType(activeBot.config.guestReplyType)
    setGuestReplyImageUrl(activeBot.config.guestReplyImageUrl)
    setGuestReplyButtons(activeBot.config.guestReplyButtons.map((item) => ({ ...item })))
    setAutoStart(activeBot.config.autoStart)
    setGuestReplyEnabled(activeBot.config.guestReplyEnabled)
    setKeywordRules(activeBot.config.keywordRules.map((item) => ({ ...item, buttons: item.buttons.map((button) => ({ ...button })) })))
  }, [activeBot])

  const dirty = useMemo(() => {
    if (!activeBot) return false
    return JSON.stringify({
      name,
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
      name: activeBot.config.name,
      botToken: activeBot.config.botToken,
      guestReplyTitle: activeBot.config.guestReplyTitle,
      guestReplyText: activeBot.config.guestReplyText,
      guestReplyType: activeBot.config.guestReplyType,
      guestReplyImageUrl: activeBot.config.guestReplyImageUrl,
      guestReplyButtons: activeBot.config.guestReplyButtons,
      autoStart: activeBot.config.autoStart,
      guestReplyEnabled: activeBot.config.guestReplyEnabled,
      keywordRules: activeBot.config.keywordRules
    })
  }, [activeBot, autoStart, botToken, guestReplyButtons, guestReplyEnabled, guestReplyImageUrl, guestReplyText, guestReplyTitle, guestReplyType, keywordRules, name])

  const updateRule = (id: string, patch: Partial<BotCenterKeywordRule>) => {
    setKeywordRules((current) => current.map((item) => item.id !== id ? item : { ...item, ...patch }))
  }

  const addRule = () => setKeywordRules((current) => [...current, createLocalRule()])
  const removeRule = (id: string) => setKeywordRules((current) => current.filter((item) => item.id !== id))
  const moveRule = (id: string, direction: -1 | 1) => {
    setKeywordRules((current) => {
      const index = current.findIndex((item) => item.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [rule] = next.splice(index, 1)
      next.splice(target, 0, rule)
      return next
    })
  }

  const openBotFather = () => { void window.desktopWindow?.openExternal?.('https://t.me/BotFather') }

  if (!activeBot) return null

  return (
    <div className="contain-layout">
      <GlassPanel className="min-h-[720px] bg-card p-0">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">机器人中心</div>
              <div className="mt-1 text-xs leading-6 text-textMuted">收成和其他模块一样的工作台样式了，当前支持 <span className="font-semibold text-white">多机器人部署</span>，每个机器人独立配置、独立启动。</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill active={runtime.bots.length > 1} text={`已部署 ${runtime.bots.length} 个`} />
              <StatusPill active={runningCount > 0} text={`运行中 ${runningCount} 个`} />
              <StatusPill active={activeBot.profile.valid} text={activeBot.profile.valid ? '当前 Bot 已连通' : '当前 Bot 未验证'} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {runtime.bots.map((bot) => {
              const active = bot.id === activeBot.id
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => void selectBot(bot.id)}
                  className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-200' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${bot.running ? 'bg-emerald-300' : bot.profile.supportsGuestQueries ? 'bg-sky-300' : 'bg-white/25'}`} />
                  {bot.config.name || '未命名机器人'}
                </button>
              )
            })}
            <button type="button" onClick={() => void addBot()} className="inline-flex items-center gap-2 rounded-[14px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">
              <Plus size={15} />新增机器人
            </button>
            {runtime.bots.length > 1 ? (
              <button type="button" onClick={() => void removeBot(activeBot.id)} className="inline-flex items-center gap-2 rounded-[14px] bg-rose-500/12 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-500/18">
                <Trash2 size={15} />删除当前机器人
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 px-5 pb-5">
          <div className="rounded-[16px] bg-panel p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">当前机器人</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.profile.username ? `@${activeBot.profile.username}` : activeBot.config.name}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">Guest Mode</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.profile.supportsGuestQueries ? '已开启' : '未开启'}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">监听状态</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.running ? '监听中' : '未监听'}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">收到 Guest 消息</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.stats.receivedGuestCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">接入配置</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">每个机器人单独保存 Token、默认回复、关键词规则，适合你现在一台软件里同时挂多个 Bot。</div>
              </div>
              {loading ? <Loader2 size={18} className="animate-spin text-textMuted" /> : null}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>机器人名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="比如：客服机器人 1" className={SOFT_INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>Bot Token</span>
                <input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="123456:AA..." className={SOFT_INPUT_CLASS} />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[14px] bg-black/10 px-4 py-4 text-sm text-textMuted">
                <span>启动软件时自动拉起当前机器人</span>
                <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} className="h-4 w-4 accent-sky-400" />
              </label>
              <label className="flex items-center justify-between rounded-[14px] bg-black/10 px-4 py-4 text-sm text-textMuted">
                <span>收到 Guest 消息后自动回复</span>
                <input type="checkbox" checked={guestReplyEnabled} onChange={(event) => setGuestReplyEnabled(event.target.checked)} className="h-4 w-4 accent-sky-400" />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={saving || !dirty} onClick={() => void saveConfig(activeBot.id, { name, botToken, guestReplyTitle, guestReplyText, guestReplyType, guestReplyImageUrl, guestReplyButtons, autoStart, guestReplyEnabled, keywordRules })} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}保存配置
              </button>
              <button type="button" disabled={saving || loading} onClick={() => void refreshProfile(activeBot.id)} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw size={16} />检查 Bot / Guest Mode
              </button>
              <button type="button" disabled={saving || activeBot.running} onClick={() => void start(activeBot.id)} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-emerald-500 px-4 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                <Play size={16} />启动监听
              </button>
              <button type="button" disabled={saving || !activeBot.running} onClick={() => void stop(activeBot.id)} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-amber-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                <Square size={16} />停止监听
              </button>
              <button type="button" onClick={openBotFather} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]">
                <Bot size={16} />打开 BotFather
              </button>
            </div>
          </div>

          <div className="rounded-[16px] bg-panel p-5">
            <div className="text-sm font-semibold text-white">默认回复配置</div>
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>回复标题</span>
                <input value={guestReplyTitle} onChange={(event) => setGuestReplyTitle(event.target.value)} placeholder="TG-Matrix" className={SOFT_INPUT_CLASS} />
              </label>

              <div>
                <div className="mb-2 text-sm text-textMuted">回复类型</div>
                <ReplyTypeTabs value={guestReplyType} onChange={setGuestReplyType} />
              </div>

              {guestReplyType === 'photo' ? (
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>图片 URL</span>
                  <input value={guestReplyImageUrl} onChange={(event) => setGuestReplyImageUrl(event.target.value)} placeholder="https://..." className={SOFT_INPUT_CLASS} />
                </label>
              ) : null}

              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>{guestReplyType === 'photo' ? '图片说明 / 文案' : 'Guest 自动回复内容'}</span>
                <textarea value={guestReplyText} onChange={(event) => setGuestReplyText(event.target.value)} rows={6} className={SOFT_TEXTAREA_CLASS} />
              </label>

              <ButtonsEditor title="默认回复按钮" buttons={guestReplyButtons} onChange={setGuestReplyButtons} />

              <div className="rounded-[14px] bg-black/10 px-4 py-3 text-xs leading-6 text-textMuted">
                可用变量：<span className="text-white">{'{text}'}</span>、<span className="text-white">{'{caller_name}'}</span>、<span className="text-white">{'{caller_username}'}</span>、<span className="text-white">{'{chat_title}'}</span>、<span className="text-white">{'{bot_username}'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">关键词回复</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">优先级就是当前列表顺序，越靠上越先生效；这一块也跟其他模块一样，收成单列工作台，不再做复杂分栏。</div>
              </div>
              <button type="button" onClick={addRule} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-violet-400/10 px-4 text-sm text-violet-200 transition hover:bg-violet-400/16">
                <Plus size={16} />新增关键词
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {keywordRules.length === 0 ? (
                <div className="rounded-[14px] bg-black/10 px-4 py-8 text-center text-sm text-textMuted">还没有关键词规则。你可以加多个，然后上下移动控制优先级。</div>
              ) : keywordRules.map((rule, index) => (
                <div key={rule.id} className="space-y-4 rounded-[16px] bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">关键词规则 #{index + 1}</div>
                      <div className="mt-1 text-xs text-textMuted">当前优先级：{index + 1}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => moveRule(rule.id, -1)} disabled={index === 0} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowUp size={15} /></button>
                      <button type="button" onClick={() => moveRule(rule.id, 1)} disabled={index === keywordRules.length - 1} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowDown size={15} /></button>
                      <label className="inline-flex items-center gap-2 text-xs text-textMuted"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} className="h-4 w-4 accent-sky-400" />启用</label>
                      <button type="button" onClick={() => removeRule(rule.id)} className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-rose-500/12 px-3 text-xs text-rose-200 transition hover:bg-rose-500/18"><Trash2 size={14} />删除</button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-textMuted">
                      <span>关键词</span>
                      <input value={rule.keyword} onChange={(event) => updateRule(rule.id, { keyword: event.target.value })} placeholder="比如：价格" className={SOFT_INPUT_CLASS} />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-textMuted">
                      <span>回复标题</span>
                      <input value={rule.title} onChange={(event) => updateRule(rule.id, { title: event.target.value })} placeholder="TG-Matrix" className={SOFT_INPUT_CLASS} />
                    </label>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[0.78fr_1fr]">
                    <div className="space-y-4 rounded-[14px] bg-black/10 p-4">
                      <div>
                        <div className="mb-2 text-sm text-textMuted">匹配方式</div>
                        <MatchTypeTabs value={rule.matchType} onChange={(value) => updateRule(rule.id, { matchType: value })} />
                      </div>
                      <div>
                        <div className="mb-2 text-sm text-textMuted">回复类型</div>
                        <ReplyTypeTabs value={rule.replyType} onChange={(value) => updateRule(rule.id, { replyType: value })} />
                      </div>
                      <label className="flex items-center justify-between rounded-[12px] bg-white/[0.03] px-3 py-3 text-sm text-textMuted">
                        <span>命中后允许回复</span>
                        <input type="checkbox" checked={rule.replyEnabled} onChange={(event) => updateRule(rule.id, { replyEnabled: event.target.checked })} className="h-4 w-4 accent-sky-400" />
                      </label>
                    </div>

                    <div className="space-y-4">
                      {rule.replyType === 'photo' ? (
                        <label className="flex flex-col gap-2 text-sm text-textMuted">
                          <span>图片 URL</span>
                          <input value={rule.imageUrl} onChange={(event) => updateRule(rule.id, { imageUrl: event.target.value })} placeholder="https://..." className={SOFT_INPUT_CLASS} />
                        </label>
                      ) : null}

                      <label className="flex flex-col gap-2 text-sm text-textMuted">
                        <span>{rule.replyType === 'photo' ? '图片说明 / 文案' : '回复内容'}</span>
                        <textarea value={rule.text} onChange={(event) => updateRule(rule.id, { text: event.target.value })} rows={5} className={SOFT_TEXTAREA_CLASS} />
                      </label>

                      <ButtonsEditor title="关键词命中按钮" buttons={rule.buttons} onChange={(buttons) => updateRule(rule.id, { buttons })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">运行日志</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">这里只看当前机器人最近 200 条日志；多个机器人互不影响，切 tab 就切到对应日志。</div>
              </div>
              <button type="button" disabled={saving || activeBot.logs.length === 0} onClick={() => void clearLogs(activeBot.id)} className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 text-xs text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">
                <Trash2 size={14} />清空日志
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">成功回复</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.stats.answeredGuestCount}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">回复失败</div>
                <div className="mt-1 text-sm font-medium text-white">{activeBot.stats.failedGuestCount}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">最近轮询</div>
                <div className="mt-1 text-sm font-medium text-white">{formatDateTimeFull(activeBot.lastPollAt)}</div>
              </div>
              <div className="rounded-[14px] bg-black/10 px-4 py-3">
                <div className="text-xs text-textMuted">最近 Guest 消息</div>
                <div className="mt-1 text-sm font-medium text-white">{formatDateTimeFull(activeBot.stats.lastGuestAt)}</div>
              </div>
            </div>

            {activeBot.lastActionMessage ? <div className="mt-4 rounded-[12px] bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 select-text cursor-text">{activeBot.lastActionMessage}</div> : null}
            {activeBot.lastError ? <div className="mt-4 rounded-[12px] bg-rose-400/10 px-4 py-3 text-sm text-rose-200 select-text cursor-text">{activeBot.lastError}</div> : null}

            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1 select-text">
              {activeBot.logs.length === 0 ? (
                <div className="rounded-[14px] bg-black/10 px-4 py-10 text-center text-sm text-textMuted">还没有日志。先保存 Token，再检查 Guest Mode，最后启动监听。</div>
              ) : activeBot.logs.map((log) => (
                <div key={log.id} className={`rounded-[12px] px-4 py-3 text-sm cursor-text select-text ${log.level === 'error' ? 'bg-rose-400/10 text-rose-200' : log.level === 'warning' ? 'bg-amber-400/10 text-amber-100' : log.level === 'success' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-black/10 text-slate-200'}`}>
                  <div className="mb-1 text-[11px] text-white/45 select-text">{formatDateTimeFull(log.createdAt)}</div>
                  <div className="leading-6 select-text">{log.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  )
})
