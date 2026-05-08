import { create } from 'zustand'
import type { StatRecord } from '../types'

interface DashboardState {
  stats: StatRecord[]
}

const baseStats: StatRecord[] = [
  { id: 'online', label: '存活账号', value: '128', delta: '+12.4%', tone: 'success' },
  { id: 'frozen', label: '冻结账号', value: '07', delta: '-2.1%', tone: 'danger' },
  { id: 'session', label: 'Session 状态', value: '96.8%', delta: '+3.8%', tone: 'primary' },
  { id: 'realtime', label: '实时吞吐', value: '18.4k', delta: '+9.9%', tone: 'warning' }
]

export const useDashboardStore = create<DashboardState>(() => ({
  stats: baseStats
}))
