import { create } from 'zustand'
import type { BotCenterConfig, BotCenterState } from '../types'

interface BotCenterStoreState {
  state: BotCenterState
  initialized: boolean
  loading: boolean
  saving: boolean
  init: () => Promise<void>
  saveConfig: (patch: Partial<BotCenterConfig>) => Promise<void>
  refreshProfile: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  clearLogs: () => Promise<void>
}

const DEFAULT_STATE: BotCenterState = {
  config: {
    botToken: '',
    autoStart: false,
    guestReplyEnabled: true,
    guestReplyTitle: 'TG-Matrix',
    guestReplyText: '你好，我已收到你的召唤。\n\n你刚刚发送的是：{text}',
    guestReplyType: 'text',
    guestReplyImageUrl: '',
    guestReplyButtonEnabled: false,
    guestReplyButtonText: '',
    guestReplyButtonUrl: '',
    guestReplyButtonStyle: 'primary',
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

let subscribed = false

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
        lastError: error instanceof Error ? error.message : '机器人中心操作失败。'
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
          lastError: '当前运行环境未注入机器人中心 API。'
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
          useBotCenterStore.setState({ state: nextState, loading: false, initialized: true, saving: false })
        })
      }
    } catch (error) {
      set((current) => ({
        initialized: true,
        loading: false,
        state: {
          ...current.state,
          lastError: error instanceof Error ? error.message : '读取机器人中心状态失败。'
        }
      }))
    }
  },
  saveConfig: async (patch) => {
    const api = getApi()
    if (!api) {
      set((current) => ({ state: { ...current.state, lastError: '当前运行环境未注入机器人中心 API。' } }))
      return
    }
    await runAction(set, () => api.saveConfig(patch))
  },
  refreshProfile: async () => {
    const api = getApi()
    if (!api) {
      set((current) => ({ state: { ...current.state, lastError: '当前运行环境未注入机器人中心 API。' } }))
      return
    }
    await runAction(set, () => api.refreshProfile())
  },
  start: async () => {
    const api = getApi()
    if (!api) {
      set((current) => ({ state: { ...current.state, lastError: '当前运行环境未注入机器人中心 API。' } }))
      return
    }
    await runAction(set, () => api.start())
  },
  stop: async () => {
    const api = getApi()
    if (!api) {
      set((current) => ({ state: { ...current.state, lastError: '当前运行环境未注入机器人中心 API。' } }))
      return
    }
    await runAction(set, () => api.stop())
  },
  clearLogs: async () => {
    const api = getApi()
    if (!api) {
      set((current) => ({ state: { ...current.state, lastError: '当前运行环境未注入机器人中心 API。' } }))
      return
    }
    await runAction(set, () => api.clearLogs())
  }
}))
