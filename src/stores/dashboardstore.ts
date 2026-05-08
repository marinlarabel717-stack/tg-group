import { create } from 'zustand'
import type { StatRecord } from '../types'

interface DashboardState {
  stats: StatRecord[]
}

const baseStats: StatRecord[] = [
  { id: 'import', label: '导入链路', value: '已接通', delta: 'SQLite', tone: 'success' },
  { id: 'scanner', label: '扫描能力', value: '递归', delta: 'Session + JSON', tone: 'primary' },
  { id: 'status', label: '状态解析', value: 'Check Engine', delta: '已接入', tone: 'warning' },
  { id: 'scope', label: '当前范围', value: '本地管理', delta: '无自动化', tone: 'danger' }
]

export const useDashboardStore = create<DashboardState>(() => ({
  stats: baseStats
}))
