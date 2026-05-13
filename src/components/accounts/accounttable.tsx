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
import { createPortal } from 'react-dom'
import {
  type ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Activity, ArrowUpDown, ChevronLeft, ChevronRight, HeartPulse, KeyRound, Loader2, Settings2, Shuffle, Sparkles, Star, UserRoundPen, X } from 'lucide-react'
import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { AccountRecord, CheckAction } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import { AccountSummaryCards } from './accountsummarycards'
import { TableFilters } from './tablefilters'
import { TablePagination } from './tablepagination'
import { TableToolbar } from './tabletoolbar'
import { filterAccounts, useAccountStore, type AccountStatusFilter } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap, type AccountTaskKind } from '../../lib/account-task-status'
import { formatAccountStatus, formatCountryDisplay, formatDateTime, formatDateTimeFull, formatProfileSource } from '../../lib/ui-text'
import { resolveCountryMeta } from '../../lib/phone-country'
import { useUIStore } from '../../stores/uistore'

const ACCOUNT_GRID_TEMPLATE = '38px 52px 144px 88px 98px 72px 128px 76px 88px 144px'
const ACCOUNT_GRID_WIDTH = 928
const ACCOUNT_SHELL_WIDTH = ACCOUNT_GRID_WIDTH + 12
const ACCOUNT_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: ACCOUNT_GRID_TEMPLATE,
  width: `${ACCOUNT_GRID_WIDTH}px`,
  minWidth: 'max-content'
}

interface PremiumDialogState {
  account: AccountRecord
  premiumExpiryOverride?: string | null
}

type BulkOperationSubmenu = 'two-fa' | 'profile' | null
type PremiumFilter = 'all' | 'premium' | 'non-premium'

interface AccountFilterShortcut {
  id: string
  name: string
  countryFilter: string
  statusFilter: AccountStatusFilter
  proxyFilter: string
  premiumFilter: PremiumFilter
}

const ACCOUNT_FILTER_SHORTCUT_STORAGE_KEY = 'tg-group-account-filter-shortcuts-v1'

const twoFaMenuItems = [
  { id: 'change-2fa', label: '更改 2FA' },
  { id: 'disable-2fa', label: '关闭 2FA' },
  { id: 'reset-2fa', label: '重置 2FA' }
] as const

