import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type UIEvent,
  type WheelEvent
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Activity, ArrowUpDown, ChevronLeft, ChevronRight, CircleAlert, HeartPulse, KeyRound, Loader2, LockKeyhole, Settings2, Shuffle, Sparkles, Star, Trash2, UserRoundPen, X } from 'lucide-react'
import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { AccountListPageResult, AccountListReauthorizeFilter, AccountRecord, AccountStatus, CheckAction, ProfileOperationAction, ProfileOperationPayload, SessionManagerActionKind, TwoFactorAction, TwoFactorOperationPayload } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { AccountSummaryCards } from './accountsummarycards'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { ProfileManageDialog } from './profiledialog'
import { TwoFactorManageDialog } from './twofactordialog'
import { filterAccounts, useAccountStore, type AccountStatusFilter } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap, type AccountTaskKind } from '../../lib/account-task-status'
import { formatAccountStatus, formatCountryDisplay, formatDateTime, formatDateTimeFull, formatProfileSource } from '../../lib/ui-text'
import { resolveCountryMeta } from '../../lib/phone-country'
import { useUIStore } from '../../stores/uistore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'

const ACCOUNT_GRID_TEMPLATE = '38px 52px minmax(148px,1.35fr) minmax(96px,0.9fr) minmax(108px,1fr) 74px minmax(140px,1.15fr) minmax(88px,0.85fr) minmax(96px,0.9fr) minmax(176px,1.4fr)'
const ACCOUNT_GRID_MIN_WIDTH = 1016
const ACCOUNT_SHELL_MIN_WIDTH = ACCOUNT_GRID_MIN_WIDTH + 16
const LARGE_ACCOUNT_UI_THRESHOLD = 3000
const ACCOUNT_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: ACCOUNT_GRID_TEMPLATE,
  width: '100%',
  minWidth: `${ACCOUNT_GRID_MIN_WIDTH}px`
}

interface PremiumDialogState {
  account: AccountRecord
  premiumExpiryOverride?: string | null
}

interface TwoFactorDialogState {
  action: TwoFactorAction
  accountIds: number[]
}

interface ProfileDialogState {
  action: ProfileOperationAction
  accountIds: number[]
}

function profileActionNeedsDialog(action: ProfileOperationAction) {
  return action === 'custom-avatar' || action === 'custom-nickname' || action === 'custom-username' || action === 'custom-bio'
}

type BulkOperationSubmenu = 'two-fa' | 'profile' | 'cleanup' | null
type PremiumFilter = 'all' | 'premium' | 'non-premium'
type PresenceFilter = 'all' | 'has' | 'none'

interface AccountFilterShortcut {
  id: string
  name: string
  countryFilter: string
  statusFilter: AccountStatusFilter
  proxyFilter: string
  premiumFilter: PremiumFilter
  twoFactorFilter: PresenceFilter
  avatarFilter: PresenceFilter
  taskFilter: PresenceFilter
  usernameFilter: PresenceFilter
  reauthorizeFilter: AccountListReauthorizeFilter
}

const ACCOUNT_FILTER_SHORTCUT_STORAGE_KEY = 'tg-group-account-filter-shortcuts-v1'

const twoFaMenuItems = [
  { id: 'change-2fa', label: '更改 2FA' },
  { id: 'disable-2fa', label: '关闭 2FA' },
  { id: 'reset-2fa', label: '重置 2FA' }
] as const

const profileMenuItems = [
  { id: 'random-profile', label: '一键随机更换（头像 + 名称 + 简介）' },
  { id: 'random-avatar', label: '随机生成头像' },
  { id: 'random-nickname', label: '随机生成昵称' },
  { id: 'random-username', label: '随机生成用户名' },
  { id: 'random-bio', label: '随机生成简介' },
  { id: 'custom-avatar', label: '自定义头像' },
  { id: 'custom-nickname', label: '自定义昵称' },
  { id: 'custom-username', label: '自定义用户名' },
  { id: 'custom-bio', label: '自定义简介' },
  { id: 'remove-username', label: '删除用户名' },
  { id: 'remove-bio', label: '删除简介' },
  { id: 'clear-all-profile', label: '一键删除（用户名 + 简介 + 头像）' }
] as const

const cleanupMenuItems: Array<{ id: SessionManagerActionKind; label: string; hint: string }> = [
  {
    id: 'wipe-all-dialogs',
    label: '删除所有聊天对话',
    hint: '清理账号上的所有对话。'
  },
  {
    id: 'wipe-all-groups',
    label: '删除所有群组频道',
    hint: '清理账号所有的群跟频道，包括归档的。'
  },
  {
    id: 'wipe-all-contacts',
    label: '删除所有联系人',
    hint: '删除所有的联系人。'
  },
  {
    id: 'wipe-all-everything',
    label: '一键删除所有聊天-群组-频道-联系人',
    hint: '聊天、群组频道、联系人会一起清理。'
  }
] as const

function createDefaultSorting() {
  return [{ id: 'lastOnlineTime', desc: true }]
}

function createDefaultPagination() {
  return { pageIndex: 0, pageSize: 20 }
}

function createEmptyAccountPage(): AccountListPageResult {
  return {
    accounts: [],
    total: 0
  }
}

function loadAccountFilterShortcuts(): AccountFilterShortcut[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(ACCOUNT_FILTER_SHORTCUT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => ({
        id: typeof item?.id === 'string' ? item.id : '',
        name: typeof item?.name === 'string' ? item.name.trim() : '',
        countryFilter: typeof item?.countryFilter === 'string' ? item.countryFilter : '',
        statusFilter: typeof item?.statusFilter === 'string' ? item.statusFilter as AccountStatusFilter : 'all',
        proxyFilter: typeof item?.proxyFilter === 'string' ? item.proxyFilter : '',
        premiumFilter: item?.premiumFilter === 'premium' || item?.premiumFilter === 'non-premium' ? item.premiumFilter : 'all',
        twoFactorFilter: item?.twoFactorFilter === 'has' || item?.twoFactorFilter === 'none' ? item.twoFactorFilter : 'all',
        avatarFilter: item?.avatarFilter === 'has' || item?.avatarFilter === 'none' ? item.avatarFilter : 'all',
        taskFilter: item?.taskFilter === 'has' || item?.taskFilter === 'none' ? item.taskFilter : 'all',
        usernameFilter: item?.usernameFilter === 'has' || item?.usernameFilter === 'none' ? item.usernameFilter : 'all',
        reauthorizeFilter: item?.reauthorizeFilter === 'success' || item?.reauthorizeFilter === 'failed' ? item.reauthorizeFilter : 'all'
      }))
      .filter((item) => item.id && item.name)
  } catch {
    return []
  }
}

function saveAccountFilterShortcuts(shortcuts: AccountFilterShortcut[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACCOUNT_FILTER_SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts))
}

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function actionButtonClass(active = true) {
  return `flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[7px] border text-[11px] font-semibold transition ${active
    ? 'border-white/10 bg-panel text-slate-200 hover:bg-hover hover:text-neonSoft'
    : 'border-white/5 bg-slate-950/35 text-slate-500'}`
}

function cellTextClass(extra = '') {
  return `block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${extra}`.trim()
}

async function copyText(value: string) {
  if (!value) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // ignore and fallback below
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

function CountryCell({ country, phone }: { country: string; phone: string }) {
  const meta = resolveCountryMeta(phone, country)
  const value = formatCountryDisplay(country, phone)

  if (!meta) {
    return <div className={cellTextClass()} title={value}>{value}</div>
  }

  const FlagComponent = FlagIcons[meta.iso2 as keyof typeof FlagIcons] as ((props: { title?: string; className?: string }) => JSX.Element) | undefined

  return (
    <div className="flex min-w-0 items-center gap-2" title={value}>
      {FlagComponent ? (
        <FlagComponent className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" title={meta.nameZh} />
      ) : null}
      <span className={cellTextClass()}>{meta.nameZh}</span>
    </div>
  )
}

function isCenteredColumn(columnId: string) {
  return columnId === 'index' || columnId === 'status' || columnId === 'avatar' || columnId === 'task' || columnId === 'actions'
}

function cellShellClass(columnId: string, isHeader = false) {
  if (columnId === 'select') {
    return 'flex h-full w-full items-center justify-center px-0'
  }

  if (isCenteredColumn(columnId)) {
    return 'flex h-full w-full items-center justify-center px-1'
  }

  if (columnId === 'nickname') {
    return 'flex h-full w-full min-w-0 items-center justify-start pr-1 pl-1.5'
  }

  if (columnId === 'proxy') {
    return 'flex h-full w-full min-w-0 items-center justify-start px-1'
  }

  if (columnId === 'actions') {
    return 'flex h-full w-full items-center justify-center px-0.5'
  }

  return 'flex h-full w-full min-w-0 items-center justify-start px-1'
}

function readProxy(account: AccountRecord) {
  if (typeof account.proxyDisplay === 'string' && account.proxyDisplay.trim()) return '代理'
  if (account.profile?.proxy === true) return '代理'
  return '直连'
}

function TaskBadge({ accountId, taskMap }: { accountId: number; taskMap: Map<number, AccountTaskKind> }) {
  const taskMeta = getAccountTaskMeta(taskMap, accountId)
  return (
    <span className={`inline-flex rounded-full border px-2 py-[3px] text-[11px] leading-none ${taskMeta.tone}`}>
      {taskMeta.label}
    </span>
  )
}

function matchesPremiumFilter(account: AccountRecord, premiumFilter: PremiumFilter) {
  if (premiumFilter === 'premium') return Boolean(account.profile?.is_premium)
  if (premiumFilter === 'non-premium') return !account.profile?.is_premium
  return true
}

function readNickname(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return fullName || '-'
}

function normalizeAvatarSrc(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file://')) {
    return trimmed
  }
  if (/^[A-Za-z]:\\/.test(trimmed)) {
    return `file:///${trimmed.replace(/\\/g, '/')}`
  }
  return trimmed
}

