import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CircleAlert,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Type,
  Wand2
} from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useBotCenterStore } from '../../stores/botcenterstore'
import { formatDateTimeFull } from '../../lib/ui-text'
import type {
  BotCenterBotState,
  BotCenterButtonStyle,
  BotCenterKeywordMatchType,
  BotCenterKeywordRule,
  BotCenterReplyButton,
  BotCenterReplyKind,
  BotCenterLogLevel
} from '../../types'

const SOFT_INPUT_CLASS = 'h-11 rounded-[12px] border border-white/[0.06] bg-black/10 px-3 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TEXTAREA_CLASS = 'rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none transition focus:border-white/[0.12] focus:bg-black/12'
const SOFT_TAB_CLASS = 'border border-white/[0.06] transition'
const SOFT_CARD_CLASS = 'rounded-[16px] border border-white/[0.06] bg-card'

type BotCenterPageKey = 'overview' | 'basic' | 'guest' | 'keywords' | 'logs'

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

function readActiveBot(runtimeBots: BotCenterBotState[], activeBotId: string | null) {
  return runtimeBots.find((bot) => bot.id === activeBotId) ?? runtimeBots[0] ?? null
}

function StatusPill({ active, text }: { active: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center rounded-[999px] px-3 py-1 text-xs ${active ? 'bg-violet-400/12 text-violet-200' : 'bg-white/[0.05] text-textMuted'}`}>
      {text}
    </span>
  )
}

function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center rounded-[12px] px-4 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-200' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
    >
      {label}
    </button>
  )
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'success' | 'danger' | 'violet' }) {
  const toneClass = tone === 'success'
    ? 'text-emerald-200'
    : tone === 'danger'
      ? 'text-rose-200'
      : tone === 'violet'
        ? 'text-violet-200'
        : 'text-white'

  return (
    <div className="rounded-[14px] bg-black/10 px-4 py-3">
      <div className="text-xs text-textMuted">{label}</div>
      <div className={`mt-1 text-sm font-medium ${toneClass}`}>{value}</div>
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[14px] bg-black/10 px-4 py-4">
      <div>
        <div className="text-sm text-white">{label}</div>
        <div className="mt-1 text-xs leading-5 text-textMuted">{hint}</div>
      </div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-sky-400" />
    </label>
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
    <div className="space-y-3 rounded-[16px] bg-black/10 p-4">
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
            <div key={button.id} className="rounded-[14px] border border-white/[0.04] bg-black/20 p-3">
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

function ImageUploadField({
  label,
  value,
  onChange,
  onClear,
  hint
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  hint?: string
}) {
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="space-y-3 text-sm text-textMuted">
      <div>{label}</div>
      <label className="block cursor-pointer rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 text-white transition hover:border-white/[0.12] hover:bg-black/12 file:mr-3 file:rounded-[8px] file:border-0 file:bg-violet-400/14 file:px-3 file:py-2 file:text-sm file:text-violet-300">
        <input type="file" accept="image/*" onChange={handleUpload} className="w-full text-sm text-white file:mr-3 file:rounded-[8px] file:border-0 file:bg-violet-400/14 file:px-3 file:py-2 file:text-sm file:text-violet-300" />
      </label>
      <div className="flex items-center justify-between rounded-[12px] bg-black/10 px-4 py-3 text-xs text-textMuted">
        <span>{value ? '已上传本地图片' : '还没上传图片'}</span>
        {value ? <button type="button" onClick={onClear} className="text-white transition hover:text-rose-200">删除图片</button> : null}
      </div>
      {value ? <img src={value} alt="上传预览" className="max-h-56 w-full rounded-[14px] border border-white/[0.06] object-contain bg-black/10" /> : null}
      {hint ? <div className="text-xs leading-5 text-textMuted">{hint}</div> : null}
    </div>
  )
}

function ReadinessCard({ activeBot }: { activeBot: BotCenterBotState }) {
  const checks = [
    {
      label: 'Token 已填写',
      passed: Boolean(activeBot.config.botToken.trim()),
      hint: activeBot.config.botToken.trim() ? '当前机器人已录入 Token。' : '先把 BotFather 给你的 Token 填进去。'
    },
    {
      label: '机器人资料已验证',
      passed: activeBot.profile.valid,
      hint: activeBot.profile.valid ? `当前识别为 @${activeBot.profile.username || '未命名机器人'}` : '建议点一次“刷新信息”，先确认这个 Token 能正常连接。'
    },
    {
      label: '游客自动回复已开启',
      passed: activeBot.config.guestReplyEnabled,
      hint: activeBot.config.guestReplyEnabled ? '未进群用户发消息时会按默认规则回复。' : '如果你需要接待陌生人，建议把默认回复打开。'
    },
    {
      label: '关键词规则已准备',
      passed: activeBot.config.keywordRules.some((rule) => rule.enabled && rule.replyEnabled && rule.keyword.trim()),
      hint: activeBot.config.keywordRules.some((rule) => rule.enabled && rule.replyEnabled && rule.keyword.trim()) ? '已经有可生效的关键词规则。' : '如果你要做分流或问答，去“关键词”页加规则会更顺手。'
    }
  ]

  return (
    <div className={`${SOFT_CARD_CLASS} p-5`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Wand2 size={16} className="text-violet-200" />
        快速检查
      </div>
      <div className="mt-4 space-y-3">
        {checks.map((item) => (
          <div key={item.label} className="rounded-[14px] bg-black/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-white">{item.label}</div>
              <StatusPill active={item.passed} text={item.passed ? '已就绪' : '待处理'} />
            </div>
            <div className="mt-2 text-xs leading-5 text-textMuted">{item.hint}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatLogTone(level: BotCenterLogLevel) {
  if (level === 'error') return 'bg-rose-400/10 text-rose-200'
  if (level === 'warning') return 'bg-amber-400/10 text-amber-100'
  if (level === 'success') return 'bg-emerald-400/10 text-emerald-200'
  return 'bg-black/10 text-slate-200'
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

  const [activePage, setActivePage] = useState<BotCenterPageKey>('overview')
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
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

  useEffect(() => {
    if (keywordRules.length === 0) {
      setSelectedRuleId(null)
      return
    }
    if (!selectedRuleId || !keywordRules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(keywordRules[0]?.id ?? null)
    }
  }, [keywordRules, selectedRuleId])

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

  const selectedRule = useMemo(
    () => keywordRules.find((rule) => rule.id === selectedRuleId) ?? keywordRules[0] ?? null,
    [keywordRules, selectedRuleId]
  )

  const updateRule = (id: string, patch: Partial<BotCenterKeywordRule>) => {
    setKeywordRules((current) => current.map((item) => item.id !== id ? item : { ...item, ...patch }))
  }

  const addRule = () => {
    const nextRule = createLocalRule()
    setKeywordRules((current) => [...current, nextRule])
    setSelectedRuleId(nextRule.id)
  }

  const removeRule = (id: string) => {
    setKeywordRules((current) => current.filter((item) => item.id !== id))
    if (selectedRuleId === id) {
      const nextRule = keywordRules.find((item) => item.id !== id)
      setSelectedRuleId(nextRule?.id ?? null)
    }
  }

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

  const saveCurrentBot = async () => {
    await saveConfig(activeBot.id, {
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
    })
  }

  return (
    <div className="contain-layout">
      <GlassPanel className="min-h-[720px] bg-card p-0">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">机器人中心</div>
              <div className="mt-1 text-xs leading-6 text-textMuted">我把它收成了更清晰的工作台：先选机器人，再切页处理基础配置、默认回复、关键词和日志，不再一屏挤满所有设置。</div>
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

        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <SectionTab active={activePage === 'overview'} label="概览" onClick={() => setActivePage('overview')} />
              <SectionTab active={activePage === 'basic'} label="基础配置" onClick={() => setActivePage('basic')} />
              <SectionTab active={activePage === 'guest'} label="默认回复" onClick={() => setActivePage('guest')} />
              <SectionTab active={activePage === 'keywords'} label="关键词" onClick={() => setActivePage('keywords')} />
              <SectionTab active={activePage === 'logs'} label="运行日志" onClick={() => setActivePage('logs')} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void refreshProfile(activeBot.id)} disabled={saving || !botToken.trim()} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw size={15} />刷新信息
              </button>
              {activeBot.running ? (
                <button type="button" onClick={() => void stop(activeBot.id)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-rose-500/12 px-4 text-sm text-rose-200 transition hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60">
                  <Square size={15} />停止监听
                </button>
              ) : (
                <button type="button" onClick={() => void start(activeBot.id)} disabled={saving || !activeBot.profile.valid} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-emerald-500/14 px-4 text-sm text-emerald-200 transition hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-60">
                  <Play size={15} />开始监听
                </button>
              )}
              <button type="button" onClick={() => void saveCurrentBot()} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 text-sm text-violet-200 transition hover:bg-violet-400/18 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                保存当前机器人
              </button>
            </div>
          </div>

          {dirty ? <div className="mt-3 text-xs text-amber-200">当前页有未保存改动，切机器人前建议先保存。</div> : null}
        </div>

        <div className="space-y-5 px-5 py-5">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[16px] bg-panel text-sm text-textMuted">
              <Loader2 size={18} className="mr-2 animate-spin" />正在读取机器人中心...
            </div>
          ) : null}

          {!loading && activePage === 'overview' ? (
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                <div className={`${SOFT_CARD_CLASS} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Bot size={16} className="text-violet-200" />
                        当前机器人概览
                      </div>
                      <div className="mt-2 text-xs leading-6 text-textMuted">把最常用的信息都放到第一屏：身份、运行状态、最近动作、最近收件情况，一进来就能看明白。</div>
                    </div>
                    <StatusPill active={activeBot.running} text={activeBot.running ? '监听中' : '未启动'} />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="机器人名称" value={activeBot.config.name || '未命名'} tone="violet" />
                    <StatCard label="用户名" value={activeBot.profile.username ? `@${activeBot.profile.username}` : '未读取'} />
                    <StatCard label="最近轮询" value={formatDateTimeFull(activeBot.lastPollAt)} />
                    <StatCard label="最近陌生消息" value={formatDateTimeFull(activeBot.stats.lastGuestAt)} />
                    <StatCard label="已收到 Guest" value={activeBot.stats.receivedGuestCount} />
                    <StatCard label="成功回复" value={activeBot.stats.answeredGuestCount} tone="success" />
                    <StatCard label="回复失败" value={activeBot.stats.failedGuestCount} tone="danger" />
                    <StatCard label="关键词规则" value={keywordRules.length} />
                  </div>

                  {activeBot.lastActionMessage ? <div className="mt-4 rounded-[12px] bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 select-text cursor-text">{activeBot.lastActionMessage}</div> : null}
                  {activeBot.lastError ? <div className="mt-4 rounded-[12px] bg-rose-400/10 px-4 py-3 text-sm text-rose-200 select-text cursor-text">{activeBot.lastError}</div> : null}
                </div>

                <div className={`${SOFT_CARD_CLASS} p-5`}>
                  <div className="text-sm font-semibold text-white">一眼知道下一步做什么</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    <button type="button" onClick={() => setActivePage('basic')} className="rounded-[14px] bg-black/10 px-4 py-4 text-left transition hover:bg-black/20">
                      <div className="text-sm text-white">1. 填 Token</div>
                      <div className="mt-2 text-xs leading-5 text-textMuted">先把机器人身份配好，再刷新连通信息。</div>
                    </button>
                    <button type="button" onClick={() => setActivePage('guest')} className="rounded-[14px] bg-black/10 px-4 py-4 text-left transition hover:bg-black/20">
                      <div className="text-sm text-white">2. 设默认回复</div>
                      <div className="mt-2 text-xs leading-5 text-textMuted">陌生人没命中关键词时，就走这里的接待文案。</div>
                    </button>
                    <button type="button" onClick={() => setActivePage('keywords')} className="rounded-[14px] bg-black/10 px-4 py-4 text-left transition hover:bg-black/20">
                      <div className="text-sm text-white">3. 配关键词</div>
                      <div className="mt-2 text-xs leading-5 text-textMuted">把常见问题拆成规则，后续维护会轻松很多。</div>
                    </button>
                  </div>
                </div>
              </div>

              <ReadinessCard activeBot={activeBot} />
            </div>
          ) : null}

          {!loading && activePage === 'basic' ? (
            <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
              <div className={`${SOFT_CARD_CLASS} p-5`}>
                <div className="text-sm font-semibold text-white">基础配置</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">这一页只保留最核心的身份配置，不再和关键词、日志混在一起。</div>

                <div className="mt-4 grid gap-4">
                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>机器人名称</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="比如：客服机器人 1" className={SOFT_INPUT_CLASS} />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>Bot Token</span>
                    <textarea value={botToken} onChange={(event) => setBotToken(event.target.value)} rows={4} placeholder="把 BotFather 给你的 Token 粘贴到这里" className={SOFT_TEXTAREA_CLASS} />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={openBotFather} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]">
                      <Bot size={15} />打开 BotFather
                    </button>
                    <button type="button" onClick={() => void refreshProfile(activeBot.id)} disabled={saving || !botToken.trim()} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-violet-400/10 px-4 text-sm text-violet-200 transition hover:bg-violet-400/16 disabled:cursor-not-allowed disabled:opacity-60">
                      <RefreshCw size={15} />读取机器人信息
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className={`${SOFT_CARD_CLASS} p-5`}>
                  <div className="text-sm font-semibold text-white">启动行为</div>
                  <div className="mt-4 space-y-3">
                    <ToggleRow label="开机后自动启动" hint="保存后，下次进入软件会自动拉起这个机器人。" checked={autoStart} onChange={setAutoStart} />
                  </div>
                </div>

                <div className={`${SOFT_CARD_CLASS} p-5`}>
                  <div className="text-sm font-semibold text-white">当前识别结果</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <StatCard label="验证状态" value={activeBot.profile.valid ? '已连通' : '未验证'} tone={activeBot.profile.valid ? 'success' : 'danger'} />
                    <StatCard label="用户名" value={activeBot.profile.username ? `@${activeBot.profile.username}` : '-'} />
                    <StatCard label="显示名称" value={activeBot.profile.firstName || '-'} />
                    <StatCard label="上次读取" value={formatDateTimeFull(activeBot.profile.fetchedAt)} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && activePage === 'guest' ? (
            <div className="grid gap-5 xl:grid-cols-[1fr_0.92fr]">
              <div className={`${SOFT_CARD_CLASS} p-5`}>
                <div className="text-sm font-semibold text-white">默认回复</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">陌生人发消息但没命中关键词时，就用这一套回复。先把基础默认话术收好，再去配更细的关键词规则。</div>

                <div className="mt-4 space-y-4">
                  <ToggleRow label="开启游客自动回复" hint="关闭后，机器人只会接收消息，不主动回复陌生人。" checked={guestReplyEnabled} onChange={setGuestReplyEnabled} />

                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>回复标题</span>
                    <input value={guestReplyTitle} onChange={(event) => setGuestReplyTitle(event.target.value)} placeholder="TG-Matrix" className={SOFT_INPUT_CLASS} />
                  </label>

                  <div>
                    <div className="mb-2 text-sm text-textMuted">回复类型</div>
                    <ReplyTypeTabs value={guestReplyType} onChange={setGuestReplyType} />
                  </div>

                  {guestReplyType === 'photo' ? (
                    <ImageUploadField
                      label="上传图片"
                      value={guestReplyImageUrl}
                      onChange={setGuestReplyImageUrl}
                      onClear={() => setGuestReplyImageUrl('')}
                      hint="这里改成直接上传本地图片，不用再填 URL。保存后会跟默认回复一起走。"
                    />
                  ) : null}

                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>{guestReplyType === 'photo' ? '图片说明 / 文案' : '回复内容'}</span>
                    <textarea value={guestReplyText} onChange={(event) => setGuestReplyText(event.target.value)} rows={8} className={SOFT_TEXTAREA_CLASS} />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <ButtonsEditor title="默认回复按钮" buttons={guestReplyButtons} onChange={setGuestReplyButtons} />
                <div className={`${SOFT_CARD_CLASS} p-5`}>
                  <div className="text-sm font-semibold text-white">写法提醒</div>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-textMuted">
                    <div className="rounded-[14px] bg-black/10 px-4 py-3">支持在文案里使用 <span className="text-white">{'{text}'}</span>，自动带上用户刚发来的原消息。</div>
                    <div className="rounded-[14px] bg-black/10 px-4 py-3">如果你只需要一个统一接待口径，默认回复就够了，不一定要一开始就堆很多关键词。</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && activePage === 'keywords' ? (
            <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
              <div className={`${SOFT_CARD_CLASS} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">关键词列表</div>
                    <div className="mt-2 text-sm leading-6 text-textMuted">左边只看规则清单，右边只改当前选中的那一条，避免一屏滚半天。</div>
                  </div>
                  <button type="button" onClick={addRule} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-violet-400/10 px-4 text-sm text-violet-200 transition hover:bg-violet-400/16">
                    <Plus size={16} />新增关键词
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {keywordRules.length === 0 ? (
                    <div className="rounded-[14px] bg-black/10 px-4 py-8 text-center text-sm text-textMuted">还没有关键词规则。先点右上角新增一个就行。</div>
                  ) : keywordRules.map((rule, index) => {
                    const active = selectedRule?.id === rule.id
                    return (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => setSelectedRuleId(rule.id)}
                        className={`w-full rounded-[14px] border px-4 py-4 text-left transition ${active ? 'border-white/[0.12] bg-violet-400/10' : 'border-white/[0.04] bg-black/10 hover:border-white/[0.08] hover:bg-black/20'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-white">{rule.keyword.trim() || `未命名规则 #${index + 1}`}</div>
                            <div className="mt-1 text-xs text-textMuted">{rule.matchType === 'contains' ? '包含匹配' : '完全匹配'} · {rule.replyType === 'photo' ? '图片回复' : '文字回复'}</div>
                          </div>
                          <StatusPill active={rule.enabled && rule.replyEnabled} text={rule.enabled && rule.replyEnabled ? '启用中' : '已停用'} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={`${SOFT_CARD_CLASS} p-5`}>
                {selectedRule ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">编辑当前关键词</div>
                        <div className="mt-1 text-xs text-textMuted">优先级按左侧列表顺序决定，越靠上越先生效。</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => moveRule(selectedRule.id, -1)} disabled={keywordRules.findIndex((item) => item.id === selectedRule.id) === 0} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowUp size={15} /></button>
                        <button type="button" onClick={() => moveRule(selectedRule.id, 1)} disabled={keywordRules.findIndex((item) => item.id === selectedRule.id) === keywordRules.length - 1} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"><ArrowDown size={15} /></button>
                        <button type="button" onClick={() => removeRule(selectedRule.id)} className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-rose-500/12 px-3 text-xs text-rose-200 transition hover:bg-rose-500/18"><Trash2 size={14} />删除</button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-textMuted">
                        <span>关键词</span>
                        <input value={selectedRule.keyword} onChange={(event) => updateRule(selectedRule.id, { keyword: event.target.value })} placeholder="比如：价格" className={SOFT_INPUT_CLASS} />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-textMuted">
                        <span>回复标题</span>
                        <input value={selectedRule.title} onChange={(event) => updateRule(selectedRule.id, { title: event.target.value })} placeholder="TG-Matrix" className={SOFT_INPUT_CLASS} />
                      </label>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[0.82fr_1fr]">
                      <div className="space-y-4 rounded-[14px] bg-black/10 p-4">
                        <div>
                          <div className="mb-2 text-sm text-textMuted">匹配方式</div>
                          <MatchTypeTabs value={selectedRule.matchType} onChange={(value) => updateRule(selectedRule.id, { matchType: value })} />
                        </div>
                        <div>
                          <div className="mb-2 text-sm text-textMuted">回复类型</div>
                          <ReplyTypeTabs value={selectedRule.replyType} onChange={(value) => updateRule(selectedRule.id, { replyType: value })} />
                        </div>
                        <ToggleRow label="启用这条规则" hint="关闭后会保留内容，但不会参与匹配。" checked={selectedRule.enabled} onChange={(checked) => updateRule(selectedRule.id, { enabled: checked })} />
                        <ToggleRow label="命中后允许回复" hint="如果你只想做命中统计，不想回复，可以先关掉。" checked={selectedRule.replyEnabled} onChange={(checked) => updateRule(selectedRule.id, { replyEnabled: checked })} />
                      </div>

                      <div className="space-y-4">
                        {selectedRule.replyType === 'photo' ? (
                          <ImageUploadField
                            label="上传图片"
                            value={selectedRule.imageUrl}
                            onChange={(value) => updateRule(selectedRule.id, { imageUrl: value })}
                            onClear={() => updateRule(selectedRule.id, { imageUrl: '' })}
                            hint="关键词命中后会直接用这张本地图片回复，不用再额外准备 URL。"
                          />
                        ) : null}

                        <label className="flex flex-col gap-2 text-sm text-textMuted">
                          <span>{selectedRule.replyType === 'photo' ? '图片说明 / 文案' : '回复内容'}</span>
                          <textarea value={selectedRule.text} onChange={(event) => updateRule(selectedRule.id, { text: event.target.value })} rows={7} className={SOFT_TEXTAREA_CLASS} />
                        </label>

                        <ButtonsEditor title="关键词命中按钮" buttons={selectedRule.buttons} onChange={(buttons) => updateRule(selectedRule.id, { buttons })} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center rounded-[14px] bg-black/10 text-sm text-textMuted">
                    先在左边新增一条关键词规则。
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!loading && activePage === 'logs' ? (
            <div className="space-y-5">
              <div className={`${SOFT_CARD_CLASS} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">运行日志</div>
                    <div className="mt-2 text-sm leading-6 text-textMuted">这里只看当前机器人最近 200 条日志，消息和错误都能直接选中复制。</div>
                  </div>
                  <button type="button" disabled={saving || activeBot.logs.length === 0} onClick={() => void clearLogs(activeBot.id)} className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 text-xs text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">
                    <Trash2 size={14} />清空日志
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="收到 Guest" value={activeBot.stats.receivedGuestCount} />
                  <StatCard label="成功回复" value={activeBot.stats.answeredGuestCount} tone="success" />
                  <StatCard label="回复失败" value={activeBot.stats.failedGuestCount} tone="danger" />
                  <StatCard label="最近轮询" value={formatDateTimeFull(activeBot.lastPollAt)} />
                </div>

                {activeBot.lastActionMessage ? <div className="mt-4 rounded-[12px] bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 select-text cursor-text">{activeBot.lastActionMessage}</div> : null}
                {activeBot.lastError ? <div className="mt-4 rounded-[12px] bg-rose-400/10 px-4 py-3 text-sm text-rose-200 select-text cursor-text">{activeBot.lastError}</div> : null}

                <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1 select-text">
                  {activeBot.logs.length === 0 ? (
                    <div className="rounded-[14px] bg-black/10 px-4 py-10 text-center text-sm text-textMuted">还没有日志。先保存 Token，再刷新机器人信息，最后开始监听。</div>
                  ) : activeBot.logs.map((log) => (
                    <div key={log.id} className={`rounded-[12px] px-4 py-3 text-sm cursor-text select-text ${formatLogTone(log.level)}`}>
                      <div className="mb-1 text-[11px] text-white/45 select-text">{formatDateTimeFull(log.createdAt)}</div>
                      <div className="leading-6 select-text">{log.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !['overview', 'basic', 'guest', 'keywords', 'logs'].includes(activePage) ? (
            <div className="rounded-[16px] bg-panel px-4 py-8 text-center text-sm text-textMuted">
              <CircleAlert size={16} className="mr-2 inline-block" />当前页面暂不可用。
            </div>
          ) : null}
        </div>
      </GlassPanel>
    </div>
  )
})