const profileMenuItems = [
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

function createDefaultSorting() {
  return [{ id: 'lastOnlineTime', desc: true }]
}

function createDefaultPagination() {
  return { pageIndex: 0, pageSize: 20 }
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
        premiumFilter: item?.premiumFilter === 'premium' || item?.premiumFilter === 'non-premium' ? item.premiumFilter : 'all'
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
  return `flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] border text-[10px] font-semibold transition ${active
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
  if (account.profile?.proxy === true) {
    return '已连接代理'
  }

  return '直连'
}

function TaskBadge({ accountId, taskMap }: { accountId: number; taskMap: Map<number, AccountTaskKind> }) {
  const taskMeta = getAccountTaskMeta(taskMap, accountId)
  return (
    <span className={`inline-flex rounded-full border px-1.5 py-[3px] text-[10px] leading-none ${taskMeta.tone}`}>
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
    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-900/70 ring-1 ring-white/8 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4" onClick={onClose}>
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
            <div className="mt-1 font-medium text-white">{freezeSince}</div>
          </div>

          <div className="rounded-[12px] bg-panel px-4 py-3">
            <div className="text-xs text-textMuted">冻结结束时间</div>
            <div className="mt-1 font-medium text-white">{freezeUntil}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4" onClick={onClose}>
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
    <div className="flex w-full items-center justify-center gap-0.5 whitespace-nowrap">
      <span title={`用户名：${username}`} className={actionButtonClass(username !== '-')}>@</span>
      <span title={twoFactor ? `2FA：${twoFactor}` : '2FA：未设置'} className={actionButtonClass(Boolean(twoFactor))}>🔓</span>
      <span title={`最后登录：${lastLogin}`} className={actionButtonClass(lastLogin !== '—')}>!</span>
      {premium ? (
        <button
          type="button"
          title="查看会员详情"
          onClick={() => void onOpenPremium(account)}
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] border border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-300 transition hover:brightness-110"
        >
          <Star size={12} className="fill-current" />
        </button>
      ) : null}
      <button
        type="button"
        title={openingWeb ? '正在打开 Telegram 网页版…' : '打开 Telegram 网页版'}
        onClick={() => void handleOpenTelegramWeb()}
        disabled={openingWeb}
        className={`flex h-5 min-w-[40px] shrink-0 items-center justify-center gap-0.5 rounded-[6px] border px-1 text-[9px] font-semibold uppercase tracking-[0.04em] transition ${openingWeb
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
  const exportSelected = useAccountStore((state) => state.exportSelected)
  const deleteSelected = useAccountStore((state) => state.deleteSelected)
  const deleteAll = useAccountStore((state) => state.deleteAll)
  const startSelectedCheck = useAccountStore((state) => state.startSelectedCheck)
  const setActiveModule = useUIStore((state) => state.setActiveModule)
  const setLogsContext = useUIStore((state) => state.setLogsContext)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const [sourceFilter, setSourceFilter] = useState('')
  const [proxyFilter, setProxyFilter] = useState('')
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>('all')
  const [savedShortcuts, setSavedShortcuts] = useState<AccountFilterShortcut[]>(loadAccountFilterShortcuts)
  const [activeShortcutId, setActiveShortcutId] = useState<string | null>(null)
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false)
  const [shortcutName, setShortcutName] = useState('')
  const [shortcutCountryFilter, setShortcutCountryFilter] = useState('')
  const [shortcutStatusFilter, setShortcutStatusFilter] = useState<AccountStatusFilter>('all')
  const [shortcutProxyFilter, setShortcutProxyFilter] = useState('')
  const [shortcutPremiumFilter, setShortcutPremiumFilter] = useState<PremiumFilter>('all')
  const [sorting, setSorting] = useState(createDefaultSorting)
  const [pagination, setPagination] = useState(createDefaultPagination)
  const [tableLoading, setTableLoading] = useState(true)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [frozenDialogAccount, setFrozenDialogAccount] = useState<AccountRecord | null>(null)
  const [premiumDialogAccount, setPremiumDialogAccount] = useState<PremiumDialogState | null>(null)
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkSubmenu, setBulkSubmenu] = useState<BulkOperationSubmenu>(null)
  const [bulkActionHint, setBulkActionHint] = useState('')
  const [bulkMenuLayout, setBulkMenuLayout] = useState({ left: 16, width: 320 })
  const deferredSearch = useDeferredValue(search)
  const tableCardRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollbarRef = useRef<HTMLDivElement | null>(null)
  const bulkMenuRef = useRef<HTMLDivElement | null>(null)

  const baseData = useMemo(
    () => filterAccounts(accounts, { search: deferredSearch, statusFilter: 'all', countryFilter }),
    [accounts, deferredSearch, countryFilter]
  )
  const summaryScopedData = useMemo(
    () =>
      baseData.filter((account) => {
        if (sourceFilter && account.profileSource !== sourceFilter) return false
        if (proxyFilter && readProxy(account) !== proxyFilter) return false
        return true
      }),
    [baseData, sourceFilter, proxyFilter]
  )
  const scopedData = useMemo(
    () => summaryScopedData.filter((account) => matchesPremiumFilter(account, premiumFilter)),
    [premiumFilter, summaryScopedData]
  )
  const data = useMemo(
    () => filterAccounts(scopedData, { search: '', statusFilter, countryFilter: '' }),
    [scopedData, statusFilter]
  )

  useEffect(() => {
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }, [deferredSearch, statusFilter, countryFilter, sourceFilter, proxyFilter, premiumFilter])

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

    if (!matched) {
      setActiveShortcutId(null)
    }
  }, [activeShortcutId, countryFilter, premiumFilter, proxyFilter, savedShortcuts, statusFilter])

  useEffect(() => {
    setTableLoading(true)
    const timer = window.setTimeout(() => setTableLoading(false), 160)
    return () => window.clearTimeout(timer)
  }, [data, sorting, pagination.pageIndex, pagination.pageSize, loading])

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

  const rowSelection = useMemo<RowSelectionState>(() => Object.fromEntries(selectedIds.map((id) => [String(id), true])), [selectedIds])

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
              checked={table.getIsAllPageRowsSelected()}
              ref={(input) => {
                if (input) input.indeterminate = table.getIsSomePageRowsSelected()
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className={cellShellClass('select')}>
            <input
              type="checkbox"
              title="选择当前行"
              className={checkboxClass()}
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
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
        header: '代理',
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
    [accountTaskStatusMap, copiedPhone, handlePhoneCopy, setFrozenDialogAccount]
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, rowSelection },
    enableRowSelection: (row) => !getAccountTaskMeta(accountTaskStatusMap, row.original.id).occupied,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const nextState = typeof updater === 'function' ? updater(rowSelection) : updater
      const nextIds = Object.entries(nextState)
        .filter(([, selected]) => Boolean(selected))
        .map(([id]) => Number(id))
      setSelectedIds(nextIds)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id)
  })

  const rows = table.getPaginationRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 52,
    overscan: 4,
    paddingStart: 0
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const countries = useMemo(
    () => Array.from(new Set(accounts.map((item) => formatCountryDisplay(item.country, item.phone)).filter(Boolean))).map((value) => ({ label: value, value })),
    [accounts]
  )
  const statuses = useMemo(
    () => {
      const options: Array<{ label: string; value: AccountStatusFilter }> = Array.from(new Set(accounts.map((item) => item.status))).map((value) => {
        const sampleAccount = accounts.find((item) => item.status === value)
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

      if (accounts.some((item) => item.profile?.is_premium)) {
        options.unshift({ label: '会员', value: 'premium' as AccountStatusFilter })
      }

      return options
    },
    [accounts]
  )
  const sources = useMemo(
    () => [
      { label: 'JSON 导入', value: 'json_import' },
      { label: '登录检查', value: 'login_check' }
    ],
    []
  )
  const proxies = useMemo(
    () => Array.from(new Set(accounts.map((item) => readProxy(item)))).filter(Boolean).map((value) => ({ label: value, value })),
    [accounts]
  )

  const selectedCount = selectedIds.length
  const totalCount = data.length
  const summaryCards = useMemo(() => {
    const aliveCount = summaryScopedData.filter((account) => account.status === 'alive' || account.status === 'geo_restricted').length
    const limitedCount = summaryScopedData.filter((account) => account.status === 'limited' || account.status === 'temporary_limited').length
    const frozenCount = summaryScopedData.filter((account) => account.status === 'frozen').length
    const bannedCount = summaryScopedData.filter((account) => account.status === 'banned').length
    const timeoutCount = summaryScopedData.filter((account) => account.status === 'timeout' || account.status === 'unknown' || account.status === 'checking').length

    return [
      { key: 'all' as AccountStatusFilter, label: '总数量', count: summaryScopedData.length },
      { key: 'alive' as AccountStatusFilter, label: '无限制', count: aliveCount },
      { key: 'limited-group' as AccountStatusFilter, label: '双向', count: limitedCount },
      { key: 'frozen' as AccountStatusFilter, label: '冻结', count: frozenCount },
      { key: 'banned' as AccountStatusFilter, label: '封禁', count: bannedCount },
      { key: 'timeout-group' as AccountStatusFilter, label: '超时/未检测', count: timeoutCount }
    ]
  }, [summaryScopedData])

  const shortcutCards = useMemo(() => (
    savedShortcuts.map((shortcut) => {
      const count = accounts.filter((account) => {
        if (shortcut.countryFilter && formatCountryDisplay(account.country, account.phone) !== shortcut.countryFilter) return false
        if (shortcut.statusFilter !== 'all') {
          if (shortcut.statusFilter === 'premium') {
            if (!isPremiumAccount(account)) return false
          } else if (shortcut.statusFilter === 'alive') {
            if (account.status !== 'alive' && account.status !== 'geo_restricted') return false
          } else if (shortcut.statusFilter === 'limited-group') {
            if (account.status !== 'limited' && account.status !== 'temporary_limited') return false
          } else if (shortcut.statusFilter === 'timeout-group') {
            if (account.status !== 'timeout' && account.status !== 'unknown' && account.status !== 'checking') return false
          } else if (account.status !== shortcut.statusFilter) {
            return false
          }
        }
        if (shortcut.proxyFilter && readProxy(account) !== shortcut.proxyFilter) return false
        if (!matchesPremiumFilter(account, shortcut.premiumFilter)) return false
        return true
      }).length

      return {
        ...shortcut,
        count,
        summary: readShortcutSummary(shortcut)
      }
    })
  ), [accounts, savedShortcuts])

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

  const orderedIds = useMemo(
    () => table.getSortedRowModel().rows.map((row) => row.original.id),
    [table, data, sorting]
  )

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [setSearch])

  const handleOpenShortcutDialog = useCallback(() => {
    setShortcutName('')
    setShortcutCountryFilter(countryFilter)
    setShortcutStatusFilter(statusFilter)
    setShortcutProxyFilter(proxyFilter)
    setShortcutPremiumFilter(premiumFilter)
    setShortcutDialogOpen(true)
  }, [countryFilter, premiumFilter, proxyFilter, statusFilter])

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
      premiumFilter: shortcutPremiumFilter
    }

    setSavedShortcuts((previous) => [...previous, nextShortcut])
    setActiveShortcutId(nextShortcut.id)
    setSearch('')
    setCountryFilter(nextShortcut.countryFilter)
    setStatusFilter(nextShortcut.statusFilter)
    setProxyFilter(nextShortcut.proxyFilter)
    setPremiumFilter(nextShortcut.premiumFilter)
    setShortcutDialogOpen(false)
    setBulkActionHint(`已把“${name}”固定到顶部。`)
  }, [setCountryFilter, setSearch, setStatusFilter, shortcutCountryFilter, shortcutName, shortcutPremiumFilter, shortcutProxyFilter, shortcutStatusFilter])

  const handleApplyShortcut = useCallback((shortcut: AccountFilterShortcut) => {
    setActiveShortcutId(shortcut.id)
    setSearch('')
    setCountryFilter(shortcut.countryFilter)
    setStatusFilter(shortcut.statusFilter)
    setProxyFilter(shortcut.proxyFilter)
    setPremiumFilter(shortcut.premiumFilter)
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

  const handleSelectAll = useCallback(() => {
    setSelectedIds(orderedIds)
  }, [orderedIds, setSelectedIds])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  const handleSelectRange = useCallback((start: number, end: number) => {
    const normalizedStart = Math.max(1, Math.min(start, end))
    const normalizedEnd = Math.max(start, end)
    const ids = orderedIds.slice(normalizedStart - 1, normalizedEnd)
    setSelectedIds(ids)
  }, [orderedIds, setSelectedIds])

  const handleStartCheck = useCallback((actions: CheckAction[]) => {
    setLogsContext('accounts')
    setActiveModule('logs')
    void startSelectedCheck(actions)
  }, [setActiveModule, setLogsContext, startSelectedCheck])

  const handleBulkCheckAction = useCallback((action: 'account-status' | 'account-survival') => {
    handleStartCheck([action])
    setBulkMenuOpen(false)
    setBulkSubmenu(null)
  }, [handleStartCheck])

  const handlePendingBulkAction = useCallback((label: string) => {
    setBulkActionHint(`${label} 入口我已经先放好了，下一步接真实功能。`)
  }, [])

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
    setActiveShortcutId(null)
    setSelectedIds([])
    setSorting(createDefaultSorting())
    setPagination(createDefaultPagination())
    setScrollLeft(0)
    setCopiedPhone(null)
    setFrozenDialogAccount(null)
    setPremiumDialogAccount(null)

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
        loading={tableLoading}
        busy={busy}
        onImportFiles={() => void importFiles()}
        onImportFolder={() => void importFolder()}
        onExportSelected={() => void exportSelected()}
        onDeleteSelected={() => void deleteSelected()}
        onDeleteAll={() => void deleteAll()}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onSelectRange={handleSelectRange}
      />

      <TableFilters
        search={search}
        countryFilter={countryFilter}
        statusFilter={statusFilter === 'all' ? '' : statusFilter}
        proxyFilter={proxyFilter}
        countries={countries}
        statuses={statuses}
        proxies={proxies}
        onSearchChange={handleSearchChange}
        onCountryChange={setCountryFilter}
        onStatusChange={(value) => setStatusFilter((value || 'all') as AccountStatusFilter)}
        onProxyChange={setProxyFilter}
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
                className="absolute left-0 top-0"
                style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, minWidth: 'max-content', transform: `translateX(-${scrollLeft}px)` }}
              >
                <div className="sticky top-0 z-10 bg-card px-1.5 pb-[2px] pt-[2px]" style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, minWidth: 'max-content' }}>
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
                          style={{ transform: `translateY(${index * 52}px)`, width: `${ACCOUNT_SHELL_WIDTH}px` }}
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
                            style={{ transform: `translateY(${virtualRow.start}px)`, width: `${ACCOUNT_SHELL_WIDTH}px` }}
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
                <div style={{ width: `${ACCOUNT_SHELL_WIDTH}px`, height: '1px' }} />
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
                                <button key={item.id} type="button" onClick={() => handlePendingBulkAction(item.label)} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
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
                                <button key={item.id} type="button" onClick={() => handlePendingBulkAction(item.label)} className="flex w-full items-center gap-3 rounded-[12px] bg-panel px-3 py-3 text-left text-sm text-white transition hover:bg-hover">
                                  <UserRoundPen size={15} className="text-neonSoft" />
                                  <span>{item.label}</span>
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
        totalRows={data.length}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
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
      {shortcutDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4" onClick={() => setShortcutDialogOpen(false)}>
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
                  <option value="">代理（不限）</option>
                  {proxies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>

                <select value={shortcutPremiumFilter} onChange={(event) => setShortcutPremiumFilter(event.target.value as PremiumFilter)} className="h-11 rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-textMain outline-none transition focus:border-white/[0.12] focus:bg-hover">
                  <option value="all">会员（不限）</option>
                  <option value="premium">只看会员</option>
                  <option value="non-premium">只看非会员</option>
                </select>
              </div>

              <div className="rounded-[12px] bg-panel px-4 py-3 text-sm text-textMuted">
                保存后会固定在顶部：<span className="text-white">{readShortcutSummary({ id: '', name: shortcutName, countryFilter: shortcutCountryFilter, statusFilter: shortcutStatusFilter, proxyFilter: shortcutProxyFilter, premiumFilter: shortcutPremiumFilter })}</span>
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
