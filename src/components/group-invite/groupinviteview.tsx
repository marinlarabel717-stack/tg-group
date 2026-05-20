import { memo, useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CheckCircle2, Clock3, Play, Search, Square, Upload, Users, X } from 'lucide-react'
import type { AccountRecord } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS, SOFT_NOTICE_CLASS, SOFT_PANEL_INPUT_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { parseGroupInviteTargets, useGroupInviteStore, type GroupInviteTabKey, type GroupInviteTaskSnapshot } from '../../stores/groupinvitestore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'

const tabs: Array<{ key: GroupInviteTabKey; label: string; icon: typeof Play }> = [
  { key: 'settings', label: '邀请设置', icon: Users },
  { key: 'logs', label: '执行日志', icon: Clock3 }
]

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function getAccountStatusTone(status?: string) {
  if (status === 'alive') return 'bg-emerald-400/12 text-emerald-300'
  if (status === 'limited') return 'bg-yellow-400/12 text-yellow-200'
  if (status === 'temporary_limited') return 'bg-orange-400/12 text-orange-300'
  if (status === 'geo_restricted') return 'bg-lime-400/12 text-lime-300'
  if (status === 'frozen') return 'bg-sky-400/12 text-sky-300'
  if (status === 'multi_ip') return 'bg-pink-400/12 text-pink-300'
  if (status === 'timeout') return 'bg-violet-400/12 text-violet-300'
  if (status === 'banned' || status === 'session_expired' || status === 'not_logged_in') return 'bg-rose-400/12 text-rose-300'
  return 'bg-white/10 text-slate-200'
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

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  useEffect(() => {
    if (!pickerOpen) {
      setDraftIds(selectedAccountIds)
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
  const filteredAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const fullName = readAccountLabel(account).toLowerCase()
      return [fullName, account.phone || '', account.username || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [accountKeyword, accounts])
  const selectableFilteredAccounts = useMemo(
    () => filteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, filteredAccounts]
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

  const applyPicker = () => {
    const nextIds = draftIds.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied)
    setSelectedAccountIds(nextIds)
    if (!nextIds.includes(groupSourceAccountId ?? -1)) {
      setGroupSourceAccountId(nextIds[0] ?? null)
    }
    setPickerOpen(false)
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

        <FoldSection title="选择目标群组" hint="用一个已入群账号读取群列表，支持搜索后直接点选。">
          <ConfigRow label="读取账号" hint="用于拉取目标群组列表。" wide>
            <div className="flex gap-3">
              <select
                value={groupSourceAccountId ?? ''}
                onChange={(event) => setGroupSourceAccountId(event.target.value ? Number(event.target.value) : null)}
                className={`h-11 min-w-0 flex-1 rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
              >
                <option value="">请选择账号</option>
                {selectedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.phone || readAccountLabel(account)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void refreshGroups()}
                disabled={loadingGroups || !groupSourceAccountId}
                className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingGroups ? '读取中…' : '刷新群组'}
              </button>
            </div>
          </ConfigRow>

          <ConfigRow label="群组搜索" hint="支持按群名、@username 搜索。" wide>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                placeholder="搜索群组"
                className={`h-11 w-full rounded-[12px] pl-9 pr-3 ${SOFT_INPUT_CLASS}`}
              />
            </div>
          </ConfigRow>

          <ConfigRow label="目标群组" hint="从当前读取结果里选一个目标群。" wide>
            <div className="space-y-3">
              {selectedGroup ? (
                <div className="rounded-[14px] border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
                  当前已选：{selectedGroup.title} {selectedGroup.username ? `(${selectedGroup.username})` : ''}
                </div>
              ) : selectedGroupTitle ? (
                <div className="rounded-[14px] border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
                  当前已选：{selectedGroupTitle}
                </div>
              ) : null}

              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {filteredGroups.length > 0 ? filteredGroups.map((group) => {
                  const active = group.targetRef === selectedGroupRef || group.username === selectedGroupRef
                  return (
                    <button
                      key={`${group.peerId}_${group.targetRef}`}
                      type="button"
                      onClick={() => setSelectedGroup(group)}
                      className={`w-full rounded-[14px] border px-4 py-3 text-left transition ${active ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : 'border-white/[0.06] bg-black/[0.08] text-slate-200 hover:bg-white/[0.03]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">{group.title}</div>
                          <div className="mt-1 text-xs text-textMuted">{group.username || group.targetRef}</div>
                        </div>
                        <div className="text-right text-xs text-textMuted">
                          <div>{group.type === 'supergroup' ? '超级群' : '普通群'}</div>
                          <div>{group.memberCount ? `${group.memberCount} 人` : '人数未知'}</div>
                        </div>
                      </div>
                    </button>
                  )
                }) : (
                  <div className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-5 text-sm text-textMuted">
                    {loadingGroups ? '正在读取群组列表…' : '当前没有可选群组。'}
                  </div>
                )}
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
            disabled={running || stopping || selectedAccountIds.length === 0 || !selectedGroupRef || parsedSummary.items.length === 0}
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

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-[960px] rounded-[24px] border border-white/[0.06] bg-[#11131c] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">选择执行账号</div>
                <div className="mt-1 text-sm text-textMuted">支持多选，已被其他任务占用的账号会自动禁用。</div>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-full p-2 text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={accountKeyword}
                  onChange={(event) => setAccountKeyword(event.target.value)}
                  placeholder="搜索手机号 / 昵称 / 用户名"
                  className={`h-11 w-full rounded-[12px] pl-9 pr-3 ${SOFT_INPUT_CLASS}`}
                />
              </div>
              <button
                type="button"
                onClick={() => setDraftIds(selectableFilteredAccounts.map((account) => account.id))}
                className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]"
              >
                选中当前列表
              </button>
            </div>

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {loadingAccounts ? (
                <div className="rounded-[14px] border border-white/[0.06] bg-black/[0.08] px-4 py-6 text-sm text-textMuted">账号列表读取中…</div>
              ) : filteredAccounts.map((account) => {
                const checked = draftIds.includes(account.id)
                const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
                const disabled = taskMeta.occupied
                return (
                  <button
                    key={account.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setDraftIds((current) => checked ? current.filter((id) => id !== account.id) : [...current, account.id])
                    }}
                    className={`w-full rounded-[14px] border px-4 py-3 text-left transition ${checked ? 'border-violet-400/20 bg-violet-400/10' : 'border-white/[0.06] bg-black/[0.08] hover:bg-white/[0.03]'} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{account.phone || readAccountLabel(account)}</div>
                        <div className="mt-1 truncate text-xs text-textMuted">{readAccountLabel(account)} {account.username ? `· @${account.username.replace(/^@+/, '')}` : ''}</div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs ${getAccountStatusTone(account.status)}`}>{formatAccountStatus(account.status)}</span>
                        {disabled ? <span className="rounded-full border border-amber-300/16 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-200">{taskMeta.label}</span> : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setPickerOpen(false)} className="h-11 rounded-[12px] border border-white/[0.06] bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:bg-white/[0.08]">取消</button>
              <button type="button" onClick={applyPicker} className="h-11 rounded-[12px] bg-violet-500 px-5 text-sm font-medium text-white transition hover:bg-violet-400">确认选择</button>
            </div>
          </div>
        </div>
      ) : null}
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
      subtitle={snapshot.groupTitle || '群组成员邀请管理'}
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
