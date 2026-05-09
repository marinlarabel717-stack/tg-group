import { create } from 'zustand'
import type { ModuleKey } from '../types'

interface UIState {
  activeModule: ModuleKey
  logsContext: 'accounts' | 'proxy-pool'
  notificationCount: number
  userName: string
  sidebarCollapsed: boolean
  setActiveModule: (module: ModuleKey) => void
  setLogsContext: (context: 'accounts' | 'proxy-pool') => void
  setNotificationCount: (count: number) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: 'dashboard',
  logsContext: 'accounts',
  notificationCount: 6,
  userName: '总控席',
  sidebarCollapsed: false,
  setActiveModule: (module) => set({ activeModule: module }),
  setLogsContext: (context) => set({ logsContext: context }),
  setNotificationCount: (count) => set({ notificationCount: count }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