function readAvatarSrc(account: AccountRecord) {
  return normalizeAvatarSrc(account.profile?.avatar)
}

function readAvatarFallback(account: AccountRecord) {
  const nickname = readNickname(account)
  if (nickname && nickname !== '-') {
    return nickname.slice(0, 1).toUpperCase()
  }

  const phone = (account.phone || '').replace(/\D/g, '')
  if (phone) return phone.slice(-2)
  return 'TG'
}

function AvatarCell({ account }: { account: AccountRecord }) {
  const [failed, setFailed] = useState(false)
  const src = readAvatarSrc(account)
  const fallback = readAvatarFallback(account)
  const showImage = Boolean(src) && !failed

  return (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-900/70 ring-1 ring-white/8 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
      {showImage ? (
        <img src={src} alt={readNickname(account)} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-200">{fallback}</span>
      )}
    </div>
  )
}

function readUsername(account: AccountRecord) {
  const profileUsername = typeof account.profile?.username === 'string' ? account.profile.username.trim() : ''
  if (profileUsername) return profileUsername.startsWith('@') ? profileUsername : `@${profileUsername}`

  const username = account.username?.trim() ?? ''
  if (username && !/\s/.test(username) && /^@?[A-Za-z0-9_]+$/.test(username)) {
    return username.startsWith('@') ? username : `@${username}`
  }

  return '-'
}

function readTwoFactor(account: AccountRecord) {
  const raw = account.profile?.twoFA
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return ''
}

function hasAvatar(account: AccountRecord) {
  return Boolean(readAvatarSrc(account) || account.profile?.has_profile_pic || account.profile?.hasProfilePhoto)
}

function hasUsername(account: AccountRecord) {
  return readUsername(account) !== '-'
}

function readLastLogin(account: AccountRecord) {
  return formatDateTime(account.lastOnlineTime || account.lastCheckTime)
}

function readPremiumExpiry(account: AccountRecord) {
  const value = account.profile?.premium_expiry
    ?? account.profile?.premium_until
    ?? account.profile?.premium_until_date
    ?? account.profile?.premiumUntil
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? new Date(value).toISOString() : new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1e12 ? new Date(numeric).toISOString() : new Date(numeric * 1000).toISOString()
    }
    return trimmed
  }

  return null
}

function isPremiumAccount(account: AccountRecord) {
  return Boolean(account.profile?.is_premium)
}

function readPremiumFilterLabel(value: PremiumFilter) {
  if (value === 'premium') return '会员'
  if (value === 'non-premium') return '非会员'
  return '全部会员状态'
}

function readPresenceFilterLabel(label: string, value: PresenceFilter) {
  if (value === 'has') return `有${label}`
  if (value === 'none') return `无${label}`
  return `全部${label}`
}

function matchesPresenceFilter(hasValue: boolean, filter: PresenceFilter) {
  if (filter === 'has') return hasValue
  if (filter === 'none') return !hasValue
  return true
}

function readStatusFilterLabel(value: AccountStatusFilter) {
  switch (value) {
    case 'all':
      return '全部状态'
    case 'alive':
      return '无限制'
    case 'limited-group':
      return '双向'
    case 'timeout-group':
      return '超时/未检测'
    case 'premium':
      return '会员'
    case 'temporary_limited':
      return '临时限制'
    case 'geo_restricted':
      return '地理位置限制'
    case 'limited':
      return '限制'
    case 'frozen':
      return '冻结'
    case 'timeout':
      return '超时'
    case 'unknown':
      return '未检测'
    case 'checking':
      return '检测中'
    case 'banned':
      return '封禁'
    default:
      return value
  }
}

function readShortcutSummary(shortcut: AccountFilterShortcut) {
  const parts: string[] = []
  if (shortcut.countryFilter) parts.push(shortcut.countryFilter)
  if (shortcut.statusFilter !== 'all') parts.push(readStatusFilterLabel(shortcut.statusFilter))
  if (shortcut.proxyFilter) parts.push(shortcut.proxyFilter)
  if (shortcut.premiumFilter !== 'all') parts.push(readPremiumFilterLabel(shortcut.premiumFilter))
  if (shortcut.twoFactorFilter !== 'all') parts.push(readPresenceFilterLabel('2FA', shortcut.twoFactorFilter))
  if (shortcut.avatarFilter !== 'all') parts.push(readPresenceFilterLabel('头像', shortcut.avatarFilter))
  if (shortcut.taskFilter !== 'all') parts.push(readPresenceFilterLabel('任务', shortcut.taskFilter))
  if (shortcut.usernameFilter !== 'all') parts.push(readPresenceFilterLabel('用户名', shortcut.usernameFilter))
  if (shortcut.reauthorizeFilter === 'success') parts.push('重新授权成功')
  if (shortcut.reauthorizeFilter === 'failed') parts.push('重新授权失败')
  return parts.length > 0 ? parts.join(' + ') : '全部账号'
}

function readFreezeSince(account: AccountRecord) {
  const value = account.profile?.freeze_since_date
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null
}

function readFreezeUntil(account: AccountRecord) {
  const value = account.profile?.freeze_until_date
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null
}

function readFreezeAppealUrl(account: AccountRecord) {
  const value = account.profile?.freeze_appeal_url
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function getBulkOperationButtonClass(emphasis = false) {
  return `flex h-11 items-center gap-2 rounded-[12px] px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${emphasis ? 'bg-neon/10 text-neonSoft hover:bg-neon/14' : 'bg-panel text-textMain hover:bg-hover'}`
}

const FrozenStatusDialog = memo(function FrozenStatusDialog({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const freezeSince = formatDateTimeFull(readFreezeSince(account))
  const freezeUntil = formatDateTimeFull(readFreezeUntil(account))
  const appealUrl = readFreezeAppealUrl(account)
  const nickname = readNickname(account)
  const freezeSinceDisplay = freezeSince !== '—' ? freezeSince : '当前已判定冻结，但 Telegram 暂未返回冻结开始时间'
  const freezeUntilDisplay = freezeUntil !== '—' ? freezeUntil : '当前已判定冻结，但 Telegram 暂未返回冻结结束时间'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 pt-12 pb-6" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-[18px] border border-sky-400/20 bg-card shadow-[0_16px_48px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-sky-300">冻结详情</div>
            <div className="mt-1 text-xs text-textMuted">点击状态栏“冻结”可查看该账号的具体冻结时间</div>
          </div>
          <button type="button" className="rounded-[8px] px-2 py-1 text-sm text-textMuted transition hover:bg-white/5 hover:text-white" onClick={onClose}>关闭</button>
        </div>

        <div className="space-y-3 px-5 py-5 text-sm text-textMain">
          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">账号</div>
            <div className="mt-1 font-medium text-white">{account.phone || '—'}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-panel px-4 py-3">
              <div className="text-xs text-textMuted">昵称</div>
              <div className="mt-1 font-medium text-white">{nickname}</div>
            </div>
            <div className="rounded-[12px] bg-panel px-4 py-3">
              <div className="text-xs text-textMuted">状态</div>
              <div className="mt-1 font-medium text-sky-300">冻结</div>
            </div>
          </div>

          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">冻结开始时间</div>
            <div className="mt-1 font-medium text-white">{freezeSinceDisplay}</div>
          </div>

          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">冻结结束时间</div>
            <div className="mt-1 font-medium text-white">{freezeUntilDisplay}</div>
          </div>

          {appealUrl ? (
            <div className="rounded-[12px] bg-panel px-4 py-3">
              <div className="text-xs text-textMuted">申诉地址</div>
              <div className="mt-1 break-all font-medium text-sky-300">{appealUrl}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})

const PremiumStatusDialog = memo(function PremiumStatusDialog({ account, premiumExpiryOverride, onClose }: { account: AccountRecord; premiumExpiryOverride?: string | null; onClose: () => void }) {
  const nickname = readNickname(account)
  const premiumExpiryRaw = premiumExpiryOverride ?? readPremiumExpiry(account)
  const premiumExpiry = formatDateTimeFull(premiumExpiryRaw)
  const premiumExpiryDisplay = premiumExpiry !== '—' ? premiumExpiry : '暂未读取到会员到期时间'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 pt-12 pb-6" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-[18px] border border-fuchsia-400/20 bg-card shadow-[0_16px_48px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-fuchsia-300">会员详情</div>
          </div>
          <button type="button" className="rounded-[8px] px-2 py-1 text-sm text-textMuted transition hover:bg-white/5 hover:text-white" onClick={onClose}>关闭</button>
        </div>

        <div className="space-y-3 px-5 py-5 text-sm text-textMain">
          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">账号</div>
            <div className="mt-1 font-medium text-white">{account.phone || '—'}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-panel px-4 py-3">
              <div className="text-xs text-textMuted">昵称</div>
              <div className="mt-1 font-medium text-white">{nickname}</div>
            </div>
            <div className="rounded-[12px] bg-panel px-4 py-3">
              <div className="text-xs text-textMuted">会员状态</div>
              <div className="mt-1 font-medium text-fuchsia-300">高级会员</div>
            </div>
          </div>

          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">到期时间</div>
            <div className="mt-1 font-medium text-white">{premiumExpiryDisplay}</div>
          </div>

        </div>
      </div>
    </div>
  )
})

const SkeletonRow = memo(function SkeletonRow({ columns }: { columns: number }) {
  return (
    <div className="grid min-h-[52px] shrink-0 items-center gap-0 rounded-[10px] bg-panel" style={ACCOUNT_GRID_STYLE}>
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="px-3 py-2.5">
          <div className="h-7 animate-pulse rounded-[8px] bg-white/[0.03]" />
        </div>
      ))}
    </div>
  )
})

