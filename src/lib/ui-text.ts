import type { AccountStatus, ProxyStatus, SessionStatus } from '../types'

export const moduleLabelMap = {
  dashboard: '仪表盘',
  accounts: '账号管理',
  automation: '自动化',
  'proxy-pool': '代理池',
  'session-manager': '会话管理',
  logs: '日志中心'
} as const

export const accountStatusLabelMap: Record<AccountStatus, string> = {
  Online: '存活',
  Frozen: '冻结',
  Limited: '双向限制',
  Offline: '离线',
  Active: '活跃',
  Checking: '检测中'
}

export const sessionStatusLabelMap: Record<SessionStatus, string> = {
  Healthy: '正常',
  Warning: '风险',
  Expired: '失效'
}

export const proxyStatusLabelMap: Record<ProxyStatus, string> = {
  Dedicated: '专属 Proxy',
  Shared: '共享 Proxy',
  Rotating: '轮换 Proxy',
  Fallback: '备用 Proxy'
}

export function formatAccountStatus(status: AccountStatus) {
  return accountStatusLabelMap[status]
}

export function formatSessionStatus(status: SessionStatus) {
  return sessionStatusLabelMap[status]
}

export function formatProxyStatus(status: ProxyStatus) {
  return proxyStatusLabelMap[status]
}
