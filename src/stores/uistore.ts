import { create } from 'zustand'
import type { ModuleKey } from '../types'

interface UIState {
  activeModule: ModuleKey
  notificationCount: number
  userName: string
  setActiveModule: (module: ModuleKey) => void
  setNotificationCount: (count: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: 'dashboard',
  notificationCount: 6,
  userName: '总控席',
  setActiveModule: (module) => set({ activeModule: module }),
  setNotificationCount: (count) => set({ notificationCount: count })
}))