const TableRowActions = memo(function TableRowActions({ account, onOpenPremium }: { account: AccountRecord; onOpenPremium: (account: AccountRecord) => void | Promise<void> }) {
  const username = readUsername(account)
  const twoFactor = readTwoFactor(account)
  const lastLogin = readLastLogin(account)
  const premium = isPremiumAccount(account)
  const [openingWeb, setOpeningWeb] = useState(false)

  const handleOpenTelegramWeb = useCallback(async () => {
    if (openingWeb) return
    setOpeningWeb(true)
    try {
      await window.desktopAccounts?.openTelegramWeb(account.id)
    } finally {
      setOpeningWeb(false)
    }
  }, [account.id, openingWeb])

  return (
    <div className="flex w-full items-center justify-center gap-1 whitespace-nowrap">
      <span title={`用户名：${username}`} className={actionButtonClass(username !== '-')}>@</span>
      <span title={twoFactor ? `2FA：${twoFactor}` : '2FA：未设置'} className={actionButtonClass(Boolean(twoFactor))}>
        <LockKeyhole size={12} strokeWidth={1.9} />
      </span>
      <span title={`最后登录：${lastLogin}`} className={actionButtonClass(lastLogin !== '—')}>
        <CircleAlert size={12} strokeWidth={1.9} />
      </span>
      {premium ? (
        <button
          type="button"
          title="查看会员详情"
          onClick={() => void onOpenPremium(account)}
          className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[7px] border border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-300 transition hover:brightness-110"
        >
          <Star size={12} className="fill-current" />
        </button>
      ) : null}
      <button
        type="button"
        title={openingWeb ? '正在打开 Telegram 网页版…' : '打开 Telegram 网页版'}
        onClick={() => void handleOpenTelegramWeb()}
        disabled={openingWeb}
        className={`flex h-6 min-w-[48px] shrink-0 items-center justify-center gap-1 rounded-[7px] border px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] transition ${openingWeb
          ? 'cursor-wait border-sky-400/20 bg-sky-400/10 text-sky-300'
          : 'border-white/10 bg-panel text-slate-200 hover:bg-hover hover:text-neonSoft'}`}
      >
        {openingWeb ? <Loader2 size={12} className="animate-spin" /> : null}
        <span>{openingWeb ? '打开中' : 'web'}</span>
      </button>
    </div>
  )
})

