import { create } from 'zustand'
import type { BotCenterBotState, BotCenterConfig, BotCenterState } from '../types'

interface BotCenterStoreState {
  state: BotCenterState
  initialized: boolean
  loading: boolean
  saving: boolean
  init: () => Promise<void>
  addBot: () => Promise<void>
  removeBot: (botId: string) => Promise<void>
  selectBot: (botId: string) => Promise<void>
  saveConfig: (botId: string, patch: Partial<BotCenterConfig>) => Promise<void>
  refreshProfile: (botId: string) => Promise<void>
  start: (botId: string) => Promise<void>
  stop: (botId: string) => Promise<void>
  clearLogs: (botId: string) => Promise<void>
}

function createDefaultBot(): BotCenterBotState {
  return {
    id: 'bot-default',
    config: {
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
    },
    profile: {
      id: null,
      username: '',
      firstName: '',
      canJoinGroups: true,
      canReadAllGroupMessages: false,
      supportsGuestQueries: false,
      fetchedAt: null,
      valid: false
    },
    stats: {
      receivedGuestCount: 0,
      answeredGuestCount: 0,
      failedGuestCount: 0,
      lastGuestAt: null
    },
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

const DEFAULT_STATE: BotCenterState = {
  bots: [createDefaultBot()],
  activeBotId: 'bot-default'
}

let subscribed = false
let stateFlushTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: BotCenterState | null = null

type StoreSet = (partial: Partial<BotCenterStoreState> | ((state: BotCenterStoreState) => Partial<BotCenterStoreState>)) => void

function getApi() {
  return window.desktopBotCenter
}

async function runAction(set: StoreSet, action: () => Promise<BotCenterState>) {
  set({ saving: true })
  try {
    const state = await action()
    set({ state, saving: false })
  } catch (error) {
    set((current) => ({
      saving: false,
      state: {
        ...current.state,
        bots: current.state.bots.map((bot) => ({
          ...bot,
          lastError: error instanceof Error ? error.message : '机器人中心操作失败。'
        }))
      }
    }))
  }
}

export const useBotCenterStore = create<BotCenterStoreState>((set, get) => ({
  state: DEFAULT_STATE,
  initialized: false,
  loading: false,
  saving: false,
  init: async () => {
    if (get().initialized) return
    const api = getApi()
    if (!api) {
      set((current) => ({
        initialized: true,
        state: {
          ...current.state,
          bots: current.state.bots.map((bot) => ({
            ...bot,
            lastError: '当前运行环境未注入机器人中心 API。'
          }))
        }
      }))
      return
    }

    set({ loading: true })
    try {
      const state = await api.getState()
      set({ state, initialized: true, loading: false })

      if (!subscribed) {
        subscribed = true
        api.onState((nextState) => {
          pendingState = nextState

          const flushState = () => {
            if (stateFlushTimer) {
              clearTimeout(stateFlushTimer)
              stateFlushTimer = null
            }
            if (!pendingState) return
            useBotCenterStore.setState({ state: pendingState, loading: false, initialized: true, saving: false })
            pendingState = null
          }

          const hasRunningBot = nextState.bots.some((bot) => bot.running || bot.polling)
          if (!hasRunningBot) {
            flushState()
            return
          }

          if (stateFlushTimer) return
          stateFlushTimer = setTimeout(flushState, 120)
        })
      }
    } catch (error) {
      set((current) => ({
        initialized: true,
        loading: false,
        state: {
          ...current.state,
          bots: current.state.bots.map((bot) => ({
            ...bot,
            lastError: error instanceof Error ? error.message : '读取机器人中心状态失败。'
          }))
        }
      }))
    }
  },
  addBot: async () => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.addBot())
  },
  removeBot: async (botId) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.removeBot(botId))
  },
  selectBot: async (botId) => {
    const api = getApi()
    if (!api) return
    try {
      const state = await api.selectBot(botId)
      set({ state })
    } catch {
      // ignore select failures quietly
    }
  },
  saveConfig: async (botId, patch) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.saveConfig(botId, patch))
  },
  refreshProfile: async (botId) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.refreshProfile(botId))
  },
  start: async (botId) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.start(botId))
  },
  stop: async (botId) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.stop(botId))
  },
  clearLogs: async (botId) => {
    const api = getApi()
    if (!api) return
    await runAction(set, () => api.clearLogs(botId))
  }
}))
