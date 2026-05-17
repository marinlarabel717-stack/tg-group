import { create } from 'zustand'
import type { ModuleKey } from '../types'

type LogsContext = 'accounts' | 'proxy-pool' | 'accounts-two-factor' | 'accounts-profile' | 'batch-create' | 'other-tools-sniper'

interface UIState {
  activeModule: ModuleKey
  logsContext: LogsContext
  notificationCount: number
  userName: string
  sidebarCollapsed: boolean
  setActiveModule: (module: ModuleKey) => void
  setLogsContext: (context: LogsContext) => void
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
