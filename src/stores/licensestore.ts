import { create } from 'zustand'
import type { DesktopLicenseActivateResult, DesktopLicenseState } from '../types'

const DEFAULT_STATE: DesktopLicenseState = {
  status: 'missing',
  canEnter: false,
  machineId: '',
  appVersion: window.desktopInfo?.version || '0.0.1',
  isPackaged: false,
  devBypassAvailable: true,
  apiConfigured: false,
  cardKeyMasked: null,
  expireAt: null,
  activatedAt: null,
  lastValidatedAt: null,
  offlineGraceUntil: null,
  message: '正在检查授权状态。'
}

interface LicenseStoreState {
  state: DesktopLicenseState
  initialized: boolean
  loading: boolean
  activating: boolean
  errorMessage: string
  lastActionMessage: string
  devBypass: boolean
  init: () => Promise<void>
  activate: (cardKey: string) => Promise<DesktopLicenseActivateResult | null>
  clear: () => Promise<void>
  enterDevMode: () => void
}

export const useLicenseStore = create<LicenseStoreState>((set, get) => ({
  state: DEFAULT_STATE,
  initialized: false,
  loading: false,
  activating: false,
  errorMessage: '',
  lastActionMessage: '',
  devBypass: false,
  init: async () => {
    if (get().initialized) return
    set({ loading: true, errorMessage: '' })
    try {
      const state = await window.desktopLicense?.getState()
      set({
        state: state ?? DEFAULT_STATE,
        initialized: true,
        loading: false
      })
    } catch (error) {
      set({
        initialized: true,
        loading: false,
        errorMessage: error instanceof Error ? error.message : '读取授权状态失败。'
      })
    }
  },
  activate: async (cardKey) => {
    set({ activating: true, errorMessage: '', lastActionMessage: '' })
    try {
      const result = await window.desktopLicense?.activate(cardKey)
      if (!result) {
        set({ activating: false, errorMessage: '当前运行环境未注入授权 API。' })
        return null
      }

      set({
        activating: false,
        state: result.snapshot,
        lastActionMessage: result.ok ? result.message : '',
        errorMessage: result.ok ? '' : result.message,
        devBypass: false
      })
      return result
    } catch (error) {
      set({ activating: false, errorMessage: error instanceof Error ? error.message : '卡密激活失败。' })
      return null
    }
  },
  clear: async () => {
    try {
      const state = await window.desktopLicense?.clear()
      set({ state: state ?? DEFAULT_STATE, lastActionMessage: '本地授权记录已清空。', errorMessage: '', devBypass: false })
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : '清空本地授权失败。' })
    }
  },
  enterDevMode: () => set({ devBypass: true, errorMessage: '', lastActionMessage: '当前为开发模式临时放行，仅用于本地调试。' })
}))

