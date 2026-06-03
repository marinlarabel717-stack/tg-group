import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_BUTTON = {
  id: '',
  text: '',
  actionType: 'url',
  url: '',
  targetPageId: '',
  style: 'primary'
}

const DEFAULT_KEYWORD_RULE = {
  id: '',
  enabled: true,
  keyword: '',
  matchType: 'contains',
  replyEnabled: true,
  replyType: 'text',
  title: '访客机器人',
  text: '你好，我已经收到你的消息。\n\n你刚才发送的是：{text}',
  imageUrl: '',
  buttons: []
}

const DEFAULT_PAGE = {
  id: '',
  title: '访客机器人',
  text: '',
  replyType: 'text',
  imageUrl: '',
  buttons: []
}

const DEFAULT_BOT = {
  id: '',
  name: '访客机器人 1',
  botToken: '',
  autoStart: true,
  guestReplyEnabled: true,
  guestReplyTitle: '访客机器人',
  guestReplyText: '你好，我已经收到你的访客消息。\n\n你刚才发送的是：{text}',
  guestReplyType: 'text',
  guestReplyImageUrl: '',
  guestReplyButtons: [],
  privateReplyEnabled: true,
  privateReplyTitle: '欢迎来到访客机器人',
  privateReplyText: '这里不用指令，直接点下面按钮就行。',
  privateReplyType: 'text',
  privateReplyImageUrl: '',
  privateReplyButtons: [],
  keywordRules: [],
  pages: []
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeReplyType(value, fallback) {
  return value === 'photo' ? 'photo' : fallback
}

function normalizeMatchType(value, fallback) {
  return value === 'equals' ? 'equals' : fallback
}

function normalizeActionType(value, fallback) {
  return value === 'page' ? 'page' : fallback
}

function normalizeButton(input, index = 0) {
  return {
    id: normalizeString(input?.id) || createId(`btn-${index}`),
    text: normalizeString(input?.text),
    actionType: normalizeActionType(input?.actionType, DEFAULT_BUTTON.actionType),
    url: normalizeString(input?.url),
    targetPageId: normalizeString(input?.targetPageId),
    style: normalizeString(input?.style, DEFAULT_BUTTON.style) || DEFAULT_BUTTON.style
  }
}

function normalizeButtons(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((item, index) => normalizeButton(item, index))
    .filter((item) => item.text && ((item.actionType === 'page' && item.targetPageId) || (item.actionType === 'url' && item.url)))
}

function normalizeKeywordRule(input, index = 0) {
  return {
    id: normalizeString(input?.id) || createId(`rule-${index}`),
    enabled: normalizeBoolean(input?.enabled, DEFAULT_KEYWORD_RULE.enabled),
    keyword: normalizeString(input?.keyword),
    matchType: normalizeMatchType(input?.matchType, DEFAULT_KEYWORD_RULE.matchType),
    replyEnabled: normalizeBoolean(input?.replyEnabled, DEFAULT_KEYWORD_RULE.replyEnabled),
    replyType: normalizeReplyType(input?.replyType, DEFAULT_KEYWORD_RULE.replyType),
    title: normalizeString(input?.title, DEFAULT_KEYWORD_RULE.title) || DEFAULT_KEYWORD_RULE.title,
    text: typeof input?.text === 'string' && input.text.trim() ? input.text : DEFAULT_KEYWORD_RULE.text,
    imageUrl: normalizeString(input?.imageUrl),
    buttons: normalizeButtons(input?.buttons)
  }
}

function normalizePage(input, index = 0) {
  return {
    id: normalizeString(input?.id) || createId(`page-${index}`),
    title: normalizeString(input?.title, DEFAULT_PAGE.title) || DEFAULT_PAGE.title,
    text: typeof input?.text === 'string' ? input.text : DEFAULT_PAGE.text,
    replyType: normalizeReplyType(input?.replyType, DEFAULT_PAGE.replyType),
    imageUrl: normalizeString(input?.imageUrl),
    buttons: normalizeButtons(input?.buttons)
  }
}

function normalizeBot(input, index = 0) {
  return {
    id: normalizeString(input?.id) || createId(`bot-${index + 1}`),
    name: normalizeString(input?.name, `访客机器人 ${index + 1}`) || `访客机器人 ${index + 1}`,
    botToken: normalizeString(input?.botToken),
    autoStart: normalizeBoolean(input?.autoStart, DEFAULT_BOT.autoStart),
    guestReplyEnabled: normalizeBoolean(input?.guestReplyEnabled, DEFAULT_BOT.guestReplyEnabled),
    guestReplyTitle: normalizeString(input?.guestReplyTitle, DEFAULT_BOT.guestReplyTitle) || DEFAULT_BOT.guestReplyTitle,
    guestReplyText: typeof input?.guestReplyText === 'string' && input.guestReplyText.trim() ? input.guestReplyText : DEFAULT_BOT.guestReplyText,
    guestReplyType: normalizeReplyType(input?.guestReplyType, DEFAULT_BOT.guestReplyType),
    guestReplyImageUrl: normalizeString(input?.guestReplyImageUrl),
    guestReplyButtons: normalizeButtons(input?.guestReplyButtons),
    privateReplyEnabled: normalizeBoolean(input?.privateReplyEnabled, DEFAULT_BOT.privateReplyEnabled),
    privateReplyTitle: normalizeString(input?.privateReplyTitle, DEFAULT_BOT.privateReplyTitle) || DEFAULT_BOT.privateReplyTitle,
    privateReplyText: typeof input?.privateReplyText === 'string' && input.privateReplyText.trim() ? input.privateReplyText : DEFAULT_BOT.privateReplyText,
    privateReplyType: normalizeReplyType(input?.privateReplyType, DEFAULT_BOT.privateReplyType),
    privateReplyImageUrl: normalizeString(input?.privateReplyImageUrl),
    privateReplyButtons: normalizeButtons(input?.privateReplyButtons),
    keywordRules: Array.isArray(input?.keywordRules) ? input.keywordRules.map((item, ruleIndex) => normalizeKeywordRule(item, ruleIndex)) : [],
    pages: Array.isArray(input?.pages) ? input.pages.map((item, pageIndex) => normalizePage(item, pageIndex)) : []
  }
}

function normalizeConfig(rawConfig, configPath) {
  const configDir = path.dirname(configPath)
  const stateFileRaw = normalizeString(rawConfig?.stateFile)
  const stateFile = stateFileRaw
    ? path.resolve(configDir, stateFileRaw)
    : path.join(configDir, 'data', 'runtime-state.json')

  const bots = Array.isArray(rawConfig?.bots) ? rawConfig.bots.map((item, index) => normalizeBot(item, index)) : []
  return {
    stateFile,
    bots
  }
}

function resolveCliConfigPath() {
  const args = process.argv.slice(2)
  const configArgIndex = args.findIndex((item) => item === '--config')
  if (configArgIndex >= 0 && args[configArgIndex + 1]) {
    return path.resolve(process.cwd(), args[configArgIndex + 1])
  }
  return path.resolve(process.cwd(), 'config.json')
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, payload) {
  ensureParentDirectory(filePath)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

function normalizeKeywordText(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN')
}

function applyTemplate(template, variables) {
  let output = String(template || '')
  for (const [key, value] of Object.entries(variables)) {
    output = output.split(`{${key}}`).join(String(value ?? ''))
  }
  return output
}

function capLogs(logs, maxSize = 200) {
  return logs.slice(0, maxSize)
}

function chunkButtons(items, size = 2) {
  const rows = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

class RuntimeStateStore {
  constructor(filePath) {
    this.filePath = filePath
    this.state = readJson(filePath, { bots: {} })
    if (!this.state || typeof this.state !== 'object' || typeof this.state.bots !== 'object') {
      this.state = { bots: {} }
    }
  }

  getBotState(botId) {
    return this.state.bots?.[botId] || {
      updateOffset: 0,
      profile: {
        id: null,
        username: '',
        firstName: '',
        supportsGuestQueries: false,
        valid: false,
        fetchedAt: null
      },
      stats: {
        receivedGuestCount: 0,
        answeredGuestCount: 0,
        failedGuestCount: 0,
        privateReplyCount: 0,
        callbackReplyCount: 0,
        lastGuestAt: null,
        lastPrivateAt: null
      },
      lastPollAt: null,
      lastActionMessage: '',
      lastError: '',
      logs: []
    }
  }

  updateBotState(botId, updater) {
    const current = this.getBotState(botId)
    const next = updater(current)
    this.state.bots[botId] = next
    this.flush()
    return next
  }

  flush() {
    writeJson(this.filePath, this.state)
  }
}

class VisitorBotRuntime {
  constructor(botConfig, stateStore) {
    this.bot = botConfig
    this.stateStore = stateStore
    this.running = false
    this.abortController = null
  }

  readState() {
    return this.stateStore.getBotState(this.bot.id)
  }

  writeState(updater) {
    return this.stateStore.updateBotState(this.bot.id, updater)
  }

  log(level, message) {
    const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] [${this.bot.name}] ${message}`
    const writer = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log
    writer(line)
    this.writeState((current) => ({
      ...current,
      logs: capLogs([
        {
          id: createId('log'),
          createdAt: new Date().toISOString(),
          level,
          message
        },
        ...(Array.isArray(current.logs) ? current.logs : [])
      ])
    }))
  }

  async start() {
    if (this.running) return
    if (!this.bot.botToken) {
      this.log('warning', '未填写 Bot Token，已跳过启动。')
      return
    }

    const profile = await this.refreshProfile()
    if (!profile?.valid) {
      this.log('error', 'Bot 信息读取失败，当前机器人没有启动。')
      return
    }

    this.running = true
    this.log('success', `机器人已启动：@${profile.username || '未命名'}${profile.supportsGuestQueries ? '，Guest 模式可用' : '，Guest 模式未开启，仅保留私聊按钮交互'}`)
    while (this.running) {
      this.abortController = new AbortController()
      this.writeState((current) => ({
        ...current,
        lastPollAt: new Date().toISOString(),
        lastError: ''
      }))

      try {
        const current = this.readState()
        const updates = await this.callBotApi('getUpdates', {
          offset: Number(current.updateOffset || 0) + 1,
          timeout: 50,
          allowed_updates: ['guest_message', 'message', 'callback_query']
        }, this.abortController.signal)

        for (const update of Array.isArray(updates) ? updates : []) {
          const updateId = typeof update?.update_id === 'number' ? update.update_id : null
          if (typeof updateId === 'number') {
            this.writeState((state) => ({
              ...state,
              updateOffset: Math.max(Number(state.updateOffset || 0), updateId)
            }))
          }
          await this.handleUpdate(update)
        }
      } catch (error) {
        if (!this.running) break
        const message = error instanceof Error ? error.message : String(error)
        this.writeState((current) => ({
          ...current,
          lastError: message
        }))
        this.log('error', `轮询失败：${message}`)
        await delay(2500)
      } finally {
        this.abortController = null
      }
    }
  }

  async stop(reason = '机器人已停止。') {
    if (!this.running) return
    this.running = false
    this.abortController?.abort()
    this.writeState((current) => ({
      ...current,
      lastActionMessage: reason
    }))
    this.log('info', reason)
  }

  async refreshProfile() {
    try {
      const payload = await this.callBotApi('getMe', {})
      const profile = {
        id: typeof payload?.id === 'number' ? payload.id : null,
        username: typeof payload?.username === 'string' ? payload.username : '',
        firstName: typeof payload?.first_name === 'string' ? payload.first_name : '',
        supportsGuestQueries: typeof payload?.supports_guest_queries === 'boolean' ? payload.supports_guest_queries : false,
        valid: true,
        fetchedAt: new Date().toISOString()
      }
      this.writeState((current) => ({
        ...current,
        profile,
        lastError: '',
        lastActionMessage: '已刷新 Bot 信息。'
      }))
      return profile
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.writeState((current) => ({
        ...current,
        profile: {
          id: null,
          username: '',
          firstName: '',
          supportsGuestQueries: false,
          valid: false,
          fetchedAt: null
        },
        lastError: message
      }))
      this.log('error', `读取 Bot 信息失败：${message}`)
      return null
    }
  }

  async handleUpdate(update) {
    if (update?.guest_message) {
      await this.handleGuestMessage(update.guest_message)
      return
    }

    if (update?.callback_query) {
      await this.handleCallbackQuery(update.callback_query)
      return
    }

    if (update?.message) {
      await this.handlePrivateMessage(update.message)
    }
  }

  resolveKeywordReply(text) {
    const normalizedText = normalizeKeywordText(text)
    if (!normalizedText) return null
    for (const rule of this.bot.keywordRules) {
      if (!rule.enabled || !rule.replyEnabled) continue
      const keyword = normalizeKeywordText(rule.keyword)
      if (!keyword) continue
      const matched = rule.matchType === 'equals' ? normalizedText === keyword : normalizedText.includes(keyword)
      if (matched) return rule
    }
    return null
  }

  resolvePage(pageId) {
    return this.bot.pages.find((item) => item.id === pageId) || null
  }

  renderText(template, context) {
    const profile = this.readState().profile || {}
    return applyTemplate(template, {
      text: context.text || '',
      caller_name: context.callerName || '',
      caller_username: context.callerUsername || '',
      chat_title: context.chatTitle || '',
      bot_username: profile.username ? `@${profile.username}` : '当前机器人'
    })
  }

  buildReplyMarkup(buttons) {
    const validButtons = Array.isArray(buttons) ? buttons.filter((item) => item.text) : []
    if (validButtons.length === 0) return null
    return {
      inline_keyboard: chunkButtons(validButtons).map((row) => row.map((button) => {
        if (button.actionType === 'page' && button.targetPageId) {
          return {
            text: button.text,
            callback_data: `page:${button.targetPageId}`
          }
        }
        return {
          text: button.text,
          url: button.url
        }
      }))
    }
  }

  buildGuestResult(replyConfig, context) {
    const renderedText = this.renderText(replyConfig.text, context)
    const replyMarkup = this.buildReplyMarkup(replyConfig.buttons)
    if (replyConfig.replyType === 'photo' && replyConfig.imageUrl) {
      return {
        type: 'photo',
        id: createId('guest-photo'),
        title: replyConfig.title,
        photo_url: replyConfig.imageUrl,
        thumbnail_url: replyConfig.imageUrl,
        caption: renderedText,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      }
    }

    return {
      type: 'article',
      id: createId('guest-article'),
      title: replyConfig.title,
      input_message_content: {
        message_text: renderedText
      },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    }
  }

  async sendChatReply(chatId, replyConfig, context) {
    const renderedText = this.renderText(replyConfig.text, context)
    const replyMarkup = this.buildReplyMarkup(replyConfig.buttons)
    if (replyConfig.replyType === 'photo' && replyConfig.imageUrl) {
      return await this.callBotApi('sendPhoto', {
        chat_id: chatId,
        photo: replyConfig.imageUrl,
        caption: renderedText,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      })
    }

    return await this.callBotApi('sendMessage', {
      chat_id: chatId,
      text: renderedText,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  }

  async handleGuestMessage(guestMessage) {
    const queryId = guestMessage?.guest_query_id
    const text = typeof guestMessage?.text === 'string' && guestMessage.text.trim()
      ? guestMessage.text.trim()
      : typeof guestMessage?.caption === 'string' && guestMessage.caption.trim()
        ? guestMessage.caption.trim()
        : '[非文本消息]'
    const caller = guestMessage?.from || guestMessage?.guest_sender_user || {}
    const callerName = [caller?.first_name, caller?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
    const callerUsername = typeof caller?.username === 'string' && caller.username.trim() ? `@${caller.username.replace(/^@+/, '')}` : '未提供'
    const chatTitle = typeof guestMessage?.chat?.title === 'string' && guestMessage.chat.title.trim() ? guestMessage.chat.title.trim() : '未命名群组'

    this.writeState((current) => ({
      ...current,
      stats: {
        ...current.stats,
        receivedGuestCount: Number(current.stats?.receivedGuestCount || 0) + 1,
        lastGuestAt: new Date().toISOString()
      }
    }))
    this.log('info', `收到访客消息：群【${chatTitle}】/ 用户【${callerName}】/ 内容【${text}】`)

    if (!this.bot.guestReplyEnabled) {
      this.log('warning', 'Guest 自动回复当前已关闭，这条只记日志，不回复。')
      return
    }

    if (!queryId) {
      this.writeState((current) => ({
        ...current,
        stats: {
          ...current.stats,
          failedGuestCount: Number(current.stats?.failedGuestCount || 0) + 1
        },
        lastError: '未拿到 guest_query_id，无法回复访客消息。'
      }))
      this.log('error', '收到访客消息，但没拿到 guest_query_id，无法回复。')
      return
    }

    const matchedRule = this.resolveKeywordReply(text)
    const replyConfig = matchedRule
      ? matchedRule
      : {
          title: this.bot.guestReplyTitle,
          text: this.bot.guestReplyText,
          replyType: this.bot.guestReplyType,
          imageUrl: this.bot.guestReplyImageUrl,
          buttons: this.bot.guestReplyButtons
        }

    try {
      await this.callBotApi('answerGuestQuery', {
        guest_query_id: queryId,
        result: this.buildGuestResult(replyConfig, {
          text,
          callerName,
          callerUsername,
          chatTitle
        })
      })
      this.writeState((current) => ({
        ...current,
        stats: {
          ...current.stats,
          answeredGuestCount: Number(current.stats?.answeredGuestCount || 0) + 1
        },
        lastActionMessage: `已回复群【${chatTitle}】的访客消息。`,
        lastError: ''
      }))
      this.log('success', matchedRule ? `访客消息已按关键词【${matchedRule.keyword}】回复。` : '访客消息已自动回复。')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.writeState((current) => ({
        ...current,
        stats: {
          ...current.stats,
          failedGuestCount: Number(current.stats?.failedGuestCount || 0) + 1
        },
        lastError: message
      }))
      this.log('error', `回复访客消息失败：${message}`)
    }
  }

  async handlePrivateMessage(message) {
    const chatId = typeof message?.chat?.id === 'number' ? message.chat.id : null
    if (!chatId) return
    if (message?.chat?.type !== 'private') return
    if (message?.from?.is_bot) return

    const text = typeof message?.text === 'string' && message.text.trim()
      ? message.text.trim()
      : typeof message?.caption === 'string' && message.caption.trim()
        ? message.caption.trim()
        : '[非文本消息]'

    if (!this.bot.privateReplyEnabled) {
      return
    }

    const callerName = [message?.from?.first_name, message?.from?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
    const callerUsername = typeof message?.from?.username === 'string' && message.from.username.trim() ? `@${message.from.username.replace(/^@+/, '')}` : '未提供'
    const matchedRule = this.resolveKeywordReply(text)
    const replyConfig = matchedRule
      ? matchedRule
      : {
          title: this.bot.privateReplyTitle,
          text: this.bot.privateReplyText,
          replyType: this.bot.privateReplyType,
          imageUrl: this.bot.privateReplyImageUrl,
          buttons: this.bot.privateReplyButtons
        }

    try {
      await this.sendChatReply(chatId, replyConfig, {
        text,
        callerName,
        callerUsername,
        chatTitle: '私聊'
      })
      this.writeState((current) => ({
        ...current,
        stats: {
          ...current.stats,
          privateReplyCount: Number(current.stats?.privateReplyCount || 0) + 1,
          lastPrivateAt: new Date().toISOString()
        },
        lastError: ''
      }))
      this.log('success', matchedRule ? `私聊消息已按关键词【${matchedRule.keyword}】回复。` : '私聊默认菜单已发送。')
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      this.writeState((current) => ({
        ...current,
        lastError: messageText
      }))
      this.log('error', `私聊回复失败：${messageText}`)
    }
  }

  async handleCallbackQuery(callbackQuery) {
    const data = normalizeString(callbackQuery?.data)
    const chatId = callbackQuery?.message?.chat?.id
    if (!data || typeof chatId !== 'number') return

    if (data.startsWith('page:')) {
      const pageId = data.slice('page:'.length)
      const page = this.resolvePage(pageId)
      if (!page) {
        await this.safeAnswerCallback(callbackQuery.id, '这个按钮页面不存在。')
        return
      }

      const callerName = [callbackQuery?.from?.first_name, callbackQuery?.from?.last_name].filter((item) => typeof item === 'string' && item.trim()).join(' ').trim() || '访客用户'
      const callerUsername = typeof callbackQuery?.from?.username === 'string' && callbackQuery.from.username.trim() ? `@${callbackQuery.from.username.replace(/^@+/, '')}` : '未提供'

      try {
        await this.sendChatReply(chatId, page, {
          text: callbackQuery?.message?.text || '',
          callerName,
          callerUsername,
          chatTitle: callbackQuery?.message?.chat?.title || '私聊'
        })
        await this.safeAnswerCallback(callbackQuery.id, '已打开。')
        this.writeState((current) => ({
          ...current,
          stats: {
            ...current.stats,
            callbackReplyCount: Number(current.stats?.callbackReplyCount || 0) + 1
          },
          lastError: ''
        }))
        this.log('info', `按钮交互已触发页面【${pageId}】。`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.safeAnswerCallback(callbackQuery.id, '打开失败，请稍后再试。')
        this.writeState((current) => ({
          ...current,
          lastError: message
        }))
        this.log('error', `按钮页面发送失败：${message}`)
      }
      return
    }

    await this.safeAnswerCallback(callbackQuery.id, '这个按钮动作暂时没接。')
  }

  async safeAnswerCallback(callbackId, text) {
    if (!callbackId) return
    try {
      await this.callBotApi('answerCallbackQuery', {
        callback_query_id: callbackId,
        text
      })
    } catch {
      // ignore
    }
  }

  async callBotApi(method, payload, signal) {
    const response = await fetch(`https://api.telegram.org/bot${this.bot.botToken}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {}),
      signal
    })

    if (!response.ok) {
      throw new Error(`Telegram Bot API 请求失败（HTTP ${response.status}）`)
    }

    const json = await response.json()
    if (!json?.ok) {
      throw new Error(typeof json?.description === 'string' && json.description.trim() ? json.description.trim() : `${method} 调用失败`)
    }
    return json.result
  }
}

