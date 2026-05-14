import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { BotCenterConfig, BotCenterLogEntry, BotCenterLogLevel, BotCenterProfile, BotCenterState, BotCenterStats } from '../../src/types'

interface PersistedBotCenterPayload {
  config?: Partial<BotCenterConfig>
  profile?: Partial<BotCenterProfile>
  updateOffset?: number
}

const DEFAULT_CONFIG: BotCenterConfig = {
  botToken: '',
  autoStart: false,
  guestReplyEnabled: true,
  guestReplyTitle: 'TG-Matrix',
  guestReplyText: '你好，我已收到你的召唤。\n\n你刚刚发送的是：{text}'
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

function normalizeConfig(input?: Partial<BotCenterConfig>): BotCenterConfig {
  return {
    botToken: normalizeString(input?.botToken),
    autoStart: normalizeBoolean(input?.autoStart, DEFAULT_CONFIG.autoStart),
    guestReplyEnabled: normalizeBoolean(input?.guestReplyEnabled, DEFAULT_CONFIG.guestReplyEnabled),
    guestReplyTitle: normalizeString(input?.guestReplyTitle, DEFAULT_CONFIG.guestReplyTitle) || DEFAULT_CONFIG.guestReplyTitle,
    guestReplyText: normalizeString(input?.guestReplyText, DEFAULT_CONFIG.guestReplyText) || DEFAULT_CONFIG.guestReplyText
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

function emptyState(config?: Partial<BotCenterConfig>, profile?: Partial<BotCenterProfile>, updateOffset = 0): BotCenterState {
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
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    level,
    message
  }
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
    if (!this.state.profile.valid) {
      return this.cloneState()
    }

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
    if (!this.state.config.autoStart || !this.state.config.botToken.trim()) {
      return this.cloneState()
    }
    return this.start()
  }

  async dispose() {
    await this.stop('应用正在退出，已停止机器人监听。')
  }

  private async pollLoop(token: string) {
    while (this.state.running) {
      this.abortController = new AbortController()
      this.state = {
        ...this.state,
        polling: true,
        lastPollAt: new Date().toISOString()
      }
      this.emit()

      try {
        const updates = await this.callBotApi(token, 'getUpdates', {
          offset: this.state.updateOffset + 1,
          timeout: 50,
          allowed_updates: ['guest_message']
        }, this.abortController.signal) as Array<{ update_id?: number; guest_message?: Record<string, any> }>

        this.state = {
          ...this.state,
          polling: false,
          lastPollAt: new Date().toISOString(),
          lastError: ''
        }
        this.emit()

        for (const update of updates) {
          const updateId = typeof update?.update_id === 'number' ? update.update_id : null
          if (typeof updateId === 'number') {
            this.state = {
              ...this.state,
              updateOffset: Math.max(this.state.updateOffset, updateId)
            }
            this.persist()
          }

          if (!update?.guest_message) continue
          await this.handleGuestMessage(token, update.guest_message)
        }
      } catch (error) {
        if (!this.state.running) {
          break
        }

        const message = error instanceof Error ? error.message : 'Guest Bot 轮询失败。'
        this.state = {
          ...this.state,
          polling: false,
          lastPollAt: new Date().toISOString(),
          lastError: message
        }
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
    const caller = guestMessage?.from ?? guestMessage?.guest_sender_user ?? null
    const callerName = [caller?.first_name, caller?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
    const chatTitle = typeof guestMessage?.chat?.title === 'string' && guestMessage.chat.title.trim() ? guestMessage.chat.title.trim() : '未命名群组'

    this.state = {
      ...this.state,
      stats: {
        ...this.state.stats,
        receivedGuestCount: this.state.stats.receivedGuestCount + 1,
        lastGuestAt: new Date().toISOString()
      }
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
        stats: {
          ...this.state.stats,
          failedGuestCount: this.state.stats.failedGuestCount + 1
        },
        lastError: '收到 Guest 消息，但未取到 guest_query_id。'
      }
      this.log('error', '收到 Guest 消息，但未取到 guest_query_id，无法回消息。')
      this.emit()
      return
    }

    const replyText = this.renderReplyText(text, caller, guestMessage?.chat)

    try {
      await this.callBotApi(token, 'answerGuestQuery', {
        guest_query_id: queryId,
        result: {
          type: 'article',
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: this.state.config.guestReplyTitle || 'TG-Matrix',
          input_message_content: {
            message_text: replyText
          },
          description: 'TG-Matrix Guest Bot 自动回复'
        }
      })

      this.state = {
        ...this.state,
        stats: {
          ...this.state.stats,
          answeredGuestCount: this.state.stats.answeredGuestCount + 1
        },
        lastActionMessage: `已向群【${chatTitle}】回复 Guest 消息。`,
        lastError: ''
      }
      this.log('success', `Guest 消息已回复：群【${chatTitle}】 / 用户【${callerName}】`)
      this.emit()
    } catch (error) {
      const message = error instanceof Error ? error.message : '回复 Guest 消息失败。'
      this.state = {
        ...this.state,
        stats: {
          ...this.state.stats,
          failedGuestCount: this.state.stats.failedGuestCount + 1
        },
        lastError: message
      }
      this.log('error', `回复 Guest 消息失败：${message}`)
      this.emit()
    }
  }

  private renderReplyText(text: string, caller: any, chat: any) {
    const template = this.state.config.guestReplyText || DEFAULT_CONFIG.guestReplyText
    const callerName = [caller?.first_name, caller?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
    const callerUsername = typeof caller?.username === 'string' && caller.username.trim() ? `@${caller.username.replace(/^@+/, '')}` : '未提供'
    const chatTitle = typeof chat?.title === 'string' && chat.title.trim() ? chat.title.trim() : '未命名群组'
    const botUsername = this.state.profile.username ? `@${this.state.profile.username}` : '当前机器人'

    return template
      .split('{text}').join(text)
      .split('{caller_name}').join(callerName)
      .split('{caller_username}').join(callerUsername)
      .split('{chat_title}').join(chatTitle)
      .split('{bot_username}').join(botUsername)
  }

  private async callBotApi(token: string, method: string, payload: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
        return emptyState()
      }

      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedBotCenterPayload
      return emptyState(parsed.config, parsed.profile, parsed.updateOffset)
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
    this.state = {
      ...this.state,
      logs: capLogs([buildLog(level, message), ...this.state.logs])
    }
  }

  private emit() {
    const snapshot = this.cloneState()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private cloneState(): BotCenterState {
    return {
      ...this.state,
      config: { ...this.state.config },
      profile: { ...this.state.profile },
      stats: { ...this.state.stats },
      logs: this.state.logs.map((item) => ({ ...item }))
    }
  }
}
