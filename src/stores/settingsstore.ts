import { create } from 'zustand'
import type { DesktopAppSettings } from '../types'

interface SettingsStoreState {
  settings: DesktopAppSettings
  initialized: boolean
  loading: boolean
  saving: boolean
  errorMessage: string
  lastActionMessage: string
  init: () => Promise<void>
  saveCheckConcurrency: (value: number) => Promise<void>
}

function getDesktopSettingsApi() {
  return window.desktopSettings
}

const DEFAULT_SETTINGS: DesktopAppSettings = {
  checkConcurrency: 3
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  initialized: false,
  loading: false,
  saving: false,
  errorMessage: '',
  lastActionMessage: '',
  init: async () => {
    if (get().initialized) return
    const api = getDesktopSettingsApi()
    if (!api) {
      set({ initialized: true, errorMessage: '当前运行环境未注入设置 API。' })
      return
    }

    set({ loading: true, errorMessage: '' })
    try {
      const settings = await api.get()
      set({ settings, initialized: true, loading: false })
    } catch (error) {
      set({ loading: false, initialized: true, errorMessage: error instanceof Error ? error.message : '读取设置失败。' })
    }
  },
  saveCheckConcurrency: async (value) => {
    const api = getDesktopSettingsApi()
    if (!api) {
      set({ errorMessage: '当前运行环境未注入设置 API。' })
      return
    }

    set({ saving: true, errorMessage: '', lastActionMessage: '' })
    try {
      const settings = await api.update({ checkConcurrency: value })
      set({
        settings,
        saving: false,
        lastActionMessage: `检测并发已更新为 ${settings.checkConcurrency} 线程。`
      })
    } catch (error) {
      set({ saving: false, errorMessage: error instanceof Error ? error.message : '保存设置失败。' })
    }
  }
}))
