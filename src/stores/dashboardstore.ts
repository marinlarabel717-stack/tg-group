import { create } from 'zustand'
import type { StatRecord } from '../types'

interface DashboardState {
  stats: StatRecord[]
}

const baseStats: StatRecord[] = [
  { id: 'engine', label: '检查引擎', value: 'GramJS', delta: '已接入', tone: 'success' },
  { id: 'queue', label: '队列能力', value: '并发 + 重试', delta: '已接通', tone: 'primary' },
  { id: 'status', label: '状态来源', value: 'SpamBot', delta: '自动判定', tone: 'warning' },
  { id: 'scope', label: '当前范围', value: '仅检查引擎', delta: '无自动化', tone: 'danger' }
]

export const useDashboardStore = create<DashboardState>(() => ({
  stats: baseStats
}))
