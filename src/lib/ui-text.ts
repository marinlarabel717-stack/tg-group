import { inferCountryDisplay as inferCountryDisplayFromPhone } from './phone-country'
import type { AccountStatus, CheckLogLevel, ProfileSource } from '../types'

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
  banned: '封禁',
  limited: '双向限制',
  temporary_limited: '临时双向',
  session_expired: 'Session 失效',
  not_logged_in: '未登录',
  multi_ip: '多 IP 登录',
  timeout: '超时未连接',
  checking: '检测中',
  unknown: '未检查'
}

export const profileSourceLabelMap: Record<ProfileSource, string> = {
  json_import: 'JSON 导入',
  login_check: '登录检查'
}

export function formatAccountStatus(status: AccountStatus) {
  return accountStatusLabelMap[status]
}

export function formatProfileSource(source: ProfileSource) {
  return profileSourceLabelMap[source]
}

export function formatCountryDisplay(country: string | null | undefined, phone?: string | null) {
  return inferCountryDisplayFromPhone(phone ?? '', country ?? '') || '—'
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

export function formatCheckLogLevel(level: CheckLogLevel) {
  if (level === 'success') return '成功'
  if (level === 'warning') return '警告'
  if (level === 'error') return '错误'
  return '信息'
}
