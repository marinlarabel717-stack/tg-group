import { create } from 'zustand'
import type { ProxyPoolSettings, ProxyPoolState } from '../types'

function createEmptyState(): ProxyPoolState {
  return {
    proxies: [],
    settings: {
      enabled: true,
      defaultType: 'http',
      ipVersion: 'ipv4',
      randomize: true
    },
    checkState: {
      running: false,
      totalCount: 0,
      checkedCount: 0,
      aliveCount: 0,
      deadCount: 0,
      removedCount: 0,
      logs: [],
      lastUpdatedAt: null
    }
  }
}

let subscribed = false
let stateFlushTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: ProxyPoolState | null = null

interface ProxyPoolStoreState {
  initialized: boolean
  loading: boolean
  saving: boolean
  errorMessage: string
  lastActionMessage: string
  state: ProxyPoolState
  init: () => Promise<void>
  refresh: () => Promise<void>
  replaceProxyList: (text: string) => Promise<void>
  updateSettings: (patch: Partial<ProxyPoolSettings>) => Promise<void>
  startCheck: () => Promise<void>
  clearLogs: () => Promise<void>
}

function getDesktopProxyPoolApi() {
  return window.desktopProxyPool
}

async function syncState(set: (partial: Partial<ProxyPoolStoreState>) => void) {
  const api = getDesktopProxyPoolApi()
  if (!api) {
    set({
      initialized: true,
      loading: false,
      errorMessage: '当前运行环境未注入代理池 API。'
    })
    return
  }

  const state = await api.getState()
  set({ state, initialized: true, loading: false })
}

async function runSavingAction(
  set: (partial: Partial<ProxyPoolStoreState>) => void,
  action: () => Promise<void>
) {
  set({ saving: true, errorMessage: '' })
  try {
    await action()
  } catch (error) {
    set({ errorMessage: error instanceof Error ? error.message : '代理池操作失败，请稍后重试。' })
  } finally {
    set({ saving: false })
  }
}

export const useProxyPoolStore = create<ProxyPoolStoreState>((set, get) => ({
  initialized: false,
  loading: true,
  saving: false,
  errorMessage: '',
  lastActionMessage: '',
  state: createEmptyState(),
  init: async () => {
    if (!subscribed) {
      window.desktopProxyPool?.onState((state) => {
        pendingState = state

        const flushState = () => {
          if (stateFlushTimer) {
            clearTimeout(stateFlushTimer)
            stateFlushTimer = null
          }
          if (!pendingState) return
          const nextState = pendingState
          pendingState = null
          const previous = get().state
          const finished = previous.checkState.running && !nextState.checkState.running
          set({
            state: nextState,
            loading: false,
            initialized: true,
            lastActionMessage: finished
              ? `代理检查完成：可用 ${nextState.checkState.aliveCount} 条，不可用 ${nextState.checkState.deadCount} 条。`
              : get().lastActionMessage
          })
        }

        if (!state.checkState.running) {
          flushState()
          return
        }

        if (stateFlushTimer) return
        stateFlushTimer = setTimeout(flushState, 120)
      })
      subscribed = true
    }

    if (get().initialized) return
    set({ loading: true, errorMessage: '' })
    await syncState(set)
  },
  refresh: async () => {
    set({ loading: true, errorMessage: '' })
    await syncState(set)
  },
  replaceProxyList: async (text) => {
    await runSavingAction(set, async () => {
      const state = await getDesktopProxyPoolApi()?.replaceProxyList(text)
      if (!state) return
      set({
        state,
        lastActionMessage: `代理列表已更新，当前共 ${state.proxies.length} 条。`
      })
    })
  },
  updateSettings: async (patch) => {
    await runSavingAction(set, async () => {
      const state = await getDesktopProxyPoolApi()?.updateSettings(patch)
      if (!state) return
      set({ state, lastActionMessage: '代理池设置已保存。' })
    })
  },
  startCheck: async () => {
    await runSavingAction(set, async () => {
      const state = await getDesktopProxyPoolApi()?.startCheck()
      if (!state) return
      set({ state, lastActionMessage: '已开始检查代理，正在跳转日志中心。' })
    })
  },
  clearLogs: async () => {
    await runSavingAction(set, async () => {
      const state = await getDesktopProxyPoolApi()?.clearLogs()
      if (!state) return
      set({ state, lastActionMessage: '代理日志已清空。' })
    })
  }
}))
