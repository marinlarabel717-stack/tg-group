import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type {
  BotCenterBotState,
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

interface PersistedBotConfig extends Partial<BotCenterConfig> {
  [key: string]: unknown
}

interface PersistedBotPayload {
  id?: string
  config?: PersistedBotConfig
  profile?: Partial<BotCenterProfile>
  stats?: Partial<BotCenterStats>
  updateOffset?: number
  lastPollAt?: string | null
  lastActionMessage?: string
  lastError?: string
}

interface PersistedBotCenterPayload {
  bots?: PersistedBotPayload[]
  activeBotId?: string | null
  config?: PersistedBotConfig
  profile?: Partial<BotCenterProfile>
  updateOffset?: number
}

interface BotRuntimeHandle {
  loopPromise: Promise<void> | null
  abortController: AbortController | null
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
  name: '机器人 1',
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

function createBotName(index: number) {
  return `机器人 ${index}`
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

function normalizeConfig(input?: Partial<BotCenterConfig> & Record<string, unknown>, index = 1): BotCenterConfig {
  return {
    name: normalizeString(input?.name, createBotName(index)) || createBotName(index),
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

function normalizeStats(input?: Partial<BotCenterStats>): BotCenterStats {
  return {
    receivedGuestCount: typeof input?.receivedGuestCount === 'number' ? input.receivedGuestCount : 0,
    answeredGuestCount: typeof input?.answeredGuestCount === 'number' ? input.answeredGuestCount : 0,
    failedGuestCount: typeof input?.failedGuestCount === 'number' ? input.failedGuestCount : 0,
    lastGuestAt: typeof input?.lastGuestAt === 'string' && input.lastGuestAt.trim() ? input.lastGuestAt : null
  }
}

function buildLog(level: BotCenterLogLevel, message: string): BotCenterLogEntry {
  return {
    id: createId('log'),
    createdAt: new Date().toISOString(),
    level,
    message
  }
}

function capLogs(logs: BotCenterLogEntry[]) {
  return logs.slice(0, 200)
}

function emptyBot(index = 1): BotCenterBotState {
  return {
    id: createId('bot'),
    config: normalizeConfig(undefined, index),
    profile: { ...DEFAULT_PROFILE },
    stats: { ...DEFAULT_STATS },
    running: false,
    polling: false,
    startedAt: null,
    lastPollAt: null,
    lastActionMessage: '',
    lastError: '',
    updateOffset: 0,
    logs: []
  }
}

function normalizeBotState(input: PersistedBotPayload, index = 0): BotCenterBotState {
  return {
    id: normalizeString(input?.id) || createId(`bot-${index + 1}`),
    config: normalizeConfig(input?.config, index + 1),
    profile: normalizeProfile(input?.profile),
    stats: normalizeStats(input?.stats),
    running: false,
    polling: false,
    startedAt: null,
    lastPollAt: typeof input?.lastPollAt === 'string' ? input.lastPollAt : null,
    lastActionMessage: typeof input?.lastActionMessage === 'string' ? input.lastActionMessage : '',
    lastError: typeof input?.lastError === 'string' ? input.lastError : '',
    updateOffset: Number.isFinite(input?.updateOffset) ? Math.max(0, Math.trunc(input.updateOffset as number)) : 0,
    logs: []
  }
}

function normalizeKeywordText(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function applyTemplate(template: string, variables: Record<string, string>) {
  let output = template
  for (const [key, value] of Object.entries(variables)) {
    output = output.split(`{${key}}`).join(value)
  }
  return output
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
  private readonly runtimes = new Map<string, BotRuntimeHandle>()

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

  async addBot() {
    const nextBot = emptyBot(this.state.bots.length + 1)
    this.state = {
      ...this.state,
      bots: [...this.state.bots, nextBot],
      activeBotId: nextBot.id
    }
    this.persist()
    this.emit()
    return this.cloneState()
  }

  async removeBot(botId: string) {
    const bot = this.getBot(botId)
    if (!bot) return this.cloneState()

    if (bot.running || bot.polling) {
      await this.stop(botId, `${bot.config.name} 已停止监听。`)
    }

    let nextBots = this.state.bots.filter((item) => item.id !== botId)
    if (nextBots.length === 0) {
      nextBots = [emptyBot(1)]
    }

    this.state = {
      ...this.state,
      bots: nextBots,
      activeBotId: nextBots.some((item) => item.id === this.state.activeBotId) ? this.state.activeBotId : nextBots[0]?.id ?? null
    }
    this.runtimes.delete(botId)
    this.persist()
    this.emit()
    return this.cloneState()
  }

  async selectBot(botId: string) {
    if (!this.getBot(botId)) return this.cloneState()
    this.state = { ...this.state, activeBotId: botId }
    this.persist()
    this.emit()
    return this.cloneState()
  }

  async saveConfig(botId: string, patch: Partial<BotCenterConfig>) {
    const bot = this.getBot(botId)
    if (!bot) return this.cloneState()

    const wasRunning = bot.running
    const previousToken = bot.config.botToken
    const nextConfig = normalizeConfig({ ...bot.config, ...patch }, this.getBotIndex(botId) + 1)
    const tokenChanged = nextConfig.botToken !== previousToken

    if (wasRunning && tokenChanged) {
      await this.stop(botId, 'Bot Token 已变更，正在重启监听。')
    }

    this.updateBot(botId, (current) => ({
      ...current,
      config: nextConfig,
      updateOffset: tokenChanged ? 0 : current.updateOffset,
      profile: tokenChanged ? { ...DEFAULT_PROFILE } : current.profile,
      lastError: '',
      lastActionMessage: `机器人配置已保存，当前 Token：${this.maskToken(nextConfig.botToken)}`
    }))
    this.persist()
    this.emit()

    if (nextConfig.botToken) {
      await this.refreshProfile(botId, false)
    }

    if (wasRunning && tokenChanged && nextConfig.botToken) {
      await this.start(botId)
    }

    return this.cloneState()
  }

  async refreshProfile(botId: string, clearLastMessage = true) {
    const bot = this.getBot(botId)
    if (!bot) return this.cloneState()

    const token = bot.config.botToken.trim()
    if (!token) {
      this.updateBot(botId, (current) => ({
        ...current,
        profile: { ...DEFAULT_PROFILE },
        lastError: '请先填写 Bot Token。',
        lastActionMessage: clearLastMessage ? '' : current.lastActionMessage
      }))
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

      this.updateBot(botId, (current) => ({
        ...current,
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
        lastActionMessage: clearLastMessage ? '已刷新 Bot 信息。' : current.lastActionMessage
      }))
      const nextBot = this.getBot(botId)
      this.log(botId, 'success', `Bot 信息已刷新：@${nextBot?.profile.username || '未命名'}，Guest Mode ${nextBot?.profile.supportsGuestQueries ? '已开启' : '未开启'}`)
      this.persist()
      this.emit()
      return this.cloneState()
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取 Bot 信息失败。'
      this.updateBot(botId, (current) => ({
        ...current,
        profile: { ...DEFAULT_PROFILE },
        lastError: message,
        lastActionMessage: ''
      }))
      this.log(botId, 'error', `读取 Bot 信息失败：${message}`)
      this.persist()
      this.emit()
      return this.cloneState()
    }
  }

  async start(botId: string) {
    const bot = this.getBot(botId)
    if (!bot) return this.cloneState()

    if (bot.running) {
      this.updateBot(botId, (current) => ({ ...current, lastActionMessage: '机器人监听已经在运行中了。', lastError: '' }))
      this.emit()
      return this.cloneState()
    }

    const token = bot.config.botToken.trim()
    if (!token) {
      this.updateBot(botId, (current) => ({ ...current, lastError: '请先填写 Bot Token。', lastActionMessage: '' }))
      this.emit()
      return this.cloneState()
    }

    await this.refreshProfile(botId, false)
    const refreshedBot = this.getBot(botId)
    if (!refreshedBot?.profile.valid) return this.cloneState()

    if (!refreshedBot.profile.supportsGuestQueries) {
      this.updateBot(botId, (current) => ({
        ...current,
        lastError: '这个 Bot 还没开启 Guest Mode，请先去 BotFather 打开 Guest Chat Mode。',
        lastActionMessage: ''
      }))
      this.log(botId, 'warning', '启动被拦截：Bot 当前未开启 Guest Chat Mode。')
      this.emit()
      return this.cloneState()
    }

    this.updateBot(botId, (current) => ({
      ...current,
      running: true,
      polling: false,
      startedAt: new Date().toISOString(),
      lastError: '',
      lastActionMessage: `Guest Bot 监听已启动，当前 Bot：@${current.profile.username || '未命名'}`
    }))
    this.log(botId, 'success', `Guest Bot 监听已启动，等待群里 @${refreshedBot.profile.username || '机器人'} 的访客消息。`)
    this.emit()

    const runtime = this.ensureRuntime(botId)
    runtime.loopPromise = this.pollLoop(botId, token)
    void runtime.loopPromise
    return this.cloneState()
  }

  async stop(botId: string, message = 'Guest Bot 监听已停止。') {
    const bot = this.getBot(botId)
    if (!bot) return this.cloneState()

    if (!bot.running && !bot.polling) {
      this.updateBot(botId, (current) => ({ ...current, lastActionMessage: '当前没有正在运行的机器人监听。', lastError: '' }))
      this.emit()
      return this.cloneState()
    }

    this.updateBot(botId, (current) => ({
      ...current,
      running: false,
      polling: false,
      lastActionMessage: message,
      lastError: ''
    }))

    const runtime = this.ensureRuntime(botId)
    runtime.abortController?.abort()
    const runningLoop = runtime.loopPromise
    runtime.loopPromise = null
    if (runningLoop) {
      try {
        await runningLoop
      } catch {
        // ignore
      }
    }

    this.log(botId, 'info', message)
    this.emit()
    return this.cloneState()
  }

  async clearLogs(botId: string) {
    this.updateBot(botId, (current) => ({
      ...current,
      logs: [],
      lastActionMessage: '机器人日志已清空。',
      lastError: ''
    }))
    this.emit()
    return this.cloneState()
  }

  async autoStartIfNeeded() {
    for (const bot of this.state.bots) {
      if (!bot.config.autoStart || !bot.config.botToken.trim()) continue
      try {
        await this.start(bot.id)
      } catch {
        // ignore per-bot failure to avoid blocking the rest
      }
    }
    return this.cloneState()
  }

  async dispose() {
    for (const bot of this.state.bots) {
      if (bot.running || bot.polling) {
        await this.stop(bot.id, '应用正在退出，已停止机器人监听。')
      }
    }
  }

  private async pollLoop(botId: string, token: string) {
    while (this.getBot(botId)?.running) {
      const runtime = this.ensureRuntime(botId)
      runtime.abortController = new AbortController()
      this.updateBot(botId, (current) => ({ ...current, polling: true, lastPollAt: new Date().toISOString() }))
      this.emit()

      try {
        const currentBot = this.getBot(botId)
        const updates = await this.callBotApi(token, 'getUpdates', {
          offset: (currentBot?.updateOffset || 0) + 1,
          timeout: 50,
          allowed_updates: ['guest_message']
        }, runtime.abortController.signal) as Array<{ update_id?: number; guest_message?: Record<string, any> }>

        this.updateBot(botId, (current) => ({ ...current, polling: false, lastPollAt: new Date().toISOString(), lastError: '' }))
        this.emit()

        for (const update of updates) {
          const updateId = typeof update?.update_id === 'number' ? update.update_id : null
          if (typeof updateId === 'number') {
            this.updateBot(botId, (current) => ({ ...current, updateOffset: Math.max(current.updateOffset, updateId) }))
            this.persist()
          }

          if (!update?.guest_message) continue
          await this.handleGuestMessage(botId, token, update.guest_message)
        }
      } catch (error) {
        if (!this.getBot(botId)?.running) break
        const message = error instanceof Error ? error.message : 'Guest Bot 轮询失败。'
        this.updateBot(botId, (current) => ({ ...current, polling: false, lastPollAt: new Date().toISOString(), lastError: message }))
        this.log(botId, 'error', `轮询失败：${message}`)
        this.emit()
        await delay(2500)
      } finally {
        runtime.abortController = null
      }
    }
  }

  private async handleGuestMessage(botId: string, token: string, guestMessage: Record<string, any>) {
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

    this.updateBot(botId, (current) => ({
      ...current,
      stats: { ...current.stats, receivedGuestCount: current.stats.receivedGuestCount + 1, lastGuestAt: new Date().toISOString() }
    }))
    this.log(botId, 'info', `收到 Guest 消息：群【${chatTitle}】 / 用户【${callerName}】 / 内容【${text}】`)
    this.emit()

    const bot = this.getBot(botId)
    if (!bot?.config.guestReplyEnabled) {
      this.log(botId, 'warning', '当前已关闭 Guest 自动回复，本次只记录日志，不做回复。')
      this.emit()
      return
    }

    if (!queryId) {
      this.updateBot(botId, (current) => ({
        ...current,
        stats: { ...current.stats, failedGuestCount: current.stats.failedGuestCount + 1 },
        lastError: '收到 Guest 消息，但未取到 guest_query_id。'
      }))
      this.log(botId, 'error', '收到 Guest 消息，但未取到 guest_query_id，无法回消息。')
      this.emit()
      return
    }

    const resolvedReply = this.resolveReplyConfig(botId, context)
    const replyPayload = this.buildGuestQueryResult(botId, context, resolvedReply)

    try {
      await this.callBotApi(token, 'answerGuestQuery', { guest_query_id: queryId, result: replyPayload })
      this.updateBot(botId, (current) => ({
        ...current,
        stats: { ...current.stats, answeredGuestCount: current.stats.answeredGuestCount + 1 },
        lastActionMessage: `已向群【${chatTitle}】回复 Guest 消息。`,
        lastError: ''
      }))
      this.log(botId, 'success', resolvedReply.source === 'keyword'
        ? `Guest 消息已按关键词【${resolvedReply.ruleKeyword || ''}】回复：群【${chatTitle}】 / 用户【${callerName}】`
        : `Guest 消息已回复：群【${chatTitle}】 / 用户【${callerName}】`)
      this.emit()
    } catch (error) {
      const message = error instanceof Error ? error.message : '回复 Guest 消息失败。'
      this.updateBot(botId, (current) => ({
        ...current,
        stats: { ...current.stats, failedGuestCount: current.stats.failedGuestCount + 1 },
        lastError: message
      }))
      this.log(botId, 'error', `回复 Guest 消息失败：${message}`)
      this.emit()
    }
  }

  private resolveReplyConfig(botId: string, context: GuestContext): ResolvedReplyConfig {
    const bot = this.getBot(botId)
    const matchedRule = this.findMatchedKeywordRule(botId, context.text)
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
      title: bot?.config.guestReplyTitle || DEFAULT_CONFIG.guestReplyTitle,
      text: bot?.config.guestReplyText || DEFAULT_CONFIG.guestReplyText,
      replyType: bot?.config.guestReplyType || DEFAULT_CONFIG.guestReplyType,
      imageUrl: bot?.config.guestReplyImageUrl || '',
      buttons: bot?.config.guestReplyButtons || []
    }
  }

  private findMatchedKeywordRule(botId: string, text: string) {
    const bot = this.getBot(botId)
    const normalizedText = normalizeKeywordText(text)
    if (!normalizedText || !bot) return null

    for (const rule of bot.config.keywordRules) {
      if (!rule.enabled || !rule.replyEnabled) continue
      const keyword = normalizeKeywordText(rule.keyword)
      if (!keyword) continue
      const matched = rule.matchType === 'equals' ? normalizedText === keyword : normalizedText.includes(keyword)
      if (matched) return rule
    }

    return null
  }

  private buildGuestQueryResult(botId: string, context: GuestContext, replyConfig: ResolvedReplyConfig) {
    const renderedText = this.renderReplyText(botId, replyConfig.text, context)
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

  private renderReplyText(botId: string, template: string, context: GuestContext) {
    const botUsername = this.getBot(botId)?.profile.username ? `@${this.getBot(botId)?.profile.username}` : '当前机器人'
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
      if (!fs.existsSync(this.filePath)) {
        const bot = emptyBot(1)
        return { bots: [bot], activeBotId: bot.id }
      }

      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedBotCenterPayload

      if (Array.isArray(parsed.bots) && parsed.bots.length > 0) {
        const bots = parsed.bots.map((item, index) => normalizeBotState(item, index))
        const activeBotId = bots.some((bot) => bot.id === parsed.activeBotId) ? parsed.activeBotId ?? bots[0].id : bots[0].id
        return { bots, activeBotId }
      }

      if (parsed.config) {
        const legacyBot = normalizeBotState({
          id: createId('bot-legacy'),
          config: parsed.config,
          profile: parsed.profile ? normalizeProfile(parsed.profile) : undefined,
          updateOffset: parsed.updateOffset
        }, 0)
        return { bots: [legacyBot], activeBotId: legacyBot.id }
      }
    } catch {
      // ignore
    }

    const bot = emptyBot(1)
    return { bots: [bot], activeBotId: bot.id }
  }

  private persist() {
    const payload: PersistedBotCenterPayload = {
      bots: this.state.bots.map((bot) => ({
        id: bot.id,
        config: { ...bot.config },
        profile: { ...bot.profile },
        stats: { ...bot.stats },
        updateOffset: bot.updateOffset,
        lastPollAt: bot.lastPollAt,
        lastActionMessage: bot.lastActionMessage,
        lastError: bot.lastError
      })),
      activeBotId: this.state.activeBotId
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private log(botId: string, level: BotCenterLogLevel, message: string) {
    this.updateBot(botId, (current) => ({
      ...current,
      logs: capLogs([buildLog(level, message), ...current.logs])
    }))
  }

  private emit() {
    const snapshot = this.cloneState()
    for (const listener of this.listeners) listener(snapshot)
  }

  private cloneState(): BotCenterState {
    return {
      activeBotId: this.state.activeBotId,
      bots: this.state.bots.map((bot) => ({
        ...bot,
        config: {
          ...bot.config,
          guestReplyButtons: bot.config.guestReplyButtons.map((item) => ({ ...item })),
          keywordRules: bot.config.keywordRules.map((item) => ({ ...item, buttons: item.buttons.map((button) => ({ ...button })) }))
        },
        profile: { ...bot.profile },
        stats: { ...bot.stats },
        logs: bot.logs.map((item) => ({ ...item }))
      }))
    }
  }

  private getBotIndex(botId: string) {
    return this.state.bots.findIndex((bot) => bot.id === botId)
  }

  private getBot(botId: string) {
    return this.state.bots.find((bot) => bot.id === botId) ?? null
  }

  private updateBot(botId: string, updater: (bot: BotCenterBotState) => BotCenterBotState) {
    this.state = {
      ...this.state,
      bots: this.state.bots.map((bot) => bot.id === botId ? updater(bot) : bot)
    }
  }

  private ensureRuntime(botId: string) {
    const existing = this.runtimes.get(botId)
    if (existing) return existing
    const next = { loopPromise: null, abortController: null }
    this.runtimes.set(botId, next)
    return next
  }

  private maskToken(token: string) {
    const trimmed = token.trim()
    if (!trimmed) return '未填写'
    if (trimmed.length <= 10) return `${trimmed.slice(0, 3)}***`
    return `${trimmed.slice(0, 5)}***${trimmed.slice(-4)}`
  }
}
