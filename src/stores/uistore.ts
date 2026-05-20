import { create } from 'zustand'
import type { ModuleKey } from '../types'

export type LogsContext = 'accounts' | 'proxy-pool' | 'accounts-two-factor' | 'accounts-profile' | 'batch-create' | 'other-tools-sniper'
export type ReauthorizeTab = 'settings' | 'logs'

interface UIState {
  activeModule: ModuleKey
  logsContext: LogsContext
  reauthorizeTab: ReauthorizeTab
  notificationCount: number
  userName: string
  sidebarCollapsed: boolean
  setActiveModule: (module: ModuleKey) => void
  setLogsContext: (context: LogsContext) => void
  setReauthorizeTab: (tab: ReauthorizeTab) => void
  setNotificationCount: (count: number) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: 'dashboard',
  logsContext: 'accounts',
  reauthorizeTab: 'settings',
  notificationCount: 6,
  userName: '总控席',
  sidebarCollapsed: false,
  setActiveModule: (module) => set({ activeModule: module }),
  setLogsContext: (context) => set({ logsContext: context }),
  setReauthorizeTab: (tab) => set({ reauthorizeTab: tab }),
  setNotificationCount: (count) => set({ notificationCount: count }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