export const AccountTable = memo(function AccountTable() {
  const accounts = useAccountStore((state) => state.accounts)
  const search = useAccountStore((state) => state.search)
  const loading = useAccountStore((state) => state.loading)
  const busy = useAccountStore((state) => state.busy)
  const statusFilter = useAccountStore((state) => state.statusFilter)
  const countryFilter = useAccountStore((state) => state.countryFilter)
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const setSearch = useAccountStore((state) => state.setSearch)
  const setStatusFilter = useAccountStore((state) => state.setStatusFilter)
  const setCountryFilter = useAccountStore((state) => state.setCountryFilter)
  const setSelectedIds = useAccountStore((state) => state.setSelectedIds)
  const refresh = useAccountStore((state) => state.refresh)
  const importFiles = useAccountStore((state) => state.importFiles)
  const importFolder = useAccountStore((state) => state.importFolder)
  const importProgress = useAccountStore((state) => state.importProgress)
  const importResultOpen = useAccountStore((state) => state.importResultDialog.open)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)
  const exportSelected = useAccountStore((state) => state.exportSelected)
  const deleteSelected = useAccountStore((state) => state.deleteSelected)
  const deleteAll = useAccountStore((state) => state.deleteAll)
  const deleteByStatusGroup = useAccountStore((state) => state.deleteByStatusGroup)
  const startCheckByIds = useAccountStore((state) => state.startCheckByIds)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const setActiveModule = useUIStore((state) => state.setActiveModule)
  const setLogsContext = useUIStore((state) => state.setLogsContext)
  const accountTaskStatusMap = useAccountTaskStatusMap()
  const globalProxyEnabled = useProxyPoolStore((state) => state.state.settings.enabled)

  const [sourceFilter, setSourceFilter] = useState('')
  const [proxyFilter, setProxyFilter] = useState('')
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>('all')
  const [twoFactorFilter, setTwoFactorFilter] = useState<PresenceFilter>('all')
  const [avatarFilter, setAvatarFilter] = useState<PresenceFilter>('all')
  const [taskFilter, setTaskFilter] = useState<PresenceFilter>('all')
  const [usernameFilter, setUsernameFilter] = useState<PresenceFilter>('all')
  const [reauthorizeFilter, setReauthorizeFilter] = useState<AccountListReauthorizeFilter>('all')
  const [savedShortcuts, setSavedShortcuts] = useState<AccountFilterShortcut[]>(loadAccountFilterShortcuts)
  const [activeShortcutId, setActiveShortcutId] = useState<string | null>(null)
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false)
  const [shortcutName, setShortcutName] = useState('')
  const [shortcutCountryFilter, setShortcutCountryFilter] = useState('')
  const [shortcutStatusFilter, setShortcutStatusFilter] = useState<AccountStatusFilter>('all')
  const [shortcutProxyFilter, setShortcutProxyFilter] = useState('')
  const [shortcutPremiumFilter, setShortcutPremiumFilter] = useState<PremiumFilter>('all')
  const [shortcutTwoFactorFilter, setShortcutTwoFactorFilter] = useState<PresenceFilter>('all')
  const [shortcutAvatarFilter, setShortcutAvatarFilter] = useState<PresenceFilter>('all')
  const [shortcutTaskFilter, setShortcutTaskFilter] = useState<PresenceFilter>('all')
  const [shortcutUsernameFilter, setShortcutUsernameFilter] = useState<PresenceFilter>('all')
  const [shortcutReauthorizeFilter, setShortcutReauthorizeFilter] = useState<AccountListReauthorizeFilter>('all')
  const [sorting, setSorting] = useState(createDefaultSorting)
  const [pagination, setPagination] = useState(createDefaultPagination)
  const [tableLoading, setTableLoading] = useState(true)
  const [serverPage, setServerPage] = useState<AccountListPageResult>(createEmptyAccountPage)
  const [serverPageLoading, setServerPageLoading] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [frozenDialogAccount, setFrozenDialogAccount] = useState<AccountRecord | null>(null)
  const [premiumDialogAccount, setPremiumDialogAccount] = useState<PremiumDialogState | null>(null)
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkSubmenu, setBulkSubmenu] = useState<BulkOperationSubmenu>(null)
  const [bulkActionHint, setBulkActionHint] = useState('')
  const [bulkMenuLayout, setBulkMenuLayout] = useState({ left: 16, width: 320 })
  const [twoFactorDialog, setTwoFactorDialog] = useState<TwoFactorDialogState | null>(null)
  const [profileDialog, setProfileDialog] = useState<ProfileDialogState | null>(null)
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false)
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const tableCardRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollbarRef = useRef<HTMLDivElement | null>(null)
  const bulkMenuRef = useRef<HTMLDivElement | null>(null)
  const serverPageRequestRef = useRef(0)

  const canUseServerPage = !sourceFilter
    && taskFilter === 'all'

  const baseData = useMemo(
    () => filterAccounts(accounts, { search: deferredSearch, statusFilter: 'all', countryFilter, reauthorizeFilter: 'all' }),
    [accounts, deferredSearch, countryFilter]
  )
  const summaryScopedData = useMemo(
    () =>
      baseData.filter((account) => {
        if (sourceFilter && account.profileSource !== sourceFilter) return false
        if (proxyFilter && readProxy(account) !== proxyFilter) return false
        if (!matchesPresenceFilter(Boolean(readTwoFactor(account)), twoFactorFilter)) return false
        if (!matchesPresenceFilter(hasAvatar(account), avatarFilter)) return false
        if (!matchesPresenceFilter(getAccountTaskMeta(accountTaskStatusMap, account.id).occupied, taskFilter)) return false
        if (!matchesPresenceFilter(hasUsername(account), usernameFilter)) return false
        return true
      }),
    [accountTaskStatusMap, avatarFilter, baseData, proxyFilter, sourceFilter, taskFilter, twoFactorFilter, usernameFilter]
  )
  const scopedData = useMemo(
    () => summaryScopedData.filter((account) => matchesPremiumFilter(account, premiumFilter)),
    [premiumFilter, summaryScopedData]
  )
  const data = useMemo(
    () => filterAccounts(scopedData, { search: '', statusFilter, countryFilter: '', reauthorizeFilter }),
    [reauthorizeFilter, scopedData, statusFilter]
  )

  useEffect(() => {
    if (!canUseServerPage || !window.desktopAccounts?.listPage) {
      setServerPage(createEmptyAccountPage())
      setServerPageLoading(false)
      return
    }

    const requestId = serverPageRequestRef.current + 1
    serverPageRequestRef.current = requestId
    setServerPageLoading(true)

    void window.desktopAccounts.listPage({
      search: deferredSearch,
      statusFilter,
      countryFilter,
      sourceFilter,
      proxyFilter,
      premiumFilter,
      twoFactorFilter,
      avatarFilter,
      usernameFilter,
      reauthorizeFilter,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize
    }).then((result) => {
      if (serverPageRequestRef.current !== requestId) return
      setServerPage(result)
    }).catch(() => {
      if (serverPageRequestRef.current !== requestId) return
      setServerPage(createEmptyAccountPage())
    }).finally(() => {
      if (serverPageRequestRef.current === requestId) {
        setServerPageLoading(false)
      }
    })
  }, [avatarFilter, canUseServerPage, countryFilter, deferredSearch, pagination.pageIndex, pagination.pageSize, premiumFilter, proxyFilter, reauthorizeFilter, sourceFilter, statusFilter, twoFactorFilter, usernameFilter])

  const tableData = canUseServerPage ? serverPage.accounts : data
  const visibleTotalCount = canUseServerPage ? serverPage.total : data.length

  useEffect(() => {
    if (!canUseServerPage) return
    if (visibleTotalCount <= 0) return

    const maxPageIndex = Math.max(0, Math.ceil(visibleTotalCount / Math.max(1, pagination.pageSize)) - 1)
    if (pagination.pageIndex <= maxPageIndex) return

    setPagination((previous) => ({
      ...previous,
      pageIndex: maxPageIndex
    }))
  }, [canUseServerPage, pagination.pageIndex, pagination.pageSize, visibleTotalCount])

  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }, [avatarFilter, countryFilter, deferredSearch, premiumFilter, proxyFilter, reauthorizeFilter, sourceFilter, statusFilter, taskFilter, twoFactorFilter, usernameFilter])

  useEffect(() => {
    saveAccountFilterShortcuts(savedShortcuts)
  }, [savedShortcuts])

  useEffect(() => {
    if (!activeShortcutId) return
    const activeShortcut = savedShortcuts.find((item) => item.id === activeShortcutId)
    if (!activeShortcut) {
      setActiveShortcutId(null)
      return
    }

    const matched = activeShortcut.countryFilter === countryFilter
      && activeShortcut.statusFilter === statusFilter
      && activeShortcut.proxyFilter === proxyFilter
      && activeShortcut.premiumFilter === premiumFilter
      && activeShortcut.twoFactorFilter === twoFactorFilter
      && activeShortcut.avatarFilter === avatarFilter
      && activeShortcut.taskFilter === taskFilter
      && activeShortcut.usernameFilter === usernameFilter
      && activeShortcut.reauthorizeFilter === reauthorizeFilter

    if (!matched) {
      setActiveShortcutId(null)
    }
  }, [activeShortcutId, avatarFilter, countryFilter, premiumFilter, proxyFilter, reauthorizeFilter, savedShortcuts, statusFilter, taskFilter, twoFactorFilter, usernameFilter])

  useEffect(() => {
    setTableLoading(true)
    const timer = window.setTimeout(() => setTableLoading(false), 160)
    return () => window.clearTimeout(timer)
  }, [canUseServerPage, loading, pagination.pageIndex, pagination.pageSize, serverPageLoading, sorting, tableData])

  useEffect(() => {
    if (scrollbarRef.current) {
      scrollbarRef.current.scrollLeft = scrollLeft
    }
  }, [scrollLeft])

  useEffect(() => {
    const nextSelectedIds = selectedIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied)
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedIds(nextSelectedIds)
    }
  }, [accountTaskStatusMap, selectedIds, setSelectedIds])

  useEffect(() => {
    if (!copiedPhone) return
    const timer = window.setTimeout(() => setCopiedPhone(null), 1200)
    return () => window.clearTimeout(timer)
  }, [copiedPhone])

  useEffect(() => {
    if (!bulkActionHint) return
    const timer = window.setTimeout(() => setBulkActionHint(''), 1800)
    return () => window.clearTimeout(timer)
  }, [bulkActionHint])

  const syncBulkMenuLayout = useCallback(() => {
    const tableCard = tableCardRef.current
    if (!tableCard) return

    const rect = tableCard.getBoundingClientRect()
    const nextLeft = Math.max(rect.left, 16)
    const nextWidth = Math.max(Math.min(rect.width, window.innerWidth - nextLeft - 16), 320)

    setBulkMenuLayout((previous) => {
      if (Math.abs(previous.left - nextLeft) < 0.5 && Math.abs(previous.width - nextWidth) < 0.5) {
        return previous
      }

      return { left: nextLeft, width: nextWidth }
    })
  }, [])

  useEffect(() => {
    if (selectedIds.length === 0) return

    syncBulkMenuLayout()

    const tableCard = tableCardRef.current
    const handleWindowResize = () => syncBulkMenuLayout()
    const resizeObserver = typeof ResizeObserver !== 'undefined' && tableCard
      ? new ResizeObserver(() => syncBulkMenuLayout())
      : null

    if (tableCard && resizeObserver) {
      resizeObserver.observe(tableCard)
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [selectedIds.length, syncBulkMenuLayout])

  const handlePhoneCopy = useCallback(async (phone: string) => {
    const normalizedPhone = phone.trim()
    if (!normalizedPhone) return
    const copied = await copyText(normalizedPhone)
    if (copied) {
      setCopiedPhone(normalizedPhone)
    }
  }, [])

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const handleToggleSingleSelection = useCallback((accountId: number, checked: boolean) => {
    if (!Number.isFinite(accountId)) return
    if (checked) {
      if (selectedIdSet.has(accountId)) return
      setSelectedIds([...selectedIds, accountId])
      return
    }

    if (!selectedIdSet.has(accountId)) return
    setSelectedIds(selectedIds.filter((id) => id !== accountId))
  }, [selectedIdSet, selectedIds, setSelectedIds])

  const handleTogglePageSelection = useCallback((pageAccountIds: number[], checked: boolean) => {
    const normalizedIds = Array.from(new Set(pageAccountIds.filter((id) => Number.isFinite(id))))
    if (normalizedIds.length === 0) return

    if (checked) {
      const nextIds = [...selectedIds]
      const seen = new Set(nextIds)
      for (const accountId of normalizedIds) {
        if (seen.has(accountId)) continue
        seen.add(accountId)
        nextIds.push(accountId)
      }
      setSelectedIds(nextIds)
      return
    }

    const removable = new Set(normalizedIds)
    setSelectedIds(selectedIds.filter((id) => !removable.has(id)))
  }, [selectedIds, setSelectedIds])

  const columns = useMemo<ColumnDef<AccountRecord>[]>(
    () => [
      {
        id: 'select',
        size: 60,
        header: ({ table }) => (
          <div className={cellShellClass('select', true)}>
            <input
              type="checkbox"
              title="全选当前页"
              className={checkboxClass()}
              checked={(() => {
                const pageIds = (canUseServerPage ? table.getRowModel().rows : table.getPaginationRowModel().rows)
                  .filter((pageRow) => !getAccountTaskMeta(accountTaskStatusMap, pageRow.original.id).occupied)
                  .map((pageRow) => pageRow.original.id)
                return pageIds.length > 0 && pageIds.every((id) => selectedIdSet.has(id))
              })()}
              ref={(input) => {
                if (!input) return
                const pageIds = (canUseServerPage ? table.getRowModel().rows : table.getPaginationRowModel().rows)
                  .filter((pageRow) => !getAccountTaskMeta(accountTaskStatusMap, pageRow.original.id).occupied)
                  .map((pageRow) => pageRow.original.id)
                const selectedCountOnPage = pageIds.filter((id) => selectedIdSet.has(id)).length
                input.indeterminate = selectedCountOnPage > 0 && selectedCountOnPage < pageIds.length
              }}
              onChange={(event) => {
                const pageIds = (canUseServerPage ? table.getRowModel().rows : table.getPaginationRowModel().rows)
                  .filter((pageRow) => !getAccountTaskMeta(accountTaskStatusMap, pageRow.original.id).occupied)
                  .map((pageRow) => pageRow.original.id)
                handleTogglePageSelection(pageIds, event.currentTarget.checked)
              }}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className={cellShellClass('select')}>
            <input
              type="checkbox"
              title="选择当前行"
              className={checkboxClass()}
              checked={selectedIdSet.has(row.original.id)}
              disabled={getAccountTaskMeta(accountTaskStatusMap, row.original.id).occupied}
              onChange={(event) => handleToggleSingleSelection(row.original.id, event.currentTarget.checked)}
            />
          </div>
        ),
        enableSorting: false
      },
      {
        id: 'index',
        header: '序号',
        size: 52,
        cell: ({ row, table }) => {
          const pageIndex = table.getState().pagination.pageIndex
          const pageSize = table.getState().pagination.pageSize
          const order = pageIndex * pageSize + row.index + 1
          return <div className="w-full text-center font-medium text-slate-300">{order}</div>
        }
      },
      {
        accessorKey: 'phone',
        header: '手机号',
        size: 144,
        cell: ({ row }) => {
          const value = row.original.phone || '—'
          const copied = copiedPhone === value
          return (
            <button
              type="button"
              title={copied ? '已复制' : '点击复制手机号'}
              onClick={() => void handlePhoneCopy(value)}
              className={cellTextClass(`cursor-copy text-left transition ${copied ? 'text-sky-300' : 'hover:text-sky-300'}`)}
            >
              {value}
            </button>
          )
        }
      },
      {
        accessorKey: 'country',
        header: '国家',
        size: 88,
        cell: ({ row }) => <CountryCell country={row.original.country} phone={row.original.phone} />
      },
      {
        accessorKey: 'status',
        header: '状态',
        size: 98,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            errorMessage={typeof row.original.profile?.check_error === 'string' ? row.original.profile.check_error : null}
            checkMode={row.original.profile?.check_mode === 'account-survival' ? 'account-survival' : row.original.profile?.check_mode === 'account-status' ? 'account-status' : null}
            onClick={row.original.status === 'frozen' ? () => setFrozenDialogAccount(row.original) : undefined}
          />
        )
      },
      {
        id: 'avatar',
        header: '头像',
        size: 72,
        enableSorting: false,
        cell: ({ row }) => <AvatarCell account={row.original} />
      },
      {
        id: 'nickname',
        header: '昵称',
        size: 128,
        cell: ({ row }) => {
          const value = readNickname(row.original)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'task',
        header: '任务',
        size: 76,
        enableSorting: false,
        cell: ({ row }) => <TaskBadge accountId={row.original.id} taskMap={accountTaskStatusMap} />
      },
      {
        id: 'proxy',
        header: '网络',
        size: 88,
        cell: ({ row }) => {
          const value = readProxy(row.original)
          return <div className={cellTextClass()} title={value}>{value}</div>
        }
      },
      {
        id: 'actions',
        header: '操作',
        size: 144,
        enableSorting: false,
          cell: ({ row }) => <TableRowActions account={row.original} onOpenPremium={handleOpenPremiumDialog} />
        }
    ],
    [accountTaskStatusMap, copiedPhone, handlePhoneCopy, handleTogglePageSelection, handleToggleSingleSelection, selectedIdSet, setFrozenDialogAccount]
  )

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: canUseServerPage ? undefined : getPaginationRowModel(),
    manualPagination: canUseServerPage,
    pageCount: canUseServerPage ? Math.max(1, Math.ceil(serverPage.total / Math.max(1, pagination.pageSize))) : undefined,
    getRowId: (row) => String(row.id)
  })

  const rows = canUseServerPage ? table.getRowModel().rows : table.getPaginationRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 52,
    overscan: 4,
    paddingStart: 0
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const accountUiMeta = useMemo(() => {
    const countries = new Set<string>()
    const proxies = new Set<string>()
    const statusSamples = new Map<AccountStatus, AccountRecord>()
    let hasPremiumAccounts = false
    const deletePresetCounts = {
      flagged: 0,
      banned: 0,
      frozen: 0,
      multiIp: 0
    }

    for (const account of accounts) {
      const countryDisplay = formatCountryDisplay(account.country, account.phone)
      if (countryDisplay) countries.add(countryDisplay)

      const proxyDisplay = readProxy(account)
      if (proxyDisplay) proxies.add(proxyDisplay)

      if (!statusSamples.has(account.status)) {
        statusSamples.set(account.status, account)
      }

      if (account.profile?.is_premium) {
        hasPremiumAccounts = true
      }

      if (account.status === 'banned') deletePresetCounts.banned += 1
      if (account.status === 'frozen') deletePresetCounts.frozen += 1
      if (account.status === 'multi_ip') deletePresetCounts.multiIp += 1
      if (account.status === 'banned' || account.status === 'frozen' || account.status === 'multi_ip' || account.status === 'session_expired' || account.status === 'not_logged_in') {
        deletePresetCounts.flagged += 1
      }
    }

    return {
      countries: Array.from(countries),
      proxies: Array.from(proxies),
      statusSamples,
      hasPremiumAccounts,
      deletePresetCounts
    }
  }, [accounts])

  const countries = useMemo(
    () => accountUiMeta.countries.map((value) => ({ label: value, value })),
    [accountUiMeta.countries]
  )
  const statuses = useMemo(
    () => {
      const options: Array<{ label: string; value: AccountStatusFilter }> = Array.from(accountUiMeta.statusSamples.entries()).map(([value, sampleAccount]) => {
        const checkMode = sampleAccount?.profile?.check_mode === 'account-survival'
          ? 'account-survival'
          : sampleAccount?.profile?.check_mode === 'account-status'
            ? 'account-status'
            : null

        return {
          label: formatAccountStatus(
            value,
            typeof sampleAccount?.profile?.check_error === 'string' ? sampleAccount.profile.check_error : null,
            checkMode
          ),
          value
        }
      })

      options.unshift(
        { label: '超时/未检测', value: 'timeout-group' as AccountStatusFilter },
        { label: '双向', value: 'limited-group' as AccountStatusFilter }
      )

      if (accountUiMeta.hasPremiumAccounts) {
        options.unshift({ label: '会员', value: 'premium' as AccountStatusFilter })
      }

      return options
    },
    [accountUiMeta.hasPremiumAccounts, accountUiMeta.statusSamples]
  )
  const sources = useMemo(
    () => [
      { label: 'JSON 导入', value: 'json_import' },
      { label: '登录检查', value: 'login_check' }
    ],
    []
  )
  const proxies = useMemo(
    () => accountUiMeta.proxies.map((value) => ({ label: value, value })),
    [accountUiMeta.proxies]
  )
  const presenceOptions = useMemo(
    () => [
      { label: '有', value: 'has' },
      { label: '无', value: 'none' }
    ],
    []
  )
  const reauthorizeOptions = useMemo(
    () => [
      { label: '成功', value: 'success' },
      { label: '失败', value: 'failed' }
    ],
    []
  )

  const selectedCount = selectedIds.length
  const totalCount = visibleTotalCount
  const deletePresetCounts = accountUiMeta.deletePresetCounts
  const summaryCards = useMemo(() => {
    let aliveCount = 0
    let limitedCount = 0
    let frozenCount = 0
    let bannedCount = 0
    let timeoutCount = 0

    for (const account of summaryScopedData) {
      if (account.status === 'alive' || account.status === 'geo_restricted') {
        aliveCount += 1
        continue
      }
      if (account.status === 'limited' || account.status === 'temporary_limited') {
        limitedCount += 1
        continue
      }
      if (account.status === 'frozen') {
        frozenCount += 1
        continue
      }
      if (account.status === 'banned') {
        bannedCount += 1
        continue
      }
      if (account.status === 'timeout' || account.status === 'unknown' || account.status === 'checking') {
        timeoutCount += 1
      }
    }

    return [
      { key: 'all' as AccountStatusFilter, label: '总数量', count: summaryScopedData.length },
      { key: 'alive' as AccountStatusFilter, label: '无限制', count: aliveCount },
      { key: 'limited-group' as AccountStatusFilter, label: '双向', count: limitedCount },
      { key: 'frozen' as AccountStatusFilter, label: '冻结', count: frozenCount },
      { key: 'banned' as AccountStatusFilter, label: '封禁', count: bannedCount },
      { key: 'timeout-group' as AccountStatusFilter, label: '超时/未检测', count: timeoutCount }
    ]
  }, [summaryScopedData])

  const shortcutCards = useMemo(() => {
    if (accounts.length >= LARGE_ACCOUNT_UI_THRESHOLD) {
      return savedShortcuts.map((shortcut) => ({
        ...shortcut,
        count: '—',
        summary: `${readShortcutSummary(shortcut)}（账号过多，已暂停实时计数）`
      }))
    }

    return savedShortcuts.map((shortcut) => {
      let count = 0

      for (const account of accounts) {
        if (shortcut.countryFilter && formatCountryDisplay(account.country, account.phone) !== shortcut.countryFilter) continue
        if (shortcut.statusFilter !== 'all') {
          if (shortcut.statusFilter === 'premium') {
            if (!isPremiumAccount(account)) continue
          } else if (shortcut.statusFilter === 'alive') {
            if (account.status !== 'alive' && account.status !== 'geo_restricted') continue
          } else if (shortcut.statusFilter === 'limited-group') {
            if (account.status !== 'limited' && account.status !== 'temporary_limited') continue
          } else if (shortcut.statusFilter === 'timeout-group') {
            if (account.status !== 'timeout' && account.status !== 'unknown' && account.status !== 'checking') continue
          } else if (account.status !== shortcut.statusFilter) {
            continue
          }
        }
        if (shortcut.proxyFilter && readProxy(account) !== shortcut.proxyFilter) continue
        if (!matchesPremiumFilter(account, shortcut.premiumFilter)) continue
        if (!matchesPresenceFilter(Boolean(readTwoFactor(account)), shortcut.twoFactorFilter)) continue
        if (!matchesPresenceFilter(hasAvatar(account), shortcut.avatarFilter)) continue
        if (!matchesPresenceFilter(getAccountTaskMeta(accountTaskStatusMap, account.id).occupied, shortcut.taskFilter)) continue
        if (!matchesPresenceFilter(hasUsername(account), shortcut.usernameFilter)) continue
        count += 1
      }

      return {
        ...shortcut,
        count,
        summary: readShortcutSummary(shortcut)
      }
    })
  }, [accountTaskStatusMap, accounts, savedShortcuts])

  useEffect(() => {
    if (selectedCount > 0) return
    setBulkMenuOpen(false)
    setBulkSubmenu(null)
    setBulkActionHint('')
  }, [selectedCount])

  useEffect(() => {
    if (!bulkMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (bulkMenuRef.current?.contains(target)) return
      setBulkMenuOpen(false)
      setBulkSubmenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [bulkMenuOpen])

  const readOrderedIds = useCallback(async () => {
    if (canUseServerPage && window.desktopAccounts?.listIds) {
      return window.desktopAccounts.listIds({
        search: deferredSearch,
        statusFilter,
        countryFilter,
        sourceFilter,
        proxyFilter,
        premiumFilter,
        twoFactorFilter,
        avatarFilter,
        usernameFilter,
        reauthorizeFilter
      })
    }

    return table.getSortedRowModel().rows.map((row) => row.original.id)
  }, [avatarFilter, canUseServerPage, countryFilter, deferredSearch, premiumFilter, proxyFilter, reauthorizeFilter, sourceFilter, statusFilter, table, twoFactorFilter, usernameFilter])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [setSearch])

  const handleOpenShortcutDialog = useCallback(() => {
    setShortcutName('')
    setShortcutCountryFilter(countryFilter)
    setShortcutStatusFilter(statusFilter)
    setShortcutProxyFilter(proxyFilter)
    setShortcutPremiumFilter(premiumFilter)
    setShortcutTwoFactorFilter(twoFactorFilter)
    setShortcutAvatarFilter(avatarFilter)
    setShortcutTaskFilter(taskFilter)
    setShortcutUsernameFilter(usernameFilter)
    setShortcutReauthorizeFilter(reauthorizeFilter)
    setShortcutDialogOpen(true)
  }, [avatarFilter, countryFilter, premiumFilter, proxyFilter, reauthorizeFilter, statusFilter, taskFilter, twoFactorFilter, usernameFilter])

  const handleSaveShortcut = useCallback(() => {
    const name = shortcutName.trim()
    if (!name) {
      setBulkActionHint('先给这个筛选起个名字。')
      return
    }

    const nextShortcut: AccountFilterShortcut = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      countryFilter: shortcutCountryFilter,
      statusFilter: shortcutStatusFilter,
      proxyFilter: shortcutProxyFilter,
      premiumFilter: shortcutPremiumFilter,
      twoFactorFilter: shortcutTwoFactorFilter,
      avatarFilter: shortcutAvatarFilter,
      taskFilter: shortcutTaskFilter,
      usernameFilter: shortcutUsernameFilter,
      reauthorizeFilter: shortcutReauthorizeFilter
    }

    setSavedShortcuts((previous) => [...previous, nextShortcut])
    setActiveShortcutId(nextShortcut.id)
    setSearch('')
    setCountryFilter(nextShortcut.countryFilter)
    setStatusFilter(nextShortcut.statusFilter)
    setProxyFilter(nextShortcut.proxyFilter)
    setPremiumFilter(nextShortcut.premiumFilter)
    setTwoFactorFilter(nextShortcut.twoFactorFilter)
    setAvatarFilter(nextShortcut.avatarFilter)
    setTaskFilter(nextShortcut.taskFilter)
    setUsernameFilter(nextShortcut.usernameFilter)
    setReauthorizeFilter(nextShortcut.reauthorizeFilter)
    setShortcutDialogOpen(false)
    setBulkActionHint(`已把“${name}”固定到顶部。`)
  }, [setCountryFilter, setSearch, setStatusFilter, shortcutAvatarFilter, shortcutCountryFilter, shortcutName, shortcutPremiumFilter, shortcutProxyFilter, shortcutReauthorizeFilter, shortcutStatusFilter, shortcutTaskFilter, shortcutTwoFactorFilter, shortcutUsernameFilter])

  const handleApplyShortcut = useCallback((shortcut: AccountFilterShortcut) => {
    setActiveShortcutId(shortcut.id)
    setSearch('')
    setCountryFilter(shortcut.countryFilter)
    setStatusFilter(shortcut.statusFilter)
    setProxyFilter(shortcut.proxyFilter)
    setPremiumFilter(shortcut.premiumFilter)
    setTwoFactorFilter(shortcut.twoFactorFilter)
    setAvatarFilter(shortcut.avatarFilter)
    setTaskFilter(shortcut.taskFilter)
    setUsernameFilter(shortcut.usernameFilter)
    setReauthorizeFilter(shortcut.reauthorizeFilter)
    setPagination(createDefaultPagination())
    setSelectedIds([])
  }, [setCountryFilter, setSearch, setSelectedIds, setStatusFilter])

  const handleRemoveShortcut = useCallback((shortcutId: string) => {
    setSavedShortcuts((previous) => previous.filter((item) => item.id !== shortcutId))
    setActiveShortcutId((current) => current === shortcutId ? null : current)
  }, [])

  const handleMoveShortcut = useCallback((shortcutId: string, direction: 'left' | 'right') => {
    setSavedShortcuts((previous) => {
      const index = previous.findIndex((item) => item.id === shortcutId)
      if (index < 0) return previous

      const targetIndex = direction === 'left' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= previous.length) return previous

      const next = [...previous]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(async () => {
    setSelectedIds(await readOrderedIds())
  }, [readOrderedIds, setSelectedIds])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  const handleSelectRange = useCallback(async (start: number, end: number) => {
    const normalizedStart = Math.max(1, Math.min(start, end))
    const normalizedEnd = Math.max(start, end)
    const ids = (await readOrderedIds()).slice(normalizedStart - 1, normalizedEnd)
    setSelectedIds(ids)
  }, [readOrderedIds, setSelectedIds])

  const handleStartCheck = useCallback((actions: CheckAction[]) => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      setBulkActionHint('请先选择要处理的账号。')
      return
    }

    flushSync(() => {
      setSelectedIds([])
      setBulkMenuOpen(false)
      setBulkSubmenu(null)
      setLogsContext('accounts')
      setActiveModule('logs')
    })

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void startCheckByIds(ids, actions)
      })
    })
  }, [selectedIds, setActiveModule, setLogsContext, setSelectedIds, startCheckByIds])

  const handleBulkCheckAction = useCallback((action: 'account-status' | 'account-survival') => {
    handleStartCheck([action])
    setBulkMenuOpen(false)
    setBulkSubmenu(null)
  }, [handleStartCheck])

  const handleOpenTwoFactorDialog = useCallback((action: TwoFactorAction) => {
    if (selectedIds.length === 0) {
      setBulkActionHint('请先选择要处理的账号。')
      return
    }

    setTwoFactorDialog({ action, accountIds: selectedIds })
    setBulkMenuOpen(false)
    setBulkSubmenu(null)
    setBulkActionHint('')
  }, [selectedIds])

  const handleSubmitTwoFactor = useCallback(async (payload: TwoFactorOperationPayload) => {
    if (!window.desktopAccounts?.manageTwoFactor) {
      setBulkActionHint('当前环境没有注入 2FA 能力。')
      return
    }

    setTwoFactorSubmitting(true)
    setTwoFactorDialog(null)
    setLogsContext('accounts-two-factor')
    setActiveModule('logs')

    try {
      await window.desktopAccounts.manageTwoFactor(payload)
    } catch (error) {
      setBulkActionHint(error instanceof Error ? error.message : '2FA 操作失败，请稍后再试。')
    } finally {
      setTwoFactorSubmitting(false)
    }
  }, [setActiveModule, setLogsContext])

  const handleSubmitProfileOperation = useCallback(async (payload: ProfileOperationPayload) => {
    if (!window.desktopAccounts?.manageProfileOperation) {
      setBulkActionHint('当前环境没有注入个人资料能力。')
      return
    }

    setProfileSubmitting(true)
    setProfileDialog(null)
    setLogsContext('accounts-profile')
    setActiveModule('logs')

    try {
      await window.desktopAccounts.manageProfileOperation(payload)
    } catch (error) {
      setBulkActionHint(error instanceof Error ? error.message : '个人资料操作失败，请稍后再试。')
    } finally {
      setProfileSubmitting(false)
    }
  }, [setActiveModule, setLogsContext])

  const handleSubmitCleanupOperation = useCallback(async (action: SessionManagerActionKind) => {
    if (!window.desktopSessionManager?.runAction) {
      setBulkActionHint('当前环境没有注入账号清理能力。')
      return
    }
    if (selectedIds.length === 0) {
      setBulkActionHint('请先选择要处理的账号。')
      return
    }

    setBulkMenuOpen(false)
    setBulkSubmenu(null)
    setBulkActionHint('')
    setLogsContext('accounts-cleanup')
    setActiveModule('logs')

    try {
      await window.desktopSessionManager.clearLogs?.().catch(() => undefined)
      await window.desktopSessionManager.runAction({
        action,
        accountIds: [...selectedIds],
        targetRefs: [],
        messageIds: []
      })
    } catch (error) {
      setBulkActionHint(error instanceof Error ? error.message : '账号清理失败，请稍后再试。')
    }
  }, [selectedIds, setActiveModule, setLogsContext])

  const handleOpenProfileDialog = useCallback((action: ProfileOperationAction) => {
    if (selectedIds.length === 0) {
      setBulkActionHint('请先选择要处理的账号。')
      return
    }

    setBulkMenuOpen(false)
    setBulkSubmenu(null)
    setBulkActionHint('')

    if (!profileActionNeedsDialog(action)) {
      void handleSubmitProfileOperation({
        action,
        accountIds: selectedIds,
        value: '',
        avatarPath: ''
      })
      return
    }

    setProfileDialog({ action, accountIds: selectedIds })
  }, [handleSubmitProfileOperation, selectedIds])

  const handleOpenPremiumDialog = useCallback(async (account: AccountRecord) => {
    let premiumExpiryOverride: string | null | undefined = readPremiumExpiry(account)

    if (premiumExpiryOverride) {
      setPremiumDialogAccount({ account, premiumExpiryOverride })
      return
    }

    if (window.desktopAccounts?.readPremiumExpiryFromDesktop) {
      const result = await window.desktopAccounts.readPremiumExpiryFromDesktop(account.id)
      if (result?.premiumExpiry) {
        premiumExpiryOverride = result.premiumExpiry
      }
    }

    setPremiumDialogAccount({ account, premiumExpiryOverride })
  }, [])

  const handleRefresh = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setCountryFilter('')
    setSourceFilter('')
    setProxyFilter('')
    setPremiumFilter('all')
    setTwoFactorFilter('all')
    setAvatarFilter('all')
    setTaskFilter('all')
    setUsernameFilter('all')
    setActiveShortcutId(null)
    setSelectedIds([])
    setSorting(createDefaultSorting())
    setPagination(createDefaultPagination())
    setScrollLeft(0)
    setCopiedPhone(null)
    setFrozenDialogAccount(null)
    setPremiumDialogAccount(null)
    setTwoFactorDialog(null)
    setProfileDialog(null)

    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
    }
    if (scrollbarRef.current) {
      scrollbarRef.current.scrollLeft = 0
    }

    void refresh()
  }, [refresh, setCountryFilter, setSearch, setSelectedIds, setStatusFilter])

  const handleScrollbarScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollLeft(event.currentTarget.scrollLeft)
  }, [])

  const selectedTwoFactorAccounts = useMemo(() => {
    if (!twoFactorDialog) return []
    const accountIdSet = new Set(twoFactorDialog.accountIds)
    return accounts.filter((account) => accountIdSet.has(account.id))
  }, [accounts, twoFactorDialog])
  const selectedProfileAccounts = useMemo(() => {
    if (!profileDialog) return []
    const accountIdSet = new Set(profileDialog.accountIds)
    return accounts.filter((account) => accountIdSet.has(account.id))
  }, [accounts, profileDialog])
  const operationBusy = busy || twoFactorSubmitting || profileSubmitting || twoFactorState.running || profileOperationState.running

  const handleViewportWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!scrollbarRef.current) return

    if (Math.abs(event.deltaX) > 0) {
      scrollbarRef.current.scrollLeft += event.deltaX
      event.preventDefault()
      return
    }

    if (event.shiftKey && Math.abs(event.deltaY) > 0) {
      scrollbarRef.current.scrollLeft += event.deltaY
      event.preventDefault()
    }
  }, [])

  return (
    <div className="space-y-4 min-w-0">
      <AccountSummaryCards
        items={summaryCards}
        activeFilter={activeShortcutId ? ('__custom__' as AccountStatusFilter) : statusFilter}
        onSelect={(value) => {
          setActiveShortcutId(null)
          setCountryFilter('')
          setProxyFilter('')
          setPremiumFilter('all')
          setTwoFactorFilter('all')
          setAvatarFilter('all')
          setTaskFilter('all')
          setUsernameFilter('all')
          setStatusFilter(value)
        }}
        action={(
          <button
            type="button"
            title="新建顶部筛选"
            onClick={handleOpenShortcutDialog}
            className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[8px] text-textMuted transition hover:bg-white/6 hover:text-white"
          >
            <Settings2 size={14} />
          </button>
        )}
      >
          {shortcutCards.map((shortcut, index) => {
            const active = activeShortcutId === shortcut.id
            return (
              <div
                key={shortcut.id}
                role="button"
                tabIndex={0}
                title={shortcut.summary}
                onClick={() => handleApplyShortcut(shortcut)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleApplyShortcut(shortcut)
                  }
                }}
                className={`group relative rounded-[16px] border px-5 py-4 text-left transition ${active
                  ? 'border-white/[0.12] bg-sky-400/10 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]'
                  : 'border-white/[0.06] bg-card hover:border-white/[0.09] hover:bg-hover'}`}
              >
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    title="左移"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleMoveShortcut(shortcut.id, 'left')
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/45 text-textMuted transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    type="button"
                    title="右移"
                    disabled={index === shortcutCards.length - 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleMoveShortcut(shortcut.id, 'right')
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/45 text-textMuted transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight size={12} />
                  </button>
                  <button
                    type="button"
                    title="删除这个顶部筛选"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRemoveShortcut(shortcut.id)
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/45 text-textMuted transition hover:bg-white/10 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className={`text-3xl font-semibold ${active ? 'text-sky-300' : 'text-white'}`}>{shortcut.count}</div>
                <div className={`mt-2 text-sm ${active ? 'text-sky-200' : 'text-textMuted'}`}>{shortcut.name}</div>
              </div>
            )
          })}
      </AccountSummaryCards>

      <TableToolbar
        selectedCount={selectedCount}
        totalCount={totalCount}
        deletePresetCounts={deletePresetCounts}
        loading={tableLoading}
        busy={operationBusy}
        importProgress={importProgress}
        importResultOpen={importResultOpen}
        lastActionMessage={lastActionMessage}
        errorMessage={errorMessage}
        onImportFiles={() => importFiles()}
        onImportFolder={() => importFolder()}
        onExportSelected={() => void exportSelected()}
        onDeleteSelected={() => void deleteSelected()}
        onDeleteAll={() => void deleteAll()}
        onDeleteFlagged={() => void deleteByStatusGroup('flagged')}
        onDeleteBanned={() => void deleteByStatusGroup('banned')}
        onDeleteFrozen={() => void deleteByStatusGroup('frozen')}
        onDeleteMultiIp={() => void deleteByStatusGroup('multi_ip')}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onSelectRange={handleSelectRange}
      />

      <TableFilters
        search={search}
        countryFilter={countryFilter}
        statusFilter={statusFilter === 'all' ? '' : statusFilter}
        proxyFilter={proxyFilter}
        twoFactorFilter={twoFactorFilter}
        avatarFilter={avatarFilter}
        taskFilter={taskFilter}
        usernameFilter={usernameFilter}
        reauthorizeFilter={reauthorizeFilter}
        countries={countries}
        statuses={statuses}
        proxies={proxies}
        presences={presenceOptions}
        reauthorizeOptions={reauthorizeOptions}
        onSearchChange={handleSearchChange}
        onCountryChange={setCountryFilter}
        onStatusChange={(value) => setStatusFilter((value || 'all') as AccountStatusFilter)}
        onProxyChange={setProxyFilter}
        onTwoFactorChange={(value) => setTwoFactorFilter((value || 'all') as PresenceFilter)}
        onAvatarChange={(value) => setAvatarFilter((value || 'all') as PresenceFilter)}
        onTaskChange={(value) => setTaskFilter((value || 'all') as PresenceFilter)}
        onUsernameChange={(value) => setUsernameFilter((value || 'all') as PresenceFilter)}
        onReauthorizeChange={(value) => setReauthorizeFilter((value || 'all') as AccountListReauthorizeFilter)}
        onRefresh={handleRefresh}
      />

      <div ref={tableCardRef}>
        <GlassPanel className="overflow-hidden p-0">
        <div className="min-w-0">
          <div
            ref={viewportRef}
            className="virtual-scroll-shell min-w-0 max-h-[580px] overflow-y-auto overflow-x-hidden"
            onWheel={handleViewportWheel}
          >
            <div className="relative overflow-hidden" style={{ height: `${tableLoading ? 8 * 52 + 56 : totalSize + 56}px` }}>
              <div
                className="absolute left-0 top-0 w-full"
                style={{ minWidth: `${ACCOUNT_SHELL_MIN_WIDTH}px`, transform: `translateX(-${scrollLeft}px)` }}
              >
                <div className="sticky top-0 z-10 bg-card px-2 pb-[2px] pt-[2px]" style={{ width: '100%', minWidth: `${ACCOUNT_SHELL_MIN_WIDTH}px` }}>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <div key={headerGroup.id} className="grid shrink-0" style={ACCOUNT_GRID_STYLE}>
                      {headerGroup.headers.map((header) => (
                        <div
                          key={header.id}
                          className={`${cellShellClass(header.column.id, true)} h-[48px] shrink-0 text-left text-[11px] font-semibold tracking-[0.22em] text-textMuted`}
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              className={isCenteredColumn(header.column.id)
                                ? 'flex min-w-0 items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-center transition hover:text-white'
                                : 'flex w-full min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-left transition hover:text-white'}
                              onClick={header.column.getToggleSortingHandler()}
                              title={String(header.column.columnDef.header ?? '')}
                            >
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </span>
                              <ArrowUpDown size={14} className="shrink-0" />
                            </button>
                          ) : (
                            <div className={`${isCenteredColumn(header.column.id) ? 'w-full text-center' : 'w-full'} min-w-0 overflow-hidden text-ellipsis whitespace-nowrap`}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="relative" style={{ height: `${tableLoading ? 8 * 52 : totalSize}px` }}>
                  {tableLoading
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={`skeleton-${index}`}
                          className="absolute left-0 top-0 px-1.5 py-[3px]"
                          style={{ transform: `translateY(${index * 52}px)`, width: '100%', minWidth: `${ACCOUNT_SHELL_MIN_WIDTH}px` }}
                        >
                          <SkeletonRow columns={10} />
                        </div>
                      ))
                    : virtualRows.map((virtualRow) => {
                        const row = rows[virtualRow.index]
                        return (
                          <div
                            key={row.id}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            className="absolute left-0 top-0 px-1.5 py-[3px]"
                            style={{ transform: `translateY(${virtualRow.start}px)`, width: '100%', minWidth: `${ACCOUNT_SHELL_MIN_WIDTH}px` }}
                          >
                            <div
                              className={`grid min-h-[52px] shrink-0 items-center gap-0 rounded-[10px] transition ${
                                row.getIsSelected() ? 'bg-neon/8' : 'bg-panel hover:bg-hover'
                              }`}
                              style={ACCOUNT_GRID_STYLE}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <div key={cell.id} className={`${cellShellClass(cell.column.id)} shrink-0 py-2 text-[13px] text-textMain`}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                </div>
              </div>
            </div>
          </div>

          {!tableLoading && rows.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
              <Loader2 className="animate-spin text-neonSoft" size={22} />
              <div className="text-base font-medium text-white">没有符合筛选条件的账号</div>
              <div className="max-w-md text-sm text-textMuted">请尝试调整状态、资料来源、Proxy 或搜索关键词后再查看结果。</div>
            </div>
          ) : (
            <div className="border-t border-white/5 px-1.5 pb-2 pt-1.5">
              <div ref={scrollbarRef} className="account-table-scrollbar h-4 overflow-x-auto overflow-y-hidden" onScroll={handleScrollbarScroll}>
                <div style={{ width: '100%', minWidth: `${ACCOUNT_SHELL_MIN_WIDTH}px`, height: '1px' }} />
              </div>
            </div>
          )}

        </div>
        </GlassPanel>
      </div>

      {selectedCount > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed bottom-4 z-[999] px-1" ref={bulkMenuRef} style={{ left: `${bulkMenuLayout.left}px`, width: `${bulkMenuLayout.width}px` }}>
              <div className="rounded-[16px] border border-white/10 bg-card/95 px-3 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="grid gap-3 rounded-[12px] bg-panel/85 px-3 py-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <div className="flex flex-wrap items-center gap-3 md:justify-self-start">
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-card text-textMuted transition hover:bg-hover hover:text-white"
                      title="取消当前选中"
                    >
                      <X size={16} />
                    </button>

                    <div className="rounded-[12px] bg-card px-4 py-3 text-sm font-semibold text-white">
                      {selectedCount} / {totalCount}
                    </div>

                    {bulkActionHint ? (
                      <div className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-textMuted">{bulkActionHint}</div>
                    ) : null}
                  </div>

                  <div className="relative md:justify-self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMenuOpen((value) => !value)
                        setBulkSubmenu(null)
                      }}
                      className={getBulkOperationButtonClass(true)}
                    >
                      <Sparkles size={16} />
                      操作菜单
                    </button>

                    {bulkMenuOpen ? (
                      <>
                        <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-[300px] -translate-x-1/2 rounded-[16px] border border-white/8 bg-card p-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                          <div className="mb-2 px-2 text-xs tracking-[0.2em] text-textMuted">已选账号操作</div>
                          <div className="space-y-2">
                            <button type="button" onClick={() => handleBulkCheckAction('account-status')} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                              <Activity size={16} className="text-neonSoft" />
                              <span>检查账号是否双向</span>
                            </button>
                            <button type="button" onClick={() => handleBulkCheckAction('account-survival')} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                              <HeartPulse size={16} className="text-neonSoft" />
                              <span>检查账号是否存活</span>
                            </button>
                            <button type="button" onClick={() => setBulkSubmenu('two-fa')} className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                              <span className="flex items-center gap-3"><KeyRound size={16} className="text-neonSoft" />2FA 管理</span>
                              <ChevronRight size={15} className="text-textMuted" />
                            </button>
                            <button type="button" onClick={() => setBulkSubmenu('profile')} className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                              <span className="flex items-center gap-3"><Shuffle size={16} className="text-neonSoft" />随机更换个人资料</span>
                              <ChevronRight size={15} className="text-textMuted" />
                            </button>
                            <button type="button" onClick={() => setBulkSubmenu('cleanup')} className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                              <span className="flex items-center gap-3"><Trash2 size={16} className="text-neonSoft" />账号清理</span>
                              <ChevronRight size={15} className="text-textMuted" />
                            </button>
                          </div>
                        </div>

                        {bulkSubmenu === 'two-fa' ? (
                          <div className="absolute bottom-[calc(100%+12px)] left-[calc(100%+12px)] z-40 w-[260px] rounded-[16px] border border-white/8 bg-card p-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                            <div className="mb-2 flex items-center justify-between px-2">
                              <div className="text-xs tracking-[0.2em] text-textMuted">2FA 管理</div>
                              <button type="button" onClick={() => setBulkSubmenu(null)} className="text-xs text-textMuted transition hover:text-white">关闭</button>
                            </div>
                            <div className="space-y-2">
                              {twoFaMenuItems.map((item) => (
                                <button key={item.id} type="button" onClick={() => handleOpenTwoFactorDialog(item.id)} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                                  <KeyRound size={15} className="text-neonSoft" />
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {bulkSubmenu === 'profile' ? (
                          <div className="absolute bottom-[calc(100%+12px)] left-[calc(100%+12px)] z-40 w-[280px] rounded-[16px] border border-white/8 bg-card p-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                            <div className="mb-2 flex items-center justify-between px-2">
                              <div className="text-xs tracking-[0.2em] text-textMuted">个人资料</div>
                              <button type="button" onClick={() => setBulkSubmenu(null)} className="text-xs text-textMuted transition hover:text-white">关闭</button>
                            </div>
                            <div className="space-y-2">
                              {profileMenuItems.map((item) => (
                                <button key={item.id} type="button" onClick={() => handleOpenProfileDialog(item.id)} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                                  <UserRoundPen size={15} className="text-neonSoft" />
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {bulkSubmenu === 'cleanup' ? (
                          <div className="absolute bottom-[calc(100%+12px)] left-[calc(100%+12px)] z-40 w-[340px] rounded-[16px] border border-white/8 bg-card p-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
                            <div className="mb-2 flex items-center justify-between px-2">
                              <div className="text-xs tracking-[0.2em] text-textMuted">账号清理</div>
                              <button type="button" onClick={() => setBulkSubmenu(null)} className="text-xs text-textMuted transition hover:text-white">关闭</button>
                            </div>
                            <div className="space-y-2">
                              {cleanupMenuItems.map((item) => (
                                <button key={item.id} type="button" onClick={() => void handleSubmitCleanupOperation(item.id)} className="w-full rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                                  <div className="flex items-center gap-3">
                                    <Trash2 size={15} className="text-neonSoft" />
                                    <span>{item.label}</span>
                                  </div>
                                  <div className="mt-2 pl-7 text-xs leading-5 text-textMuted">{item.hint}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="hidden md:block" aria-hidden="true" />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <TablePagination
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        totalRows={visibleTotalCount}
        canPreviousPage={canUseServerPage ? pagination.pageIndex > 0 : table.getCanPreviousPage()}
        canNextPage={canUseServerPage ? pagination.pageIndex + 1 < Math.max(1, Math.ceil(visibleTotalCount / Math.max(1, pagination.pageSize))) : table.getCanNextPage()}
        onPreviousPage={() => table.previousPage()}
        onNextPage={() => table.nextPage()}
        onPageSizeChange={(size) => table.setPageSize(size)}
      />

      {frozenDialogAccount ? <FrozenStatusDialog account={frozenDialogAccount} onClose={() => setFrozenDialogAccount(null)} /> : null}
      {premiumDialogAccount ? (
        <PremiumStatusDialog
          account={premiumDialogAccount.account}
          premiumExpiryOverride={premiumDialogAccount.premiumExpiryOverride}
          onClose={() => setPremiumDialogAccount(null)}
        />
      ) : null}
      <TwoFactorManageDialog
        open={Boolean(twoFactorDialog)}
        action={twoFactorDialog?.action ?? null}
        accounts={selectedTwoFactorAccounts}
        submitting={twoFactorSubmitting}
        onClose={() => setTwoFactorDialog(null)}
        onSubmit={handleSubmitTwoFactor}
      />
      <ProfileManageDialog
        open={Boolean(profileDialog)}
        action={profileDialog?.action ?? null}
        accounts={selectedProfileAccounts}
        submitting={profileSubmitting}
        onClose={() => setProfileDialog(null)}
        onSubmit={handleSubmitProfileOperation}
      />
      {shortcutDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 pt-12 pb-6" onClick={() => setShortcutDialogOpen(false)}>
          <div className="w-full max-w-[540px] rounded-[18px] border border-white/[0.06] bg-card shadow-[0_16px_48px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <div className="text-base font-semibold text-white">新建顶部筛选</div>
                <div className="mt-1 text-sm text-textMuted">比如：美国 + 无限制 + 会员，然后自己命名。</div>
              </div>
              <button type="button" className="rounded-[8px] px-2 py-1 text-sm text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setShortcutDialogOpen(false)}>关闭</button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <div className="mb-2 text-sm text-textMuted">筛选名称</div>
                <input
                  value={shortcutName}
                  onChange={(event) => setShortcutName(event.target.value)}
                  placeholder="比如：美国会员精品号"
                  className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select value={shortcutCountryFilter} onChange={(event) => setShortcutCountryFilter(event.target.value)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="">国家（不限）</option>
                  {countries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutStatusFilter} onChange={(event) => setShortcutStatusFilter(event.target.value as AccountStatusFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">状态（不限）</option>
                  {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutProxyFilter} onChange={(event) => setShortcutProxyFilter(event.target.value)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="">网络（不限）</option>
                  {proxies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutPremiumFilter} onChange={(event) => setShortcutPremiumFilter(event.target.value as PremiumFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">会员（不限）</option>
                  <option value="premium">只看会员</option>
                  <option value="non-premium">只看非会员</option>
                </select>

                <select value={shortcutTwoFactorFilter} onChange={(event) => setShortcutTwoFactorFilter(event.target.value as PresenceFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">2FA（不限）</option>
                  {presenceOptions.map((option) => <option key={`shortcut-twofa-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutAvatarFilter} onChange={(event) => setShortcutAvatarFilter(event.target.value as PresenceFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">头像（不限）</option>
                  {presenceOptions.map((option) => <option key={`shortcut-avatar-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutTaskFilter} onChange={(event) => setShortcutTaskFilter(event.target.value as PresenceFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">任务（不限）</option>
                  {presenceOptions.map((option) => <option key={`shortcut-task-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutUsernameFilter} onChange={(event) => setShortcutUsernameFilter(event.target.value as PresenceFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">用户名（不限）</option>
                  {presenceOptions.map((option) => <option key={`shortcut-username-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutReauthorizeFilter} onChange={(event) => setShortcutReauthorizeFilter(event.target.value as AccountListReauthorizeFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">重新授权（不限）</option>
                  {reauthorizeOptions.map((option) => <option key={`shortcut-reauthorize-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="rounded-[12px] bg-panel px-4 py-3 text-sm text-textMuted">
                保存后会固定在顶部：<span className="text-white">{readShortcutSummary({ id: '', name: shortcutName, countryFilter: shortcutCountryFilter, statusFilter: shortcutStatusFilter, proxyFilter: shortcutProxyFilter, premiumFilter: shortcutPremiumFilter, twoFactorFilter: shortcutTwoFactorFilter, avatarFilter: shortcutAvatarFilter, taskFilter: shortcutTaskFilter, usernameFilter: shortcutUsernameFilter, reauthorizeFilter: shortcutReauthorizeFilter })}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-5 py-4">
              <button type="button" onClick={() => setShortcutDialogOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
              <button type="button" onClick={handleSaveShortcut} className="rounded-[12px] bg-violet-400 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-violet-300">保存到顶部</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
})
