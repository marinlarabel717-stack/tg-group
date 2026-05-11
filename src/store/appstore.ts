import { create } from 'zustand'
import type { ModuleKey, StatRecord } from '../types'

const baseStats: StatRecord[] = [
  { id: 'local', label: '本地账号库', value: '阶段一', delta: '已立项', tone: 'success' },
  { id: 'ipc', label: 'Electron IPC', value: '已接通', delta: '前后端联动', tone: 'primary' },
  { id: 'grid', label: 'DataGrid', value: '虚拟滚动', delta: '可批量操作', tone: 'warning' },
  { id: 'scope', label: '开发边界', value: '本地管理', delta: '优先做定时群发', tone: 'danger' }
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
