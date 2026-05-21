import { memo, useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CheckCircle2, ChevronDown, Clock3, Play, Search, Square, Upload, Users, X } from 'lucide-react'
import * as FlagIcons from 'country-flag-icons/react/3x2'
import type { AccountRecord, AccountStatus } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_NOTICE_CLASS, SOFT_PANEL_INPUT_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { AccountSummaryCards } from '../accounts/accountsummarycards'
import { AccountPickerDialog } from '../accounts/accountpickerdialog'
import { StatusBadge } from '../accounts/statusbadge'
import { TableFilters } from '../accounts/tablefilters'
import { useAccountStore } from '../../stores/accountstore'
import { parseGroupInviteTargets, useGroupInviteStore, type GroupInviteTabKey, type GroupInviteTaskSnapshot } from '../../stores/groupinvitestore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { resolveCountryMeta } from '../../lib/phone-country'
import { formatAccountStatus, formatCountryDisplay } from '../../lib/ui-text'

const tabs: Array<{ key: GroupInviteTabKey; label: string; icon: typeof Play }> = [
  { key: 'settings', label: '邀请设置', icon: Users },
  { key: 'logs', label: '执行日志', icon: Clock3 }
]

type GroupInviteAccountStatusFilter = 'all' | AccountStatus | 'premium' | 'limited-group' | 'timeout-group'
type PresenceFilter = 'all' | 'has' | 'none'

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

