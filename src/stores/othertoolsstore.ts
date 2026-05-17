import { create } from 'zustand'
import type { OtherToolsSniperListenerState, OtherToolsSniperResult } from '../types'

interface OtherToolsState {
  initialized: boolean
  sniperSummary: OtherToolsSniperResult | null
  manualRunning: boolean
  manualMessage: string
  manualErrorMessage: string
  listenerState: OtherToolsSniperListenerState | null
  init: () => void
  startManualRun: (message?: string) => void
  finishManualRun: (result: OtherToolsSniperResult) => void
  failManualRun: (message: string) => void
  clearManualStatus: () => void
  setListenerState: (state: OtherToolsSniperListenerState | null) => void
}

let subscribed = false

export const useOtherToolsStore = create<OtherToolsState>((set) => ({
  initialized: false,
  sniperSummary: null,
  manualRunning: false,
  manualMessage: '',
  manualErrorMessage: '',
  listenerState: null,
  init: () => {
    if (subscribed) {
      set({ initialized: true })
      return
    }

    subscribed = true
    set({ initialized: true })

    const api = window.desktopOtherTools
    if (!api) return

    void api.getSniperListenerState()
      .then((state) => {
        set({ listenerState: state })
      })
      .catch(() => undefined)

    api.onSniperListenerState((state) => {
      set({ listenerState: state })
    })
  },
  startManualRun: (message = '抢注巡检进行中…') => set({
    manualRunning: true,
    manualMessage: message,
    manualErrorMessage: '',
    sniperSummary: null
  }),
  finishManualRun: (result) => set({
    sniperSummary: result,
    manualRunning: false,
    manualMessage: result.message || '抢注巡检已完成。',
    manualErrorMessage: ''
  }),
  failManualRun: (message) => set({
    manualRunning: false,
    manualMessage: '',
    manualErrorMessage: message,
    sniperSummary: null
  }),
  clearManualStatus: () => set({
    manualRunning: false,
    manualMessage: '',
    manualErrorMessage: ''
  }),
  setListenerState: (state) => set({ listenerState: state })
}))
