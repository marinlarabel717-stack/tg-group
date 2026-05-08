import type { AccountStatus } from '../types'

export const moduleLabelMap = {
  dashboard: '仪表盘',
  accounts: '账号管理',
  automation: '自动化',
  'proxy-pool': '代理池',
  'session-manager': '会话管理',
  logs: '日志中心'
} as const

export const accountStatusLabelMap: Record<AccountStatus, string> = {
  alive: '存活',
  frozen: '冻结',
  banned: '封禁',
  limited: '双向限制',
  temporary_limited: '临时双向',
  session_expired: 'Session 失效',
  multi_ip: '多 IP 登录',
  timeout_unchecked: '超时未检测',
  checking: '检测中',
  unknown: '未知'
}

export function formatAccountStatus(status: AccountStatus) {
  return accountStatusLabelMap[status]
}

export function formatDateTime(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatRelativePath(fullPath: string) {
  if (!fullPath) return '—'

  const parts = fullPath.split(/[/\\]/)
  return parts.slice(Math.max(parts.length - 3, 0)).join(' / ')
}
