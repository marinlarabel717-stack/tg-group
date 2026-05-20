import { memo, useEffect, useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { AccountRecord, AccountStatus } from '../../types'
import type { AccountStatusFilter } from '../../stores/accountstore'
import { AccountSummaryCards } from './accountsummarycards'
import { StatusBadge } from './statusbadge'
import { TableFilters } from './tablefilters'
import { resolveCountryMeta } from '../../lib/phone-country'
import { formatAccountStatus, formatCountryDisplay } from '../../lib/ui-text'

export type AccountPickerPresenceFilter = 'all' | 'has' | 'none'
export type AccountPickerStatusFilter = AccountStatusFilter

export interface AccountPickerBusyMeta {
  busy: boolean
  label?: string
  tone?: string
}

interface AccountPickerDialogProps {
  open: boolean
  onClose: () => void
  accounts: AccountRecord[]
  loading?: boolean
  selectedIds: number[]
  onConfirm: (ids: number[]) => void
  title?: string
  subtitle?: string
  confirmText?: string
  cancelText?: string
  clearText?: string
  selectionMode?: 'single' | 'multiple'
  resolveBusyMeta?: (account: AccountRecord, draftSelectedIds: number[]) => AccountPickerBusyMeta
}

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function checkboxClass() {
  return 'h-4 w-4 rounded border-none bg-slate-950/50 accent-blue-500'
}

function cellTextClass(extra = '') {
  return `block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${extra}`.trim()
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
  if (nickname && nickname !== '-') return nickname.slice(0, 1).toUpperCase()
  const phone = (account.phone || '').replace(/\D/g, '')
  if (phone) return phone.slice(-2)
  return 'TG'
}

const AvatarCell = memo(function AvatarCell({ account }: { account: AccountRecord }) {
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
})

const CountryCell = memo(function CountryCell({ country, phone }: { country: string; phone: string }) {
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
})

function matchesAccountStatusFilter(account: AccountRecord, filter: AccountPickerStatusFilter) {
  if (filter === 'all') return true
  if (filter === 'premium') return Boolean(account.profile?.is_premium)
  if (filter === 'alive') return account.status === 'alive' || account.status === 'geo_restricted'
  if (filter === 'limited-group') return account.status === 'limited' || account.status === 'temporary_limited'
  if (filter === 'timeout-group') return account.status === 'timeout' || account.status === 'unknown' || account.status === 'checking'
  return account.status === filter
}

function readProxy(account: AccountRecord) {
  if (typeof account.proxyDisplay === 'string' && account.proxyDisplay.trim()) return '代理'
  if (account.profile?.proxy === true) return '代理'
  return '直连'
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
  const profileUsername = typeof account.profile?.username === 'string' ? account.profile.username.trim() : ''
  if (profileUsername) return true
  return Boolean(account.username?.trim())
}

function matchesPresenceFilter(hasValue: boolean, filter: AccountPickerPresenceFilter) {
  if (filter === 'has') return hasValue
  if (filter === 'none') return !hasValue
  return true
}

export const AccountPickerDialog = memo(function AccountPickerDialog({
  open,
  onClose,
  accounts,
  loading = false,
  selectedIds,
  onConfirm,
  title = '选择账号',
  subtitle = '直接按账号管理那套表格来选，筛完后在顶部确认。',
  confirmText = '确认选择账号',
  cancelText = '取消选择',
  clearText = '清空选择',
  selectionMode = 'multiple',
  resolveBusyMeta
}: AccountPickerDialogProps) {
  const [draftIds, setDraftIds] = useState<number[]>(selectedIds)
  const [accountKeyword, setAccountKeyword] = useState('')
  const [accountCountryFilter, setAccountCountryFilter] = useState('')
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountPickerStatusFilter>('all')
  const [accountProxyFilter, setAccountProxyFilter] = useState('')
  const [accountTwoFactorFilter, setAccountTwoFactorFilter] = useState<AccountPickerPresenceFilter>('all')
  const [accountAvatarFilter, setAccountAvatarFilter] = useState<AccountPickerPresenceFilter>('all')
  const [accountTaskFilter, setAccountTaskFilter] = useState<AccountPickerPresenceFilter>('all')
  const [accountUsernameFilter, setAccountUsernameFilter] = useState<AccountPickerPresenceFilter>('all')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')

  useEffect(() => {
    if (!open) {
      setDraftIds(selectedIds)
      setAccountKeyword('')
      setAccountCountryFilter('')
      setAccountStatusFilter('all')
      setAccountProxyFilter('')
      setAccountTwoFactorFilter('all')
      setAccountAvatarFilter('all')
      setAccountTaskFilter('all')
      setAccountUsernameFilter('all')
      setRangeMenuOpen(false)
      setRangeStart('1')
      setRangeEnd('20')
      return
    }
    setDraftIds(selectedIds)
  }, [open, selectedIds])

  const busyMetaById = useMemo(() => {
    const map = new Map<number, AccountPickerBusyMeta>()
    for (const account of accounts) {
      map.set(account.id, resolveBusyMeta?.(account, draftIds) ?? { busy: false })
    }
    return map
  }, [accounts, draftIds, resolveBusyMeta])

  const basePickerAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase()
    const searchedAccounts = !keyword ? accounts : accounts.filter((account) => {
      const fullName = readAccountLabel(account).toLowerCase()
      return [fullName, account.phone || '', account.username || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
    if (!accountCountryFilter) return searchedAccounts
    return searchedAccounts.filter((account) => formatCountryDisplay(account.country, account.phone) === accountCountryFilter)
  }, [accountCountryFilter, accountKeyword, accounts])

  const summaryScopedAccounts = useMemo(
    () => basePickerAccounts.filter((account) => {
      const busyMeta = busyMetaById.get(account.id) ?? { busy: false }
      if (accountProxyFilter && readProxy(account) !== accountProxyFilter) return false
      if (!matchesPresenceFilter(Boolean(readTwoFactor(account)), accountTwoFactorFilter)) return false
      if (!matchesPresenceFilter(hasAvatar(account), accountAvatarFilter)) return false
      if (!matchesPresenceFilter(busyMeta.busy, accountTaskFilter)) return false
      if (!matchesPresenceFilter(hasUsername(account), accountUsernameFilter)) return false
      return true
    }),
    [accountAvatarFilter, accountProxyFilter, accountTaskFilter, accountTwoFactorFilter, accountUsernameFilter, basePickerAccounts, busyMetaById]
  )

  const filteredAccounts = useMemo(
    () => summaryScopedAccounts.filter((account) => matchesAccountStatusFilter(account, accountStatusFilter)),
    [accountStatusFilter, summaryScopedAccounts]
  )

  const selectableFilteredAccounts = useMemo(
    () => filteredAccounts.filter((account) => !(busyMetaById.get(account.id)?.busy ?? false)),
    [busyMetaById, filteredAccounts]
  )

  const pickerSummaryCards = useMemo(() => {
    let aliveCount = 0
    let limitedCount = 0
    let frozenCount = 0
    let bannedCount = 0
    let timeoutCount = 0

    for (const account of summaryScopedAccounts) {
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
      if (account.status === 'banned' || account.status === 'session_expired' || account.status === 'not_logged_in') {
        bannedCount += 1
        continue
      }
      if (account.status === 'timeout' || account.status === 'unknown' || account.status === 'checking') {
        timeoutCount += 1
      }
    }

    return [
      { key: 'all' as AccountPickerStatusFilter, label: '总数量', count: summaryScopedAccounts.length },
      { key: 'alive' as AccountPickerStatusFilter, label: '无限制', count: aliveCount },
      { key: 'limited-group' as AccountPickerStatusFilter, label: '双向', count: limitedCount },
      { key: 'frozen' as AccountPickerStatusFilter, label: '冻结', count: frozenCount },
      { key: 'banned' as AccountPickerStatusFilter, label: '封禁', count: bannedCount },
      { key: 'timeout-group' as AccountPickerStatusFilter, label: '超时/未检测', count: timeoutCount }
    ]
  }, [summaryScopedAccounts])

  const pickerCountries = useMemo(
    () => Array.from(new Set(accounts.map((account) => formatCountryDisplay(account.country, account.phone)).filter(Boolean))).map((value) => ({ label: value, value })),
    [accounts]
  )

  const pickerStatuses = useMemo(() => {
    const statusSamples = new Map<AccountStatus, AccountRecord>()
    let hasPremiumAccounts = false
    for (const account of accounts) {
      if (!statusSamples.has(account.status)) statusSamples.set(account.status, account)
      if (account.profile?.is_premium) hasPremiumAccounts = true
    }
    const options: Array<{ label: string; value: AccountPickerStatusFilter }> = Array.from(statusSamples.entries()).map(([value, sampleAccount]) => {
      const checkMode = sampleAccount?.profile?.check_mode === 'account-survival'
        ? 'account-survival'
        : sampleAccount?.profile?.check_mode === 'account-status'
          ? 'account-status'
          : null
      return {
        label: formatAccountStatus(value, typeof sampleAccount?.profile?.check_error === 'string' ? sampleAccount.profile.check_error : null, checkMode),
        value
      }
    })
    options.unshift(
      { label: '超时/未检测', value: 'timeout-group' },
      { label: '双向', value: 'limited-group' }
    )
    if (hasPremiumAccounts) {
      options.unshift({ label: '会员', value: 'premium' })
    }
    return options
  }, [accounts])

  const pickerProxies = useMemo(
    () => Array.from(new Set(accounts.map((account) => readProxy(account)).filter(Boolean))).map((value) => ({ label: value, value })),
    [accounts]
  )

  const pickerPresenceOptions = useMemo(
    () => [
      { label: '有', value: 'has' },
      { label: '无', value: 'none' }
    ],
    []
  )

  const selectedCount = draftIds.length

  const applyPicker = () => {
    const nextIds = draftIds.filter((id) => !(busyMetaById.get(id)?.busy ?? false))
    onConfirm(selectionMode === 'single' ? nextIds.slice(0, 1) : nextIds)
    onClose()
  }

  const handleSelectRange = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    const normalizedStart = Math.max(1, Math.min(start, end))
    const normalizedEnd = Math.max(start, end)
    const ids = filteredAccounts
      .filter((account) => !(busyMetaById.get(account.id)?.busy ?? false))
      .slice(normalizedStart - 1, normalizedEnd)
      .map((account) => account.id)
    setDraftIds(ids)
    setRangeMenuOpen(false)
  }

  const toggleAccount = (accountId: number, checked: boolean) => {
    if (selectionMode === 'single') {
      setDraftIds(checked ? [accountId] : [])
      return
    }
    setDraftIds((current) => checked ? [...current, accountId] : current.filter((id) => id !== accountId))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-[1320px] rounded-[24px] border border-white/[0.06] bg-[#11131c] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">{title}</div>
            <div className="mt-1 text-sm text-textMuted">{subtitle}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <div className="text-sm text-textMuted">
            当前结果 <span className="font-semibold text-white">{filteredAccounts.length}</span> 个，已勾选 <span className="font-semibold text-white">{selectedCount}</span> 个，可执行 <span className="font-semibold text-white">{selectableFilteredAccounts.length}</span> 个。
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {selectionMode === 'single' ? (
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="inline-flex h-11 items-center rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
              >
                {clearText}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] hover:text-white"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={applyPicker}
              className="inline-flex h-11 items-center rounded-[12px] bg-violet-500 px-5 text-sm font-medium text-white transition hover:bg-violet-400"
            >
              {confirmText}
            </button>
          </div>
        </div>

        <AccountSummaryCards
          items={pickerSummaryCards}
          activeFilter={accountStatusFilter}
          onSelect={(value) => setAccountStatusFilter(value as AccountPickerStatusFilter)}
        />

        <div className="mb-4 space-y-3">
          <div className="min-w-0">
            <TableFilters
              search={accountKeyword}
              countryFilter={accountCountryFilter}
              statusFilter={accountStatusFilter === 'all' ? '' : accountStatusFilter}
              proxyFilter={accountProxyFilter}
              twoFactorFilter={accountTwoFactorFilter}
              avatarFilter={accountAvatarFilter}
              taskFilter={accountTaskFilter}
              usernameFilter={accountUsernameFilter}
              countries={pickerCountries}
              statuses={pickerStatuses}
              proxies={pickerProxies}
              presences={pickerPresenceOptions}
              onSearchChange={setAccountKeyword}
              onCountryChange={setAccountCountryFilter}
              onStatusChange={(value) => setAccountStatusFilter((value || 'all') as AccountPickerStatusFilter)}
              onProxyChange={setAccountProxyFilter}
              onTwoFactorChange={(value) => setAccountTwoFactorFilter((value || 'all') as AccountPickerPresenceFilter)}
              onAvatarChange={(value) => setAccountAvatarFilter((value || 'all') as AccountPickerPresenceFilter)}
              onTaskChange={(value) => setAccountTaskFilter((value || 'all') as AccountPickerPresenceFilter)}
              onUsernameChange={(value) => setAccountUsernameFilter((value || 'all') as AccountPickerPresenceFilter)}
              onRefresh={() => {
                setAccountKeyword('')
                setAccountCountryFilter('')
                setAccountStatusFilter('all')
                setAccountProxyFilter('')
                setAccountTwoFactorFilter('all')
                setAccountAvatarFilter('all')
                setAccountTaskFilter('all')
                setAccountUsernameFilter('all')
              }}
            />
          </div>
          {selectionMode === 'multiple' ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setDraftIds(selectableFilteredAccounts.map((account) => account.id))}
                className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]"
              >
                全选当前结果
              </button>
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              >
                取消选中
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRangeMenuOpen((value) => !value)}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]"
                >
                  选择区间
                  <ChevronDown size={15} className={`transition ${rangeMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {rangeMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[240px] rounded-[14px] border border-white/8 bg-card p-3 shadow-2xl">
                    <div className="mb-2 text-xs tracking-[0.2em] text-textMuted">选择区间号</div>
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={rangeStart}
                        onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))}
                        className="h-10 w-full rounded-[10px] bg-panel px-3 text-sm text-white outline-none transition focus:bg-hover"
                      />
                      <span className="text-sm text-textMuted">-</span>
                      <input
                        inputMode="numeric"
                        value={rangeEnd}
                        onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))}
                        className="h-10 w-full rounded-[10px] bg-panel px-3 text-sm text-white outline-none transition focus:bg-hover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectRange}
                      className="mt-3 h-10 w-full rounded-[10px] bg-neon/10 text-sm font-medium text-neonSoft transition hover:bg-neon/14"
                    >
                      应用区间
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="max-h-[520px] overflow-auto rounded-[16px] border border-white/[0.06] bg-black/[0.08]">
          {loading ? (
            <div className="px-4 py-6 text-sm text-textMuted">账号列表读取中…</div>
          ) : filteredAccounts.length > 0 ? (
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[52px_64px_180px_126px_118px_88px_240px_128px_128px] gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs text-textMuted">
                <label className="flex items-center justify-center">
                  {selectionMode === 'multiple' ? (
                    <input
                      type="checkbox"
                      className={checkboxClass()}
                      checked={selectableFilteredAccounts.length > 0 && selectableFilteredAccounts.every((account) => draftIds.includes(account.id))}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          setDraftIds(selectableFilteredAccounts.map((account) => account.id))
                        } else {
                          setDraftIds([])
                        }
                      }}
                    />
                  ) : (
                    <span>选择</span>
                  )}
                </label>
                <div className="text-center">序号</div>
                <div>手机号</div>
                <div>国家</div>
                <div>状态</div>
                <div className="text-center">头像</div>
                <div>名字</div>
                <div>任务</div>
                <div>网络</div>
              </div>

              {filteredAccounts.map((account, index) => {
                const checked = draftIds.includes(account.id)
                const busyMeta = busyMetaById.get(account.id) ?? { busy: false }
                const disabled = busyMeta.busy
                const checkMode = account.profile?.check_mode === 'account-survival' ? 'account-survival' : 'account-status'
                return (
                  <label
                    key={account.id}
                    className={`grid cursor-pointer grid-cols-[52px_64px_180px_126px_118px_88px_240px_128px_128px] items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-sm transition ${checked ? 'bg-violet-400/10' : 'hover:bg-white/[0.03]'} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
                  >
                    <div className="flex items-center justify-center">
                      <input
                        type={selectionMode === 'single' ? 'radio' : 'checkbox'}
                        name={selectionMode === 'single' ? 'account-picker-single' : undefined}
                        className={checkboxClass()}
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => toggleAccount(account.id, event.currentTarget.checked)}
                      />
                    </div>
                    <div className="text-center text-slate-300">{index + 1}</div>
                    <div className="min-w-0 text-white" title={account.phone || '--'}>{account.phone || '--'}</div>
                    <CountryCell country={account.country} phone={account.phone} />
                    <div className="flex justify-center">
                      <StatusBadge
                        status={account.status}
                        errorMessage={typeof account.profile?.check_error === 'string' ? account.profile.check_error : null}
                        checkMode={checkMode}
                      />
                    </div>
                    <div className="flex justify-center">
                      <AvatarCell account={account} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-white">{readAccountLabel(account)}</div>
                      <div className="mt-1 truncate text-xs text-textMuted">{account.username ? `@${account.username.replace(/^@+/, '')}` : '无用户名'}</div>
                    </div>
                    <div>
                      {busyMeta.label ? (
                        <span className={`inline-flex rounded-full border px-2 py-[3px] text-[11px] leading-none ${busyMeta.tone || 'border-white/[0.08] bg-white/[0.04] text-slate-200'}`}>
                          {busyMeta.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-slate-300">{readProxy(account)}</div>
                  </label>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-textMuted">当前筛选下没有可选账号。</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:bg-white/[0.08]">{cancelText}</button>
          <button type="button" onClick={applyPicker} className="h-11 rounded-[12px] bg-violet-500 px-5 text-sm font-medium text-white transition hover:bg-violet-400">{confirmText}</button>
        </div>
      </div>
    </div>
  )
})