function matchesAccountStatusFilter(account: AccountRecord, filter: GroupInviteAccountStatusFilter) {
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

function matchesPresenceFilter(hasValue: boolean, filter: PresenceFilter) {
  if (filter === 'has') return hasValue
  if (filter === 'none') return !hasValue
  return true
}

function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getResultTone(snapshot: GroupInviteTaskSnapshot) {
  if (snapshot.failedCount === 0) return 'success'
  if (snapshot.successCount === 0) return 'danger'
  return 'warning'
}

const TabBar = memo(function TabBar() {
  const activeTab = useGroupInviteStore((state) => state.activeTab)
  const setActiveTab = useGroupInviteStore((state) => state.setActiveTab)

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = activeTab === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-300' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
})

const SettingsWorkbench = memo(function SettingsWorkbench() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loadingAccounts = useAccountStore((state) => state.loading)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const init = useGroupInviteStore((state) => state.init)
  const setActiveTab = useGroupInviteStore((state) => state.setActiveTab)
  const selectedAccountIds = useGroupInviteStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useGroupInviteStore((state) => state.setSelectedAccountIds)
  const groupSourceAccountId = useGroupInviteStore((state) => state.groupSourceAccountId)
  const setGroupSourceAccountId = useGroupInviteStore((state) => state.setGroupSourceAccountId)
  const groups = useGroupInviteStore((state) => state.groups)
  const groupSearch = useGroupInviteStore((state) => state.groupSearch)
  const setGroupSearch = useGroupInviteStore((state) => state.setGroupSearch)
  const selectedGroupRef = useGroupInviteStore((state) => state.selectedGroupRef)
  const selectedGroupTitle = useGroupInviteStore((state) => state.selectedGroupTitle)
  const setSelectedGroup = useGroupInviteStore((state) => state.setSelectedGroup)
  const setSelectedGroupRef = useGroupInviteStore((state) => state.setSelectedGroupRef)
  const targetInput = useGroupInviteStore((state) => state.targetInput)
  const setTargetInput = useGroupInviteStore((state) => state.setTargetInput)
  const inviteIntervalSeconds = useGroupInviteStore((state) => state.inviteIntervalSeconds)
  const setInviteIntervalSeconds = useGroupInviteStore((state) => state.setInviteIntervalSeconds)
  const accountFrequencySeconds = useGroupInviteStore((state) => state.accountFrequencySeconds)
  const setAccountFrequencySeconds = useGroupInviteStore((state) => state.setAccountFrequencySeconds)
  const retryWaitSeconds = useGroupInviteStore((state) => state.retryWaitSeconds)
  const setRetryWaitSeconds = useGroupInviteStore((state) => state.setRetryWaitSeconds)
  const perRoundLimit = useGroupInviteStore((state) => state.perRoundLimit)
  const setPerRoundLimit = useGroupInviteStore((state) => state.setPerRoundLimit)
  const riskWaitSeconds = useGroupInviteStore((state) => state.riskWaitSeconds)
  const setRiskWaitSeconds = useGroupInviteStore((state) => state.setRiskWaitSeconds)
  const running = useGroupInviteStore((state) => state.running)
  const stopping = useGroupInviteStore((state) => state.stopping)
  const loadingGroups = useGroupInviteStore((state) => state.loadingGroups)
  const lastActionMessage = useGroupInviteStore((state) => state.lastActionMessage)
  const startTask = useGroupInviteStore((state) => state.startTask)
  const stopTask = useGroupInviteStore((state) => state.stopTask)
  const refreshGroups = useGroupInviteStore((state) => state.refreshGroups)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<number[]>(selectedAccountIds)
  const [accountKeyword, setAccountKeyword] = useState('')
  const [accountCountryFilter, setAccountCountryFilter] = useState('')
  const [accountStatusFilter, setAccountStatusFilter] = useState<GroupInviteAccountStatusFilter>('all')
  const [accountProxyFilter, setAccountProxyFilter] = useState('')
  const [accountTwoFactorFilter, setAccountTwoFactorFilter] = useState<PresenceFilter>('all')
  const [accountAvatarFilter, setAccountAvatarFilter] = useState<PresenceFilter>('all')
  const [accountTaskFilter, setAccountTaskFilter] = useState<PresenceFilter>('all')
  const [accountUsernameFilter, setAccountUsernameFilter] = useState<PresenceFilter>('all')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  useEffect(() => {
    if (!pickerOpen) {
      setDraftIds(selectedAccountIds)
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
    }
  }, [pickerOpen, selectedAccountIds])

  useEffect(() => {
    const validIds = selectedAccountIds.filter((id) => accounts.some((account) => account.id === id))
    if (validIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validIds)
    }
  }, [accounts, selectedAccountIds, setSelectedAccountIds])

  useEffect(() => {
    if (!groupSourceAccountId && selectedAccountIds.length > 0) {
      setGroupSourceAccountId(selectedAccountIds[0])
    }
  }, [groupSourceAccountId, selectedAccountIds, setGroupSourceAccountId])

  const deferredTargetInput = useDeferredValue(targetInput)
  const parsedSummary = useMemo(() => parseGroupInviteTargets(deferredTargetInput), [deferredTargetInput])
  const selectedSet = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds])
  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedSet.has(account.id)), [accounts, selectedSet])
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
      if (accountProxyFilter && readProxy(account) !== accountProxyFilter) return false
      if (!matchesPresenceFilter(Boolean(readTwoFactor(account)), accountTwoFactorFilter)) return false
      if (!matchesPresenceFilter(hasAvatar(account), accountAvatarFilter)) return false
      if (!matchesPresenceFilter(getAccountTaskMeta(accountTaskStatusMap, account.id).occupied, accountTaskFilter)) return false
      if (!matchesPresenceFilter(hasUsername(account), accountUsernameFilter)) return false
      return true
    }),
    [accountAvatarFilter, accountProxyFilter, accountTaskFilter, accountTaskStatusMap, accountTwoFactorFilter, accountUsernameFilter, basePickerAccounts]
  )
  const filteredAccounts = useMemo(
    () => summaryScopedAccounts.filter((account) => matchesAccountStatusFilter(account, accountStatusFilter)),
    [accountStatusFilter, summaryScopedAccounts]
  )
  const selectableFilteredAccounts = useMemo(
    () => filteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, filteredAccounts]
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
      { key: 'all' as GroupInviteAccountStatusFilter, label: '总数量', count: summaryScopedAccounts.length },
      { key: 'alive' as GroupInviteAccountStatusFilter, label: '无限制', count: aliveCount },
      { key: 'limited-group' as GroupInviteAccountStatusFilter, label: '双向', count: limitedCount },
      { key: 'frozen' as GroupInviteAccountStatusFilter, label: '冻结', count: frozenCount },
      { key: 'banned' as GroupInviteAccountStatusFilter, label: '封禁', count: bannedCount },
      { key: 'timeout-group' as GroupInviteAccountStatusFilter, label: '超时/未检测', count: timeoutCount }
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
    const options: Array<{ label: string; value: GroupInviteAccountStatusFilter }> = Array.from(statusSamples.entries()).map(([value, sampleAccount]) => {
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
  const filteredGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase()
    if (!keyword) return groups
    return groups.filter((group) => [group.title, group.username || '', group.targetRef || ''].some((value) => value.toLowerCase().includes(keyword)))
  }, [groupSearch, groups])
  const selectedGroup = useMemo(
    () => groups.find((group) => group.targetRef === selectedGroupRef || group.username === selectedGroupRef) ?? null,
    [groups, selectedGroupRef]
  )

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setTargetInput(targetInput.trim() ? `${targetInput.trim()}\n${content.trim()}` : content.trim())
    event.target.value = ''
  }

  const applyPicker = (nextDraftIds = draftIds) => {
    const nextIds = nextDraftIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied)
    setSelectedAccountIds(nextIds)
    if (!nextIds.includes(groupSourceAccountId ?? -1)) {
      setGroupSourceAccountId(nextIds[0] ?? null)
    }
    setPickerOpen(false)
  }

  const handleSelectRange = () => {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    const normalizedStart = Math.max(1, Math.min(start, end))
    const normalizedEnd = Math.max(start, end)
    const ids = filteredAccounts
      .filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied)
      .slice(normalizedStart - 1, normalizedEnd)
      .map((account) => account.id)
    setDraftIds(ids)
    setRangeMenuOpen(false)
  }

  const handleStart = async () => {
    try {
      await startTask()
      setActiveTab('logs')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '启动邀请任务失败，请稍后再试。')
    }
  }

  const handleStop = async () => {
    try {
      await stopTask()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '停止邀请任务失败，请稍后再试。')
    }
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="space-y-4 rounded-[22px] px-5 py-5">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[160px] flex-1 rounded-[18px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">已选账号</div>
            <div className="mt-2 text-2xl font-semibold text-white">{selectedAccountIds.length}</div>
          </div>
          <div className="min-w-[160px] flex-1 rounded-[18px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">可执行联系人</div>
            <div className="mt-2 text-2xl font-semibold text-white">{parsedSummary.items.length}</div>
          </div>
          <div className="min-w-[160px] flex-1 rounded-[18px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">格式无效</div>
            <div className="mt-2 text-2xl font-semibold text-white">{parsedSummary.invalids.length}</div>
          </div>
          <div className="min-w-[160px] flex-1 rounded-[18px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">重复目标</div>
            <div className="mt-2 text-2xl font-semibold text-white">{parsedSummary.duplicates.length}</div>
          </div>
        </div>

        <div className={`rounded-[16px] px-4 py-3 text-sm ${SOFT_NOTICE_CLASS} text-slate-200`}>
          {lastActionMessage || '先选账号、选群组，再导入联系人即可开始邀请。'}
        </div>
      </GlassPanel>

      <GlassPanel className="space-y-4 rounded-[22px] px-5 py-5">
        <FoldSection title="选择执行账号" hint="支持单号或多号执行，账号被别的任务占用时会自动禁用。">
          <ConfigRow label="执行账号" hint="点击弹窗列表选择执行账号。" wide>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={running || stopping}
                className="h-11 w-full rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                已选 {selectedAccountIds.length} 个账号
              </button>
              {selectedAccounts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedAccounts.map((account) => (
                    <span key={account.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                      {account.phone || readAccountLabel(account)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-4 py-3 text-sm text-textMuted">
                  还没有选择执行账号。
                </div>
              )}
            </div>
          </ConfigRow>
        </FoldSection>

        <FoldSection title="目标群设置" hint="目标群直接手动填写；执行账号会先尝试自动加入，再邀请导入的用户名或手机号。">
          <ConfigRow label="目标群" hint="支持 @群用户名、群链接、邀请链接。" wide>
            <div className="space-y-3">
              <input
                value={selectedGroupRef}
                onChange={(event) => setSelectedGroupRef(event.target.value)}
                placeholder="例如：@mygroup / https://t.me/mygroup / https://t.me/+xxxx"
                className={`h-11 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
              />
              <div className={`rounded-[12px] px-4 py-3 text-sm ${SOFT_NOTICE_CLASS}`}>
                填好目标群后，所选账号会自动尝试加入这个群，再邀请你导入的 @用户名 或手机号。
              </div>
            </div>
          </ConfigRow>
        </FoldSection>

        <FoldSection title="导入待邀请联系人" hint="支持 @username 和已保存联系人手机号，粘贴后会自动去重并过滤无效格式。">
          <ConfigRow label="联系人列表" hint="一行一个，或用空格、逗号分隔。" wide>
            <div className="space-y-3">
              <textarea
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                rows={8}
                placeholder={'@username\n+49123456789'}
                className={`w-full rounded-[14px] px-4 py-3 text-sm leading-6 ${SOFT_PANEL_INPUT_CLASS}`}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-textMuted">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                  <Upload size={14} />
                  从文本文件导入
                  <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileImport} />
                </label>
                <span>有效 {parsedSummary.items.length}</span>
                <span>重复 {parsedSummary.duplicates.length}</span>
                <span>无效 {parsedSummary.invalids.length}</span>
              </div>
              {parsedSummary.invalids.length > 0 ? (
                <div className="rounded-[12px] border border-amber-300/16 bg-amber-300/8 px-4 py-3 text-xs text-amber-200">
                  已过滤无效项：{parsedSummary.invalids.slice(0, 20).join('，')}{parsedSummary.invalids.length > 20 ? ` 等 ${parsedSummary.invalids.length} 项` : ''}
                </div>
              ) : null}
            </div>
          </ConfigRow>
        </FoldSection>

        <FoldSection title="执行策略配置" hint="按正常客户端节奏做邀请，尽量降低高频异常操作。">
          <ConfigRow label="邀请间隔" hint="同一账号两次邀请之间的基础等待秒数。">
            <input type="number" min={1} value={inviteIntervalSeconds} onChange={(event) => setInviteIntervalSeconds(Number(event.target.value))} className={`h-11 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          </ConfigRow>
          <ConfigRow label="单账号执行频率" hint="同一账号持续执行时的最小节奏。">
            <input type="number" min={1} value={accountFrequencySeconds} onChange={(event) => setAccountFrequencySeconds(Number(event.target.value))} className={`h-11 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          </ConfigRow>
          <ConfigRow label="失败重试等待" hint="网络抖动等可重试失败会按这个时间再试一次。">
            <input type="number" min={0} value={retryWaitSeconds} onChange={(event) => setRetryWaitSeconds(Number(event.target.value))} className={`h-11 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          </ConfigRow>
          <ConfigRow label="每轮执行上限" hint="限制每个账号本轮最多处理多少个联系人。">
            <input type="number" min={1} value={perRoundLimit} onChange={(event) => setPerRoundLimit(Number(event.target.value))} className={`h-11 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          </ConfigRow>
          <ConfigRow label="风险等待时间" hint="遇到频率限制或风控时，至少等待多久再继续。">
            <input type="number" min={1} value={riskWaitSeconds} onChange={(event) => setRiskWaitSeconds(Number(event.target.value))} className={`h-11 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
          </ConfigRow>
        </FoldSection>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={running || stopping || selectedAccountIds.length === 0 || !selectedGroupRef.trim() || parsedSummary.items.length === 0}
            className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-violet-500 px-5 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play size={16} />
            开始邀请
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={!running}
            className="inline-flex h-12 items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.05] px-5 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square size={15} />
            停止任务
          </button>
        </div>
      </GlassPanel>

      <AccountPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        loading={loadingAccounts}
        selectedIds={selectedAccountIds}
        title="选择执行账号"
        subtitle="直接按账号管理那套表格来选，筛完后在顶部确认。"
        confirmText="确认选择账号"
        onConfirm={(ids) => applyPicker(ids)}
        resolveBusyMeta={(account) => {
          const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
          return { busy: taskMeta.occupied, label: taskMeta.label, tone: taskMeta.tone }
        }}
      />
    </div>
  )
})

const LogsWorkbench = memo(function LogsWorkbench() {
  const init = useGroupInviteStore((state) => state.init)
  const progressState = useGroupInviteStore((state) => state.progressState)
  const clearLogs = useGroupInviteStore((state) => state.clearLogs)
  const taskSnapshots = useGroupInviteStore((state) => state.taskSnapshots)
  const openCompletionDialog = useGroupInviteStore((state) => state.openCompletionDialog)

  useEffect(() => {
    init()
  }, [init])

  const logs = useMemo(() => [...(progressState?.logs ?? [])].reverse(), [progressState])

  return (
    <div className="space-y-4">
      <GlassPanel className="space-y-4 rounded-[22px] px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-white">执行日志</div>
            <div className="mt-1 text-sm text-textMuted">只显示：时间 / 手机号 / 当前进度。</div>
          </div>
          <button
            type="button"
            onClick={clearLogs}
            className="rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
          >
            清空日志
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-[16px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">总数</div>
            <div className="mt-2 text-2xl font-semibold text-white">{progressState?.total ?? 0}</div>
          </div>
          <div className="rounded-[16px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">已完成</div>
            <div className="mt-2 text-2xl font-semibold text-white">{progressState?.completed ?? 0}</div>
          </div>
          <div className="rounded-[16px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">成功</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">{progressState?.successCount ?? 0}</div>
          </div>
          <div className="rounded-[16px] border border-white/[0.06] bg-black/[0.12] px-4 py-3">
            <div className="text-xs text-textMuted">失败</div>
            <div className="mt-2 text-2xl font-semibold text-rose-300">{progressState?.failedCount ?? 0}</div>
          </div>
        </div>

        <div className="space-y-2">
          {logs.length > 0 ? logs.map((log) => {
            const tone = log.level === 'error' ? 'text-rose-300' : log.level === 'warning' ? 'text-amber-200' : log.level === 'success' ? 'text-emerald-300' : 'text-slate-200'
            return (
              <div key={log.id} className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-3">
                <div className="text-xs text-slate-400">[{formatDateTime(log.createdAt)}] [{log.accountPhone || '--'}]</div>
                <div className={`mt-2 text-sm leading-6 ${tone}`}>{log.message}</div>
              </div>
            )
          }) : (
            <div className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-8 text-center text-sm text-textMuted">
              还没有执行日志。
            </div>
          )}
        </div>
      </GlassPanel>

      <GlassPanel className="space-y-4 rounded-[22px] px-5 py-5">
        <div>
          <div className="text-base font-semibold text-white">结果记录</div>
          <div className="mt-1 text-sm text-textMuted">停止后的成功 / 失败明细会保留在这里，随时可以重新打开查看。</div>
        </div>

        <div className="space-y-3">
          {taskSnapshots.length > 0 ? taskSnapshots.map((snapshot) => {
            const tone = getResultTone(snapshot)
            return (
              <div key={snapshot.taskId} className="rounded-[16px] border border-white/[0.06] bg-black/[0.08] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{snapshot.groupTitle || '群组邀请任务'}</div>
                    <div className="mt-1 text-xs text-textMuted">完成时间：{formatDateTime(snapshot.finishedAt)}</div>
                    <div className="mt-1 text-xs text-textMuted">{snapshot.message}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs ${tone === 'success' ? 'border-emerald-400/18 bg-emerald-400/10 text-emerald-300' : tone === 'danger' ? 'border-rose-400/18 bg-rose-400/10 text-rose-300' : 'border-amber-400/18 bg-amber-400/10 text-amber-200'}`}>
                    {snapshot.stopped ? '已停止' : '已完成'}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <ResultStatCard label="总数" value={snapshot.total} tone="neutral" />
                  <ResultStatCard label="已处理" value={snapshot.completed} tone="info" />
                  <ResultStatCard label="成功" value={snapshot.successCount} tone="success" />
                  <ResultStatCard label="失败" value={snapshot.failedCount} tone="danger" />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => openCompletionDialog(snapshot.taskId)}
                    className="rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
                  >
                    查看明细
                  </button>
                </div>
              </div>
            )
          }) : (
            <div className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-8 text-center text-sm text-textMuted">
              还没有可查看的结果记录。
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  )
})

const ResultDialog = memo(function ResultDialog() {
  const completionDialogTaskId = useGroupInviteStore((state) => state.completionDialogTaskId)
  const taskSnapshots = useGroupInviteStore((state) => state.taskSnapshots)
  const closeCompletionDialog = useGroupInviteStore((state) => state.closeCompletionDialog)

  const snapshot = useMemo(
    () => taskSnapshots.find((item) => item.taskId === completionDialogTaskId) ?? null,
    [completionDialogTaskId, taskSnapshots]
  )

  if (!snapshot) return null

  const tone = getResultTone(snapshot)

  return (
    <ResultDialogShell
      open={Boolean(snapshot)}
      onClose={closeCompletionDialog}
      title={snapshot.stopped ? '邀请任务已停止' : '邀请任务已完成'}
      subtitle={snapshot.groupTitle || '群组邀请'}
      icon={<CheckCircle2 size={18} />}
      tone={tone}
      maxWidth="max-w-[920px]"
    >
      <ResultHero label="结果汇总" value={snapshot.message} tone={tone} />

      <div className="grid gap-3 md:grid-cols-4">
        <ResultStatCard label="总数" value={snapshot.total} tone="neutral" />
        <ResultStatCard label="已处理" value={snapshot.completed} tone="info" />
        <ResultStatCard label="成功" value={snapshot.successCount} tone="success" />
        <ResultStatCard label="失败" value={snapshot.failedCount} tone="danger" />
      </div>

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {snapshot.items.map((item, index) => {
          const rowTone = item.success ? 'text-emerald-300' : item.status === 'skipped' ? 'text-amber-200' : 'text-rose-300'
          return (
            <div key={`${snapshot.taskId}_${index}_${item.targetValue}`} className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{item.targetValue}</div>
                  <div className="mt-1 text-xs text-textMuted">执行账号：{item.accountPhone || '--'}</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs ${item.success ? 'border-emerald-400/18 bg-emerald-400/10 text-emerald-300' : item.status === 'skipped' ? 'border-amber-400/18 bg-amber-400/10 text-amber-200' : 'border-rose-400/18 bg-rose-400/10 text-rose-300'}`}>
                  {item.success ? (item.status === 'already' ? '已在群' : '成功') : item.status === 'skipped' ? '已跳过' : '失败'}
                </div>
              </div>
              <div className={`mt-2 text-sm leading-6 ${rowTone}`}>{item.message}</div>
            </div>
          )
        })}
      </div>

      <ResultPrimaryButton label="知道了" onClick={closeCompletionDialog} tone={tone} />
    </ResultDialogShell>
  )
})

export default function GroupInviteView() {
  const activeTab = useGroupInviteStore((state) => state.activeTab)

  return (
    <div className="space-y-5 pb-6">
      <TabBar />
      {activeTab === 'logs' ? <LogsWorkbench /> : <SettingsWorkbench />}
      <ResultDialog />
    </div>
  )
}
