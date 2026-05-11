import { inferCountryDisplay as inferCountryDisplayFromPhone } from './phone-country'
import type { AccountStatus, CheckLogLevel, ProfileSource } from '../types'

export const GEO_RESTRICTED_MARKERS = [
  'anti-spam systems',
  'harsh response',
  'some phone numbers may trigger',
  '地理位置限制'
] as const

export const moduleLabelMap = {
  dashboard: '仪表盘',
  accounts: '账号管理',
  automation: '定时群发',
  'proxy-pool': '代理池',
  'session-manager': '会话管理',
  logs: '日志中心',
  settings: '设置'
} as const

export const accountStatusLabelMap: Record<AccountStatus, string> = {
  alive: '无限制',
  banned: '封禁',
  limited: '双向',
  temporary_limited: '临时双向',
  frozen: '冻结',
  session_expired: 'Session 失效',
  not_logged_in: '未登录',
  multi_ip: '多 IP 登录',
  timeout: '超时',
  checking: '检测中',
  unknown: '未检查'
}

export function isGeoRestrictedError(errorMessage?: string | null) {
  const value = (errorMessage || '').toLowerCase()
  if (!value) return false
  return GEO_RESTRICTED_MARKERS.some((marker) => value.includes(marker.toLowerCase()))
}

export function resolveAccountStatusLabel(
  status: AccountStatus,
  errorMessage?: string | null,
  checkMode?: 'account-status' | 'account-survival' | null
) {
  if (status === 'alive' && checkMode === 'account-survival') {
    return '存活'
  }

  if (status === 'unknown' && isGeoRestrictedError(errorMessage)) {
    return '地理位置限制'
  }

  return accountStatusLabelMap[status]
}

export const profileSourceLabelMap: Record<ProfileSource, string> = {
  json_import: 'JSON 导入',
  login_check: '登录检查'
}

export function formatAccountStatus(
  status: AccountStatus,
  errorMessage?: string | null,
  checkMode?: 'account-status' | 'account-survival' | null
) {
  return resolveAccountStatusLabel(status, errorMessage, checkMode)
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

export function formatDateTimeFull(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
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
