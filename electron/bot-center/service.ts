import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type {
  BotCenterButtonStyle,
  BotCenterConfig,
  BotCenterKeywordMatchType,
  BotCenterKeywordRule,
  BotCenterLogEntry,
  BotCenterLogLevel,
  BotCenterProfile,
  BotCenterReplyButton,
  BotCenterReplyKind,
  BotCenterState,
  BotCenterStats
} from '../../src/types'

interface PersistedBotCenterPayload {
  config?: Partial<BotCenterConfig>
  profile?: Partial<BotCenterProfile>
  updateOffset?: number
}

const DEFAULT_BUTTON: BotCenterReplyButton = {
  id: '',
  text: '',
  url: '',
  style: 'primary'
}

const DEFAULT_KEYWORD_RULE: BotCenterKeywordRule = {
  id: '',
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

const DEFAULT_CONFIG: BotCenterConfig = {
  botToken: '',
  autoStart: false,
  guestReplyEnabled: true,
  guestReplyTitle: 'TG-Matrix',
  guestReplyText: '你好，我已收到你的召唤。\n\n你刚刚发送的是：{text}',
  guestReplyType: 'text',
  guestReplyImageUrl: '',
  guestReplyButtons: [],
  keywordRules: []
}

const DEFAULT_PROFILE: BotCenterProfile = {
  id: null,
  username: '',
  firstName: '',
  canJoinGroups: true,
  canReadAllGroupMessages: false,
  supportsGuestQueries: false,
  fetchedAt: null,
  valid: false
}

const DEFAULT_STATS: BotCenterStats = {
  receivedGuestCount: 0,
  answeredGuestCount: 0,
  failedGuestCount: 0,
  lastGuestAt: null
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeReplyKind(value: unknown, fallback: BotCenterReplyKind): BotCenterReplyKind {
  return value === 'photo' ? 'photo' : fallback
}

function normalizeMatchType(value: unknown, fallback: BotCenterKeywordMatchType): BotCenterKeywordMatchType {
  return value === 'equals' ? 'equals' : fallback
}

function normalizeButtonStyle(value: unknown, fallback: BotCenterButtonStyle): BotCenterButtonStyle {
  if (value === 'primary' || value === 'success' || value === 'danger' || value === 'default') {
    return value
  }
  return fallback
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeReplyButton(input?: Partial<BotCenterReplyButton>, index = 0): BotCenterReplyButton {
  return {
    id: normalizeString(input?.id) || createId(`btn-${index}`),
    text: normalizeString(input?.text),
    url: normalizeString(input?.url),
    style: normalizeButtonStyle(input?.style, DEFAULT_BUTTON.style)
  }
}

function normalizeButtons(input: unknown, legacy?: { enabled?: unknown; text?: unknown; url?: unknown; style?: unknown }): BotCenterReplyButton[] {
  if (Array.isArray(input)) {
    return input
      .map((item, index) => normalizeReplyButton(item as Partial<BotCenterReplyButton>, index))
      .filter((item) => item.text && item.url)
  }

  const legacyEnabled = normalizeBoolean(legacy?.enabled, false)
  const legacyText = normalizeString(legacy?.text)
  const legacyUrl = normalizeString(legacy?.url)
  if (legacyEnabled && legacyText && legacyUrl) {
    return [{
      id: createId('legacy-btn'),
      text: legacyText,
      url: legacyUrl,
      style: normalizeButtonStyle(legacy?.style, DEFAULT_BUTTON.style)
    }]
  }

  return []
}

function normalizeKeywordRule(input?: Partial<BotCenterKeywordRule> & Record<string, unknown>, index = 0): BotCenterKeywordRule {
  return {
    id: normalizeString(input?.id) || createId(`rule-${index}`),
    enabled: normalizeBoolean(input?.enabled, DEFAULT_KEYWORD_RULE.enabled),
    keyword: normalizeString(input?.keyword),
    matchType: normalizeMatchType(input?.matchType, DEFAULT_KEYWORD_RULE.matchType),
    replyEnabled: normalizeBoolean(input?.replyEnabled, DEFAULT_KEYWORD_RULE.replyEnabled),
    replyType: normalizeReplyKind(input?.replyType, DEFAULT_KEYWORD_RULE.replyType),
    title: normalizeString(input?.title, DEFAULT_KEYWORD_RULE.title) || DEFAULT_KEYWORD_RULE.title,
    text: typeof input?.text === 'string' && input.text.trim() ? input.text : DEFAULT_KEYWORD_RULE.text,
    imageUrl: normalizeString(input?.imageUrl),
    buttons: normalizeButtons((input as Record<string, unknown>)?.buttons, {
      enabled: (input as Record<string, unknown>)?.buttonEnabled,
      text: (input as Record<string, unknown>)?.buttonText,
      url: (input as Record<string, unknown>)?.buttonUrl,
      style: (input as Record<string, unknown>)?.buttonStyle
    })
  }
}

function normalizeKeywordRules(input: unknown): BotCenterKeywordRule[] {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => normalizeKeywordRule(item as Partial<BotCenterKeywordRule> & Record<string, unknown>, index))
}

function normalizeConfig(input?: Partial<BotCenterConfig> & Record<string, unknown>): BotCenterConfig {
  return {
    botToken: normalizeString(input?.botToken),
    autoStart: normalizeBoolean(input?.autoStart, DEFAULT_CONFIG.autoStart),
    guestReplyEnabled: normalizeBoolean(input?.guestReplyEnabled, DEFAULT_CONFIG.guestReplyEnabled),
    guestReplyTitle: normalizeString(input?.guestReplyTitle, DEFAULT_CONFIG.guestReplyTitle) || DEFAULT_CONFIG.guestReplyTitle,
    guestReplyText: typeof input?.guestReplyText === 'string' && input.guestReplyText.trim() ? input.guestReplyText : DEFAULT_CONFIG.guestReplyText,
    guestReplyType: normalizeReplyKind(input?.guestReplyType, DEFAULT_CONFIG.guestReplyType),
    guestReplyImageUrl: normalizeString(input?.guestReplyImageUrl),
    guestReplyButtons: normalizeButtons(input?.guestReplyButtons, {
      enabled: input?.guestReplyButtonEnabled,
      text: input?.guestReplyButtonText,
      url: input?.guestReplyButtonUrl,
      style: input?.guestReplyButtonStyle
    }),
    keywordRules: normalizeKeywordRules(input?.keywordRules)
  }
}

function normalizeProfile(input?: Partial<BotCenterProfile>): BotCenterProfile {
  return {
    id: typeof input?.id === 'number' && Number.isFinite(input.id) ? input.id : null,
    username: normalizeString(input?.username),
    firstName: normalizeString(input?.firstName),
    canJoinGroups: normalizeBoolean(input?.canJoinGroups, DEFAULT_PROFILE.canJoinGroups),
    canReadAllGroupMessages: normalizeBoolean(input?.canReadAllGroupMessages, DEFAULT_PROFILE.canReadAllGroupMessages),
    supportsGuestQueries: normalizeBoolean(input?.supportsGuestQueries, DEFAULT_PROFILE.supportsGuestQueries),
    fetchedAt: typeof input?.fetchedAt === 'string' && input.fetchedAt.trim() ? input.fetchedAt : null,
    valid: normalizeBoolean(input?.valid, DEFAULT_PROFILE.valid)
  }
}

function emptyState(config?: Partial<BotCenterConfig> & Record<string, unknown>, profile?: Partial<BotCenterProfile>, updateOffset = 0): BotCenterState {
  return {
    config: normalizeConfig({ ...DEFAULT_CONFIG, ...config }),
    profile: normalizeProfile({ ...DEFAULT_PROFILE, ...profile }),
    stats: { ...DEFAULT_STATS },
    running: false,
    polling: false,
    startedAt: null,
    lastPollAt: null,
    lastActionMessage: '',
    lastError: '',
    updateOffset: Number.isFinite(updateOffset) ? Math.max(0, Math.trunc(updateOffset)) : 0,
    logs: []
  }
}

function capLogs(logs: BotCenterLogEntry[]) {
  return logs.slice(0, 200)
}

function maskToken(token: string) {
  const trimmed = token.trim()
  if (!trimmed) return '未填写'
  if (trimmed.length <= 10) return `${trimmed.slice(0, 3)}***`
  return `${trimmed.slice(0, 5)}***${trimmed.slice(-4)}`
}

function buildLog(level: BotCenterLogLevel, message: string): BotCenterLogEntry {
  return {
    id: createId('log'),
    createdAt: new Date().toISOString(),
    level,
    message
  }
}

function applyTemplate(template: string, variables: Record<string, string>) {
  let output = template
  for (const [key, value] of Object.entries(variables)) {
    output = output.split(`{${key}}`).join(value)
  }
  return output
}

function normalizeKeywordText(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN')
}

interface GuestContext {
  text: string
  callerName: string
  callerUsername: string
  chatTitle: string
}

interface ResolvedReplyConfig {
  source: 'default' | 'keyword'
  ruleKeyword: string | null
  title: string
  text: string
  replyType: BotCenterReplyKind
  imageUrl: string
  buttons: BotCenterReplyButton[]
}

export class BotCenterService {
  private state: BotCenterState
  private readonly listeners = new Set<(state: BotCenterState) => void>()
  private loopPromise: Promise<void> | null = null
  private abortController: AbortController | null = null

  constructor(private readonly filePath: string) {
    this.state = this.loadState()
  }

  onState(listener: (state: BotCenterState) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState() {
    return this.cloneState()
  }

  async saveConfig(patch: Partial<BotCenterConfig>) {
    const wasRunning = this.state.running
    const previousToken = this.state.config.botToken
    const nextConfig = normalizeConfig({ ...this.state.config, ...patch })
    const tokenChanged = nextConfig.botToken !== previousToken

    if (wasRunning && tokenChanged) {
      await this.stop('Bot Token 已变更，正在重启监听。')
    }

    this.state = {
      ...this.state,
      config: nextConfig,
      updateOffset: tokenChanged ? 0 : this.state.updateOffset,
      profile: tokenChanged ? { ...DEFAULT_PROFILE } : this.state.profile,
      lastError: '',
      lastActionMessage: `机器人配置已保存，当前 Token：${maskToken(nextConfig.botToken)}`
    }
    this.persist()
    this.emit()

    if (nextConfig.botToken) {
      await this.refreshProfile(false)
    }

    if (wasRunning && tokenChanged && nextConfig.botToken) {
      await this.start()
    }

    return this.cloneState()
  }

  async refreshProfile(clearLastMessage = true) {
    const token = this.state.config.botToken.trim()
    if (!token) {
      this.state = {
        ...this.state,
        profile: { ...DEFAULT_PROFILE },
        lastError: '请先填写 Bot Token。',
        lastActionMessage: clearLastMessage ? '' : this.state.lastActionMessage
      }
      this.persist()
      this.emit()
      return this.cloneState()
    }

    try {
      const payload = await this.callBotApi(token, 'getMe', {}) as {
        id?: number
        username?: string
        first_name?: string
        can_join_groups?: boolean
        can_read_all_group_messages?: boolean
        supports_guest_queries?: boolean
      }

      this.state = {
        ...this.state,
        profile: {
          id: typeof payload?.id === 'number' ? payload.id : null,
          username: typeof payload?.username === 'string' ? payload.username : '',
          firstName: typeof payload?.first_name === 'string' ? payload.first_name : '',
          canJoinGroups: typeof payload?.can_join_groups === 'boolean' ? payload.can_join_groups : true,
          canReadAllGroupMessages: typeof payload?.can_read_all_group_messages === 'boolean' ? payload.can_read_all_group_messages : false,
          supportsGuestQueries: typeof payload?.supports_guest_queries === 'boolean' ? payload.supports_guest_queries : false,
          fetchedAt: new Date().toISOString(),
          valid: true
        },
        lastError: '',
        lastActionMessage: clearLastMessage ? '已刷新 Bot 信息。' : this.state.lastActionMessage
      }
      this.log('success', `Bot 信息已刷新：@${this.state.profile.username || '未命名'}，Guest Mode ${this.state.profile.supportsGuestQueries ? '已开启' : '未开启'}`)
      this.persist()
      this.emit()
      return this.cloneState()
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 Bot 信息失败。'
      this.state = {
        ...this.state,
        profile: { ...DEFAULT_PROFILE },
        lastError: message,
        lastActionMessage: ''
      }
      this.log('error', `读取 Bot 信息失败：${message}`)
      this.persist()
      this.emit()
      return this.cloneState()
    }
  }

  async start() {
    if (this.state.running) {
      this.state = { ...this.state, lastActionMessage: '机器人监听已经在运行中了。', lastError: '' }
      this.emit()
      return this.cloneState()
    }

    const token = this.state.config.botToken.trim()
    if (!token) {
      this.state = { ...this.state, lastError: '请先填写 Bot Token。', lastActionMessage: '' }
      this.emit()
      return this.cloneState()
    }

    await this.refreshProfile(false)
    if (!this.state.profile.valid) return this.cloneState()

    if (!this.state.profile.supportsGuestQueries) {
      this.state = {
        ...this.state,
        lastError: '这个 Bot 还没开启 Guest Mode，请先去 BotFather 打开 Guest Mode。',
        lastActionMessage: ''
      }
      this.log('warning', '启动被拦截：Bot 当前未开启 Guest Mode。')
      this.emit()
      return this.cloneState()
    }

    this.state = {
      ...this.state,
      running: true,
      polling: false,
      startedAt: new Date().toISOString(),
      lastError: '',
      lastActionMessage: `Guest Bot 监听已启动，当前 Bot：@${this.state.profile.username || '未命名'}`
    }
    this.log('success', `Guest Bot 监听已启动，等待群里 @${this.state.profile.username || '机器人'} 的访客消息。`)
    this.emit()

    this.loopPromise = this.pollLoop(token)
    void this.loopPromise
    return this.cloneState()
  }

  async stop(message = 'Guest Bot 监听已停止。') {
    if (!this.state.running && !this.state.polling) {
      this.state = { ...this.state, lastActionMessage: '当前没有正在运行的机器人监听。', lastError: '' }
      this.emit()
      return this.cloneState()
    }

    this.state = {
      ...this.state,
      running: false,
      polling: false,
      lastActionMessage: message,
      lastError: ''
    }
    this.abortController?.abort()
    const runningLoop = this.loopPromise
    this.loopPromise = null
    if (runningLoop) {
      try {
        await runningLoop
      } catch {
        // ignore
      }
    }
    this.log('info', message)
    this.emit()
    return this.cloneState()
  }

  async clearLogs() {
    this.state = {
      ...this.state,
      logs: [],
      lastActionMessage: '机器人日志已清空。',
      lastError: ''
    }
    this.emit()
    return this.cloneState()
  }

  async autoStartIfNeeded() {
    if (!this.state.config.autoStart || !this.state.config.botToken.trim()) return this.cloneState()
    return this.start()
  }

  async dispose() {
    await this.stop('应用正在退出，已停止机器人监听。')
  }

  private async pollLoop(token: string) {
    while (this.state.running) {
      this.abortController = new AbortController()
      this.state = { ...this.state, polling: true, lastPollAt: new Date().toISOString() }
      this.emit()

      try {
        const updates = await this.callBotApi(token, 'getUpdates', {
          offset: this.state.updateOffset + 1,
          timeout: 50,
          allowed_updates: ['guest_message']
        }, this.abortController.signal) as Array<{ update_id?: number; guest_message?: Record<string, any> }>

        this.state = { ...this.state, polling: false, lastPollAt: new Date().toISOString(), lastError: '' }
        this.emit()

        for (const update of updates) {
          const updateId = typeof update?.update_id === 'number' ? update.update_id : null
          if (typeof updateId === 'number') {
            this.state = { ...this.state, updateOffset: Math.max(this.state.updateOffset, updateId) }
            this.persist()
          }

          if (!update?.guest_message) continue
          await this.handleGuestMessage(token, update.guest_message)
        }
      } catch (error) {
        if (!this.state.running) break
        const message = error instanceof Error ? error.message : 'Guest Bot 轮询失败。'
        this.state = { ...this.state, polling: false, lastPollAt: new Date().toISOString(), lastError: message }
        this.log('error', `轮询失败：${message}`)
        this.emit()
        await delay(2500)
      } finally {
        this.abortController = null
      }
    }
  }

  private async handleGuestMessage(token: string, guestMessage: Record<string, any>) {
    const queryId = guestMessage?.guest_query_id
    const text = typeof guestMessage?.text === 'string' && guestMessage.text.trim()
      ? guestMessage.text.trim()
      : typeof guestMessage?.caption === 'string' && guestMessage.caption.trim()
        ? guestMessage.caption.trim()
        : '[非文本消息]'
    const caller = (guestMessage?.from ?? guestMessage?.guest_sender_user ?? null) as Record<string, any> | null
    const callerName = [caller?.first_name, caller?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
    const callerUsername = typeof caller?.username === 'string' && caller.username.trim() ? `@${caller.username.replace(/^@+/, '')}` : '未提供'
    const chat = (guestMessage?.chat ?? {}) as Record<string, any>
    const chatTitle = typeof chat?.title === 'string' && chat.title.trim() ? chat.title.trim() : '未命名群组'

    const context: GuestContext = { text, callerName, callerUsername, chatTitle }

    this.state = {
      ...this.state,
      stats: { ...this.state.stats, receivedGuestCount: this.state.stats.receivedGuestCount + 1, lastGuestAt: new Date().toISOString() }
    }
    this.log('info', `收到 Guest 消息：群【${chatTitle}】 / 用户【${callerName}】 / 内容【${text}】`)
    this.emit()

    if (!this.state.config.guestReplyEnabled) {
      this.log('warning', '当前已关闭 Guest 自动回复，本次只记录日志，不做回复。')
      this.emit()
      return
    }

    if (!queryId) {
      this.state = {
        ...this.state,
        stats: { ...this.state.stats, failedGuestCount: this.state.stats.failedGuestCount + 1 },
        lastError: '收到 Guest 消息，但未取到 guest_query_id。'
      }
      this.log('error', '收到 Guest 消息，但未取到 guest_query_id，无法回消息。')
      this.emit()
      return
    }

    const resolvedReply = this.resolveReplyConfig(context)
    const replyPayload = this.buildGuestQueryResult(context, resolvedReply)

    try {
      await this.callBotApi(token, 'answerGuestQuery', { guest_query_id: queryId, result: replyPayload })
      this.state = {
        ...this.state,
        stats: { ...this.state.stats, answeredGuestCount: this.state.stats.answeredGuestCount + 1 },
        lastActionMessage: `已向群【${chatTitle}】回复 Guest 消息。`,
        lastError: ''
      }
      this.log('success', resolvedReply.source === 'keyword'
        ? `Guest 消息已按关键词【${resolvedReply.ruleKeyword || ''}】回复：群【${chatTitle}】 / 用户【${callerName}】`
        : `Guest 消息已回复：群【${chatTitle}】 / 用户【${callerName}】`)
      this.emit()
    } catch (error) {
      const message = error instanceof Error ? error.message : '回复 Guest 消息失败。'
      this.state = {
        ...this.state,
        stats: { ...this.state.stats, failedGuestCount: this.state.stats.failedGuestCount + 1 },
        lastError: message
      }
      this.log('error', `回复 Guest 消息失败：${message}`)
      this.emit()
    }
  }

  private resolveReplyConfig(context: GuestContext): ResolvedReplyConfig {
    const matchedRule = this.findMatchedKeywordRule(context.text)
    if (matchedRule) {
      return {
        source: 'keyword',
        ruleKeyword: matchedRule.keyword,
        title: matchedRule.title || DEFAULT_KEYWORD_RULE.title,
        text: matchedRule.text || DEFAULT_KEYWORD_RULE.text,
        replyType: matchedRule.replyType,
        imageUrl: matchedRule.imageUrl,
        buttons: matchedRule.buttons
      }
    }

    return {
      source: 'default',
      ruleKeyword: null,
      title: this.state.config.guestReplyTitle || DEFAULT_CONFIG.guestReplyTitle,
      text: this.state.config.guestReplyText || DEFAULT_CONFIG.guestReplyText,
      replyType: this.state.config.guestReplyType,
      imageUrl: this.state.config.guestReplyImageUrl,
      buttons: this.state.config.guestReplyButtons
    }
  }

  private findMatchedKeywordRule(text: string) {
    const normalizedText = normalizeKeywordText(text)
    if (!normalizedText) return null

    for (const rule of this.state.config.keywordRules) {
      if (!rule.enabled || !rule.replyEnabled) continue
      const keyword = normalizeKeywordText(rule.keyword)
      if (!keyword) continue
      const matched = rule.matchType === 'equals' ? normalizedText === keyword : normalizedText.includes(keyword)
      if (matched) return rule
    }

    return null
  }

  private buildGuestQueryResult(context: GuestContext, replyConfig: ResolvedReplyConfig) {
    const renderedText = this.renderReplyText(replyConfig.text, context)
    const replyMarkup = this.buildReplyMarkup(replyConfig.buttons)

    if (replyConfig.replyType === 'photo' && replyConfig.imageUrl) {
      return {
        type: 'photo',
        id: createId('guest-photo'),
        title: replyConfig.title || 'TG-Matrix',
        photo_url: replyConfig.imageUrl,
        thumbnail_url: replyConfig.imageUrl,
        caption: renderedText,
        description: replyConfig.source === 'keyword' ? `关键词回复：${replyConfig.ruleKeyword || ''}` : 'TG-Matrix Guest Bot 自动回复',
        ...(replyMarkup ? { reply_markup: replyMarkup } : null)
      }
    }

    return {
      type: 'article',
      id: createId('guest-article'),
      title: replyConfig.title || 'TG-Matrix',
      input_message_content: { message_text: renderedText },
      description: replyConfig.source === 'keyword' ? `关键词回复：${replyConfig.ruleKeyword || ''}` : 'TG-Matrix Guest Bot 自动回复',
      ...(replyMarkup ? { reply_markup: replyMarkup } : null)
    }
  }

  private buildReplyMarkup(buttons: BotCenterReplyButton[]) {
    const validButtons = buttons.filter((item) => item.text && item.url)
    if (validButtons.length === 0) return null

    return {
      inline_keyboard: [validButtons.map((item) => ({
        text: item.text,
        url: item.url,
        ...(item.style !== 'default' ? { style: item.style } : null)
      }))]
    }
  }

  private renderReplyText(template: string, context: GuestContext) {
    const botUsername = this.state.profile.username ? `@${this.state.profile.username}` : '当前机器人'
    return applyTemplate(template || DEFAULT_CONFIG.guestReplyText, {
      text: context.text,
      caller_name: context.callerName,
      caller_username: context.callerUsername,
      chat_title: context.chatTitle,
      bot_username: botUsername
    })
  }

  private async callBotApi(token: string, method: string, payload: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    })

    if (!response.ok) {
      throw new Error(`Telegram Bot API 请求失败（HTTP ${response.status}）`)
    }

    const json = await response.json() as { ok?: boolean; result?: unknown; description?: string }
    if (!json?.ok) {
      throw new Error(typeof json?.description === 'string' && json.description.trim() ? json.description.trim() : `${method} 调用失败`)
    }

    return json.result
  }

  private loadState() {
    try {
      if (!fs.existsSync(this.filePath)) return emptyState()
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedBotCenterPayload
      return emptyState(parsed.config as (Partial<BotCenterConfig> & Record<string, unknown>) | undefined, parsed.profile, parsed.updateOffset)
    } catch {
      return emptyState()
    }
  }

  private persist() {
    const payload: PersistedBotCenterPayload = {
      config: this.state.config,
      profile: this.state.profile,
      updateOffset: this.state.updateOffset
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private log(level: BotCenterLogLevel, message: string) {
    this.state = { ...this.state, logs: capLogs([buildLog(level, message), ...this.state.logs]) }
  }

  private emit() {
    const snapshot = this.cloneState()
    for (const listener of this.listeners) listener(snapshot)
  }

  private cloneState(): BotCenterState {
    return {
      ...this.state,
      config: {
        ...this.state.config,
        guestReplyButtons: this.state.config.guestReplyButtons.map((item) => ({ ...item })),
        keywordRules: this.state.config.keywordRules.map((item) => ({ ...item, buttons: item.buttons.map((button) => ({ ...button })) }))
      },
      profile: { ...this.state.profile },
      stats: { ...this.state.stats },
      logs: this.state.logs.map((item) => ({ ...item }))
    }
  }
}
