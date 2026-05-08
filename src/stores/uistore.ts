import { create } from 'zustand'
import type { ModuleKey } from '../types'

interface UIState {
  activeModule: ModuleKey
  notificationCount: number
  userName: string
  sidebarCollapsed: boolean
  setActiveModule: (module: ModuleKey) => void
  setNotificationCount: (count: number) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: 'dashboard',
  notificationCount: 6,
  userName: '总控席',
  sidebarCollapsed: false,
  setActiveModule: (module) => set({ activeModule: module }),
  setNotificationCount: (count) => set({ notificationCount: count }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
