import { create } from 'zustand'
import type { ModuleKey, StatRecord } from '../types'

const baseStats: StatRecord[] = [
  { id: 'engine', label: '检查引擎', value: 'GramJS', delta: '已接入', tone: 'success' },
  { id: 'ipc', label: 'Electron IPC', value: '已接通', delta: '前后端联动', tone: 'primary' },
  { id: 'queue', label: '队列能力', value: '并发/重试', delta: '检测链路', tone: 'warning' },
  { id: 'scope', label: '开发边界', value: '仅检查引擎', delta: '不做自动化', tone: 'danger' }
]

interface AppState {
  activeModule: ModuleKey
  search: string
  notificationCount: number
  userName: string
  stats: StatRecord[]
  setModule: (module: ModuleKey) => void
  setSearch: (value: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'dashboard',
  search: '',
  notificationCount: 0,
  userName: '总控席',
  stats: baseStats,
  setModule: (module) => set({ activeModule: module }),
  setSearch: (value) => set({ search: value })
}))