async function main() {
  const configPath = resolveCliConfigPath()
  if (!fs.existsSync(configPath)) {
    console.error(`配置文件不存在：${configPath}`)
    process.exitCode = 1
    return
  }

  const rawConfig = readJson(configPath, null)
  if (!rawConfig) {
    console.error(`配置文件读取失败：${configPath}`)
    process.exitCode = 1
    return
  }

  const config = normalizeConfig(rawConfig, configPath)
  if (!Array.isArray(config.bots) || config.bots.length === 0) {
    console.error('没有可启动的机器人配置。')
    process.exitCode = 1
    return
  }

  const stateStore = new RuntimeStateStore(config.stateFile)
  const runtimes = config.bots.map((bot) => new VisitorBotRuntime(bot, stateStore))
  const startupTargets = runtimes.filter((runtime) => runtime.bot.autoStart && runtime.bot.botToken)

  if (startupTargets.length === 0) {
    console.log('当前没有可自动启动的机器人。请先填写 botToken，或把 autoStart 打开。')
    return
  }

  const shutdown = async (reason) => {
    await Promise.all(runtimes.map((runtime) => runtime.stop(reason)))
  }

  process.once('SIGINT', () => {
    void shutdown('收到 SIGINT，正在停止机器人...')
      .finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void shutdown('收到 SIGTERM，正在停止机器人...')
      .finally(() => process.exit(0))
  })

  await Promise.all(startupTargets.map((runtime) => runtime.start()))
}

void main()
