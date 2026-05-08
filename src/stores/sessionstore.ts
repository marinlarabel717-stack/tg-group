import { create } from 'zustand'

export interface SessionStreamItem {
  id: string
  title: string
  status: string
  meta: string
}

interface SessionState {
  stream: SessionStreamItem[]
}

const sessionStream: SessionStreamItem[] = [
  { id: 'gateway-01', title: '网关 01', status: '正常', meta: '98ms' },
  { id: 'session-core', title: 'Session 核心', status: '已同步', meta: '11ms' },
  { id: 'proxy-chain', title: 'Proxy 链路', status: '稳定', meta: '23 条路由' },
  { id: 'automation-bus', title: '自动化总线', status: '运行中', meta: '24 个任务' }
]

export const useSessionStore = create<SessionState>(() => ({
  stream: sessionStream
}))
