import { memo, useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, Download, Play, Search, Trash2, Upload, Wand2, X } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, NumberRangeField, SOFT_INPUT_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'
import { parseAutoJoinTargets, useAutoJoinStore, type AutoJoinLogEntry, type AutoJoinTabKey, type AutoJoinTaskSnapshot } from '../../stores/autojoinstore'

const tabs: Array<{ key: AutoJoinTabKey; label: string; icon: typeof Play }> = [
  { key: 'tasks', label: '极速任务', icon: Play },
  { key: 'logs', label: '执行日志', icon: Clock3 },
  { key: 'links', label: '目标整理', icon: Wand2 }
]

const SOFT_PANEL_INPUT_CLASS = 'border border-white/[0.06] bg-panel text-white outline-none transition focus:border-white/[0.12] focus:bg-panel'

function readAccountLabel(account: { id: number; username?: string; phone?: string; userId?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  if (typeof account.userId === 'string' && account.userId.trim()) return account.userId.trim()
  return `账号#${account.id}`
}

function getAccountStatusTone(status?: string) {
  if (status === 'alive') return 'bg-emerald-400/12 text-emerald-300'
  if (status === 'limited') return 'bg-sky-400/12 text-sky-300'
  if (status === 'temporary_limited') return 'bg-orange-400/12 text-orange-300'
  if (status === 'geo_restricted') return 'bg-amber-300/12 text-amber-200'
  if (status === 'frozen') return 'bg-cyan-400/12 text-cyan-300'
  if (status === 'multi_ip') return 'bg-indigo-400/12 text-indigo-300'
  if (status === 'timeout') return 'bg-violet-400/12 text-violet-300'
  if (status === 'banned' || status === 'session_expired' || status === 'not_logged_in') return 'bg-rose-400/12 text-rose-200'
  if (status === 'checking') return 'bg-teal-400/12 text-teal-300'
  return 'bg-white/10 text-slate-200'
}

function getLogTone(log: AutoJoinLogEntry) {
  if (log.status === 'joined') return 'text-emerald-300'
  if (log.status === 'failed') return 'text-rose-300'
  if (log.status === 'requested' || log.status === 'already' || log.level === 'warning') return 'text-amber-200'
  return 'text-slate-200'
}

function formatLogTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function readCustomRangeIds<T extends { id: number }>(accounts: T[], startInput: string, endInput: string) {
  const start = Number(startInput)
  const end = Number(endInput)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [] as number[]
  const normalizedStart = Math.max(1, Math.min(start, end))
  const normalizedEnd = Math.min(accounts.length, Math.max(start, end))
  if (normalizedStart > normalizedEnd) return [] as number[]
  return accounts.slice(normalizedStart - 1, normalizedEnd).map((item) => item.id)
}

function toggleAccountRange(currentIds: number[], rangeIds: number[]) {
  const currentSet = new Set(currentIds)
  const fullySelected = rangeIds.every((id) => currentSet.has(id))
  if (fullySelected) {
    return currentIds.filter((id) => !rangeIds.includes(id))
  }
  const next = [...currentIds]
  rangeIds.forEach((id) => {
    if (!currentSet.has(id)) next.push(id)
  })
  return next
}


function buildAccountSummary(snapshot: AutoJoinTaskSnapshot | null) {
  if (!snapshot) return [] as Array<{ accountLabel: string; success: number; requested: number; already: number; failed: number; total: number }>
  const map = new Map<string, { accountLabel: string; success: number; requested: number; already: number; failed: number; total: number }>()
  snapshot.items.forEach((item) => {
    const key = item.accountLabel || '未分配账号'
    const current = map.get(key) ?? { accountLabel: key, success: 0, requested: 0, already: 0, failed: 0, total: 0 }
    current.total += 1
    if (item.status === 'joined') current.success += 1
    else if (item.status === 'requested') current.requested += 1
    else if (item.status === 'already') current.already += 1
    else if (item.status === 'failed') current.failed += 1
    map.set(key, current)
  })
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.accountLabel.localeCompare(b.accountLabel, 'zh-CN'))
}

const TabBar = memo(function TabBar() {
  const activeTab = useAutoJoinStore((state) => state.activeTab)
  const setActiveTab = useAutoJoinStore((state) => state.setActiveTab)

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

const TasksWorkbench = memo(function TasksWorkbench() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const init = useAutoJoinStore((state) => state.init)
  const selectedAccountIds = useAutoJoinStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useAutoJoinStore((state) => state.setSelectedAccountIds)
  const mode = useAutoJoinStore((state) => state.mode)
  const setMode = useAutoJoinStore((state) => state.setMode)
  const speedPreset = useAutoJoinStore((state) => state.speedPreset)
  const setSpeedPreset = useAutoJoinStore((state) => state.setSpeedPreset)
  const skipChannelsEnabled = useAutoJoinStore((state) => state.skipChannelsEnabled)
  const setSkipChannelsEnabled = useAutoJoinStore((state) => state.setSkipChannelsEnabled)
  const leaveMutedGroupsEnabled = useAutoJoinStore((state) => state.leaveMutedGroupsEnabled)
  const setLeaveMutedGroupsEnabled = useAutoJoinStore((state) => state.setLeaveMutedGroupsEnabled)
  const linkInput = useAutoJoinStore((state) => state.linkInput)
  const setLinkInput = useAutoJoinStore((state) => state.setLinkInput)
  const clearLinkInput = useAutoJoinStore((state) => state.clearLinkInput)
  const messageText = useAutoJoinStore((state) => state.messageText)
  const setMessageText = useAutoJoinStore((state) => state.setMessageText)
  const imageData = useAutoJoinStore((state) => state.imageData)
  const setImageData = useAutoJoinStore((state) => state.setImageData)
  const buttonText = useAutoJoinStore((state) => state.buttonText)
  const setButtonText = useAutoJoinStore((state) => state.setButtonText)
  const buttonUrl = useAutoJoinStore((state) => state.buttonUrl)
  const setButtonUrl = useAutoJoinStore((state) => state.setButtonUrl)
  const concurrency = useAutoJoinStore((state) => state.concurrency)
  const setConcurrency = useAutoJoinStore((state) => state.setConcurrency)
  const accountIntervalMin = useAutoJoinStore((state) => state.accountIntervalMin)
  const accountIntervalMax = useAutoJoinStore((state) => state.accountIntervalMax)
  const setAccountIntervalMin = useAutoJoinStore((state) => state.setAccountIntervalMin)
  const setAccountIntervalMax = useAutoJoinStore((state) => state.setAccountIntervalMax)
  const joinIntervalMin = useAutoJoinStore((state) => state.joinIntervalMin)
  const joinIntervalMax = useAutoJoinStore((state) => state.joinIntervalMax)
  const setJoinIntervalMin = useAutoJoinStore((state) => state.setJoinIntervalMin)
  const setJoinIntervalMax = useAutoJoinStore((state) => state.setJoinIntervalMax)
  const sendIntervalMin = useAutoJoinStore((state) => state.sendIntervalMin)
  const sendIntervalMax = useAutoJoinStore((state) => state.sendIntervalMax)
  const setSendIntervalMin = useAutoJoinStore((state) => state.setSendIntervalMin)
  const setSendIntervalMax = useAutoJoinStore((state) => state.setSendIntervalMax)
  const floodRestMin = useAutoJoinStore((state) => state.floodRestMin)
  const floodRestMax = useAutoJoinStore((state) => state.floodRestMax)
  const setFloodRestMin = useAutoJoinStore((state) => state.setFloodRestMin)
  const setFloodRestMax = useAutoJoinStore((state) => state.setFloodRestMax)
  const safeModeEnabled = useAutoJoinStore((state) => state.safeModeEnabled)
  const setSafeModeEnabled = useAutoJoinStore((state) => state.setSafeModeEnabled)
  const maxJoinsPerAccount = useAutoJoinStore((state) => state.maxJoinsPerAccount)
  const setMaxJoinsPerAccount = useAutoJoinStore((state) => state.setMaxJoinsPerAccount)
  const repeatJoinEnabled = useAutoJoinStore((state) => state.repeatJoinEnabled)
  const setRepeatJoinEnabled = useAutoJoinStore((state) => state.setRepeatJoinEnabled)
  const dispatchMode = useAutoJoinStore((state) => state.dispatchMode)
  const setDispatchMode = useAutoJoinStore((state) => state.setDispatchMode)
  const startTask = useAutoJoinStore((state) => state.startTask)
  const stopTask = useAutoJoinStore((state) => state.stopTask)
  const running = useAutoJoinStore((state) => state.running)
  const stopping = useAutoJoinStore((state) => state.stopping)
  const runtimeReady = useAutoJoinStore((state) => state.runtimeReady)
  const lastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const tasks = useAutoJoinStore((state) => state.tasks)
  const taskSnapshots = useAutoJoinStore((state) => state.taskSnapshots)

  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [draftAccountIds, setDraftAccountIds] = useState<number[]>(selectedAccountIds)
  const [accountSearch, setAccountSearch] = useState('')
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('10')

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  useEffect(() => {
    if (!accountPickerOpen) {
      setDraftAccountIds(selectedAccountIds)
    }
  }, [accountPickerOpen, selectedAccountIds])

  useEffect(() => {
    const validIds = selectedAccountIds.filter((id) => accounts.some((account) => account.id === id))
    if (validIds.length !== selectedAccountIds.length) {
      setSelectedAccountIds(validIds)
    }
  }, [accounts, selectedAccountIds, setSelectedAccountIds])

  useEffect(() => {
    if (!accountPickerOpen) return
    setRangeStart('1')
    setRangeEnd(String(Math.min(10, Math.max(accounts.length, 1))))
  }, [accountPickerOpen, accounts.length])

  const deferredLinkInput = useDeferredValue(linkInput)
  const summary = useMemo(() => parseAutoJoinTargets(deferredLinkInput), [deferredLinkInput])
  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const nickname = readAccountLabel(account).toLowerCase()
      return [nickname, account.username || '', account.phone || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [accountSearch, accounts])
  const selectableFilteredAccounts = useMemo(
    () => filteredAccounts.filter((account) => !getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, filteredAccounts]
  )
  const selectedAccounts = useMemo(() => accounts.filter((item) => selectedAccountIds.includes(item.id)), [accounts, selectedAccountIds])
  const occupiedSelectedAccounts = useMemo(
    () => selectedAccounts.filter((account) => getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, selectedAccounts]
  )

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setLinkInput(linkInput.trim() ? `${linkInput.trim()}\n${content.trim()}` : content.trim())
    event.target.value = ''
  }

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      setImageData(value)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const exportTargetsAsTxt = () => {
    const content = summary.items.map((item) => item.normalized).join('\n')
    if (!content) return
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'auto-join-targets.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const needsMessage = mode !== 'join-only'

  const applyAccountSelection = () => {
    setSelectedAccountIds(draftAccountIds.filter((accountId) => !getAccountTaskMeta(accountTaskStatusMap, accountId).occupied))
    setAccountPickerOpen(false)
  }

  const applySafePreset = () => {
    setSpeedPreset('safe')
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="基础配置" hint="每个参数一行，需要时展开修改，先把页面收口到更清爽。">
              <ConfigRow label="选择账号" hint={occupiedSelectedAccounts.length > 0 ? `有 ${occupiedSelectedAccounts.length} 个账号正在忙，先别拿来跑。` : '点右侧按钮选择本轮账号。'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white">已选 {selectedAccountIds.length} 个账号</div>
                  <button type="button" disabled={running || stopping} onClick={() => setAccountPickerOpen(true)} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">选择账号</button>
                </div>
              </ConfigRow>

              <ConfigRow label="执行模式" hint="只加群、边加边发、加完再发。">
                <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} disabled={running || stopping} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                  <option value="join-only" className="bg-white text-slate-950">只加群</option>
                  <option value="join-and-send" className="bg-white text-slate-950">边加边发</option>
                  <option value="join-then-send" className="bg-white text-slate-950">加完再发</option>
                </select>
              </ConfigRow>

              <ConfigRow label="执行节奏" hint="建议默认用稳妥。">
                <div className="flex flex-wrap items-center gap-3">
                  <select value={speedPreset} onChange={(event) => setSpeedPreset(event.target.value as typeof speedPreset)} disabled={running || stopping} className={`h-10 min-w-[140px] rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                    <option value="safe" className="bg-white text-slate-950">稳妥</option>
                    <option value="normal" className="bg-white text-slate-950">标准</option>
                    <option value="fast" className="bg-white text-slate-950">快速</option>
                  </select>
                  <button type="button" disabled={running || stopping} onClick={applySafePreset} className="rounded-[12px] bg-emerald-400/12 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-60">一键套用稳妥</button>
                </div>
              </ConfigRow>

              <ConfigRow label="防冻结保护" hint="开启后会强制更保守，并在高风险报错时尽快停号。">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{safeModeEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={safeModeEnabled} onChange={(event) => setSafeModeEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="每号最多加群" hint="建议 2-3 个。">
                <input type="number" min={1} max={20} value={maxJoinsPerAccount} onChange={(event) => setMaxJoinsPerAccount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <ConfigRow label="重复加群" hint="关闭后，成功/已在群/已申请的目标会自动从列表移除。">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{repeatJoinEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={repeatJoinEnabled} onChange={(event) => setRepeatJoinEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="遇到频道自动跳过">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{skipChannelsEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={skipChannelsEnabled} onChange={(event) => setSkipChannelsEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="禁言/无法发送自动退群">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{leaveMutedGroupsEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={leaveMutedGroupsEnabled} onChange={(event) => setLeaveMutedGroupsEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="添加顺序">
                <select value={dispatchMode} onChange={(event) => setDispatchMode(event.target.value as typeof dispatchMode)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                  <option value="sequential" className="bg-white text-slate-950">按顺序</option>
                  <option value="random" className="bg-white text-slate-950">随机添加</option>
                </select>
              </ConfigRow>
            </FoldSection>

            <div className="mt-4" />

            <FoldSection title="间隔配置" hint="不想细调就保持默认。" defaultOpen={false}>
              <NumberRangeField label="限流休息" minValue={floodRestMin} maxValue={floodRestMax} onMinChange={setFloodRestMin} onMaxChange={setFloodRestMax} min={1} max={600} />
              <NumberRangeField label="每号间隔" minValue={accountIntervalMin} maxValue={accountIntervalMax} onMinChange={setAccountIntervalMin} onMaxChange={setAccountIntervalMax} min={0} max={600} />
              <NumberRangeField label="加群间隔" minValue={joinIntervalMin} maxValue={joinIntervalMax} onMinChange={setJoinIntervalMin} onMaxChange={setJoinIntervalMax} min={0} max={600} />
              {needsMessage ? <NumberRangeField label="发送间隔" minValue={sendIntervalMin} maxValue={sendIntervalMax} onMinChange={setSendIntervalMin} onMaxChange={setSendIntervalMax} min={0} max={600} /> : null}
              <ConfigRow label="线程数" hint="通常 1 最稳。">
                <input type="number" min={1} max={Math.max(1, selectedAccountIds.length || 1)} value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Number(event.target.value) || 1))} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>
            </FoldSection>
          </GlassPanel>

          {needsMessage ? (
            <GlassPanel className="bg-card">
              <FoldSection title="发送内容配置" hint="支持文字、本地图片和一个跳转按钮。">
              <ConfigRow label="发送文案" wide>
                  <textarea
                    rows={6}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder="输入要发送的文字内容…"
                    className={`w-full rounded-[12px] px-3 py-3 ${SOFT_PANEL_INPUT_CLASS}`}
                  />
                </ConfigRow>

                <ConfigRow label="按钮文字">
                  <input value={buttonText} onChange={(event) => setButtonText(event.target.value)} placeholder="比如：立即查看" className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
                </ConfigRow>

                <ConfigRow label="按钮链接">
                  <input value={buttonUrl} onChange={(event) => setButtonUrl(event.target.value)} placeholder="https://..." className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
                </ConfigRow>

              <ConfigRow label="发送图片" wide>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                      <Upload size={14} /> 上传图片
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {imageData ? <button type="button" onClick={() => setImageData('')} className="rounded-[12px] bg-rose-400/12 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18">删除图片</button> : <span className="text-xs text-textMuted">未上传</span>}
                  </div>
                </ConfigRow>

              <ConfigRow label="发送预览" wide>
                  <div className="space-y-3 rounded-[14px] bg-panel/80 p-4 text-sm text-slate-200">
                    {imageData ? <img src={imageData} alt="发送预览" className="max-h-[220px] w-full rounded-[12px] object-cover" /> : <div className="rounded-[12px] border border-dashed border-white/[0.08] px-4 py-6 text-center text-textMuted">还没上传图片</div>}
                    <div className="whitespace-pre-wrap break-words">{messageText.trim() || '这里会显示发送文案。'}</div>
                    {buttonUrl.trim() ? <div className="inline-flex rounded-[12px] bg-violet-400/12 px-3 py-2 text-violet-200">{buttonText.trim() || '立即查看'}</div> : null}
                  </div>
                </ConfigRow>
              </FoldSection>
            </GlassPanel>
          ) : null}

          <GlassPanel className="bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-semibold text-white">加群目标</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportTargetsAsTxt} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Download size={14} /> TXT导出</button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                  <Upload size={14} /> 导入TXT
                  <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
                </label>
                <button type="button" onClick={clearLinkInput} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Trash2 size={14} /> 清空</button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">有效目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.items.length}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-xl font-semibold text-white">{summary.duplicates.length}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">格式不对</div><div className="mt-2 text-xl font-semibold text-white">{summary.invalids.length}</div></div>
            </div>

            <div className="mt-4">
              <textarea
                rows={12}
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="一行一个，支持 @username / t.me/xxx / t.me/+invite"
                className={`w-full rounded-[16px] px-4 py-4 ${SOFT_PANEL_INPUT_CLASS}`}
              />
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-textMuted">
                <div className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-violet-300">会自动去重和过滤无效格式</div>
                <div className="rounded-[12px] bg-white/[0.05] px-4 py-2.5">不勾选重复加群时，成功/已在群/已申请的目标会自动从列表移除</div>
                <div className="rounded-[12px] bg-emerald-400/12 px-4 py-2.5 text-emerald-300">开启防冻结保护后，会按更保守节奏执行，并限制每个号本轮最多加群数量</div>
              </div>
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4">
            <div className="text-base font-semibold text-white">任务操作</div>
            <div className="mt-3 space-y-3">
              <button type="button" disabled={running || !runtimeReady || occupiedSelectedAccounts.length > 0} onClick={() => void startTask()} className="w-full rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">{running ? '执行中' : '开始极速群发'}</button>
              <button type="button" disabled={!running || stopping} onClick={() => void stopTask()} className="w-full rounded-[12px] bg-rose-400/12 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50">{stopping ? '已停止' : '停止任务'}</button>
            </div>
            <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '点击开始后会自动跳到日志页。'}</div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">运行环境</div>
                <div className="mt-2 text-sm font-medium text-white">{runtimeReady ? '已接好' : '未接好'}</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">已选账号</div>
                <div className="mt-2 text-sm font-medium text-white">{selectedAccounts.length} 个</div>
              </div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3">
                <div className="text-xs tracking-[0.18em] text-textMuted">本轮目标</div>
                <div className="mt-2 text-sm font-medium text-white">{summary.items.length} 条</div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div className="text-lg font-semibold text-white">选择加群账号</div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="搜索手机号 / 账号名" className={`h-11 w-full rounded-[12px] pl-11 pr-4 text-sm ${SOFT_PANEL_INPUT_CLASS}`} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(selectableFilteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                </div>
              </div>

              {filteredAccounts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-textMuted">区间选择</div>
                  <input inputMode="numeric" value={rangeStart} onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))} placeholder="开始" className={`h-10 w-20 rounded-[12px] px-3 text-sm ${SOFT_PANEL_INPUT_CLASS}`} />
                  <span className="text-textMuted">-</span>
                  <input inputMode="numeric" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))} placeholder="结束" className={`h-10 w-20 rounded-[12px] px-3 text-sm ${SOFT_PANEL_INPUT_CLASS}`} />
                  <button
                    type="button"
                    onClick={() => {
                      const rangeIds = readCustomRangeIds(selectableFilteredAccounts, rangeStart, rangeEnd)
                      if (rangeIds.length === 0) return
                      setDraftAccountIds((current) => toggleAccountRange(current, rangeIds))
                    }}
                    className="rounded-[12px] bg-violet-400/12 px-4 py-2 text-sm text-violet-300 transition hover:bg-violet-400/18"
                  >
                    应用区间
                  </button>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[18px] border border-white/8 bg-panel">
                <div className="grid grid-cols-[64px_220px_1.4fr_160px] border-b border-white/6 px-4 py-3 text-xs uppercase tracking-[0.16em] text-textMuted">
                  <div>选择</div>
                  <div>手机号</div>
                  <div>账号名</div>
                  <div>状态</div>
                </div>

                <div className="max-h-[520px] overflow-y-auto">
                  {loading && accounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">正在读取账号...</div>
                  ) : filteredAccounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号</div>
                  ) : filteredAccounts.map((account) => {
                    const checked = draftAccountIds.includes(account.id)
                    const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
                    return (
                      <label key={account.id} className={`grid grid-cols-[64px_220px_1.4fr_160px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${taskMeta.occupied ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${checked ? 'bg-violet-400/10' : taskMeta.occupied ? '' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center"><input type="checkbox" checked={checked} disabled={taskMeta.occupied} onChange={(event) => setDraftAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} /></div>
                        <div className="truncate text-white">{account.phone || '—'}</div>
                        <div className="min-w-0">
                          <div className="truncate text-white">{readAccountLabel(account)}</div>
                          {taskMeta.occupied ? <div className="mt-1 text-xs text-textMuted">任务：{taskMeta.label}</div> : null}
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${getAccountStatusTone(account.status)}`}>
                            {formatAccountStatus(account.status)}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/8 bg-card px-5 py-4">
              <button type="button" onClick={() => setAccountPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
              <button type="button" onClick={applyAccountSelection} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-violet-300">应用账号选择</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
})

const LogsWorkbench = memo(function LogsWorkbench() {
  const logs = useAutoJoinStore((state) => state.logs)
  const clearLogs = useAutoJoinStore((state) => state.clearLogs)
  const stopTask = useAutoJoinStore((state) => state.stopTask)
  const running = useAutoJoinStore((state) => state.running)
  const stopping = useAutoJoinStore((state) => state.stopping)
  const lastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const tasks = useAutoJoinStore((state) => state.tasks)
  const taskSnapshots = useAutoJoinStore((state) => state.taskSnapshots)
  const latestTask = tasks[0] ?? null
  const latestSnapshot = useMemo(() => (latestTask ? taskSnapshots.find((item) => item.taskId === latestTask.id) ?? null : null), [latestTask, taskSnapshots])
  const accountSummary = useMemo(() => buildAccountSummary(latestSnapshot), [latestSnapshot])
  const pendingCount = latestTask
    ? latestTask.status === 'stopped' || stopping
      ? 0
      : Math.max(0, (latestTask.total || 0) - (latestTask.completed || 0))
    : 0
  const [accountSummaryExpanded, setAccountSummaryExpanded] = useState(false)
  const statusTitle = stopping
    ? '本次任务已停止'
    : latestTask
      ? latestTask.status === 'running'
        ? '本次任务进行中'
        : latestTask.status === 'stopped'
          ? '本次任务已停止'
          : '本次任务已完成'
      : '本次任务总计'

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-white">执行日志</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!running || stopping}
            onClick={() => void stopTask()}
            className="rounded-[12px] bg-rose-400/12 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stopping ? '已停止' : '停止任务'}
          </button>
          <button type="button" onClick={clearLogs} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">清空日志</button>
        </div>
      </div>

      <div className="mt-4 rounded-[16px] bg-panel/70 px-4 py-4">
        <div className="text-sm font-semibold text-white">{statusTitle}</div>
        <div className="mt-2 text-sm text-textMuted">{lastActionMessage || '这里会显示极速群发过程里的最新状态。'}</div>

        {latestTask ? (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              {latestTask.sendSuccessCount + latestTask.sendSkippedCount + latestTask.sendFailedCount > 0 ? (
                <>
                  <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-emerald-200/80">成功</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{latestTask.successCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-violet-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-violet-200/80">已在群</div>
                    <div className="mt-2 text-2xl font-semibold text-violet-300">{latestTask.alreadyCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-amber-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-amber-200/80">审核</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-200">{latestTask.requestedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-rose-200/80">失败</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-300">{latestTask.failedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-sky-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-sky-200/80">频道跳过</div>
                    <div className="mt-2 text-2xl font-semibold text-sky-300">{latestTask.channelSkippedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-cyan-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-cyan-200/80">发送成功</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-200">{latestTask.sendSuccessCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-amber-300/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-amber-100/80">跳过发送</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-100">{latestTask.sendSkippedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-rose-300/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-rose-100/80">发送失败</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-100">{latestTask.sendFailedCount ?? 0}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-emerald-200/80">可发言</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-300">{latestTask.speakableCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-amber-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-amber-200/80">需验证</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-200">{latestTask.requestedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-orange-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-orange-200/80">禁言群</div>
                    <div className="mt-2 text-2xl font-semibold text-orange-200">{latestTask.mutedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-violet-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-violet-200/80">已在群</div>
                    <div className="mt-2 text-2xl font-semibold text-violet-300">{latestTask.alreadyCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-sky-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-sky-200/80">频道跳过</div>
                    <div className="mt-2 text-2xl font-semibold text-sky-300">{latestTask.channelSkippedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-rose-200/80">失败</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-300">{latestTask.failedCount ?? 0}</div>
                  </div>
                  <div className="rounded-[14px] bg-slate-400/8 px-4 py-3">
                    <div className="text-xs tracking-[0.16em] text-slate-200/80">待加入</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-100">{pendingCount}</div>
                  </div>
                </>
              )}
            </div>

            {latestSnapshot ? (
              <div className="mt-4 rounded-[14px] bg-black/10 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">各账号群组数量</div>
                  {accountSummary.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setAccountSummaryExpanded((value) => !value)}
                      className="inline-flex items-center gap-1 text-sm text-violet-300 transition hover:text-violet-200"
                    >
                      {accountSummaryExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      {accountSummaryExpanded ? '收起' : `查看全部（${accountSummary.length}）`}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 space-y-2">
                  {(accountSummaryExpanded ? accountSummary : accountSummary.slice(0, 3)).map((item) => (
                    <div key={item.accountLabel} className="rounded-[12px] bg-white/[0.03] px-3 py-3 text-sm">
                      <div className="select-text text-white">{item.accountLabel}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-emerald-300">成功 {item.success}</span>
                        <span className="text-violet-300">已在群 {item.already}</span>
                        <span className="text-amber-200">审核 {item.requested}</span>
                        <span className="text-rose-300">失败 {item.failed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 font-mono text-sm select-text">
        {logs.length === 0 ? <div className="text-sm text-textMuted">还没有执行日志。</div> : null}
        {logs.map((log) => (
          <div key={log.id} className={`${getLogTone(log)} break-all cursor-text select-text`}>
            [{formatLogTime(log.createdAt)}] [{log.accountLabel || '系统'}] - {log.message}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const LinksWorkbench = memo(function LinksWorkbench() {
  const linkInput = useAutoJoinStore((state) => state.linkInput)
  const setLinkInput = useAutoJoinStore((state) => state.setLinkInput)
  const deferredLinkInput = useDeferredValue(linkInput)
  const summary = useMemo(() => parseAutoJoinTargets(deferredLinkInput), [deferredLinkInput])
  const cleaned = summary.items.map((item) => item.normalized).join('\n')

  const copyCleaned = async () => {
    if (!cleaned) return
    await navigator.clipboard.writeText(cleaned)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <GlassPanel className="bg-card" header={<div><div className="text-base font-semibold text-white">群链接整理</div><div className="mt-1 text-sm text-textMuted">这里专门整理链接，不混别的配置。</div></div>}>
        <textarea
          value={linkInput}
          onChange={(event) => setLinkInput(event.target.value)}
          placeholder="把原始群链接都贴这里，支持空格、逗号、换行混着贴。"
          className={`min-h-[420px] w-full rounded-[16px] px-4 py-4 ${SOFT_PANEL_INPUT_CLASS}`}
        />
      </GlassPanel>

      <div className="space-y-5">
        <GlassPanel className="bg-card" header={<div className="flex items-center justify-between gap-3"><div className="text-base font-semibold text-white">整理结果</div><button type="button" onClick={() => void copyCleaned()} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Copy size={14} /> 复制有效链接</button></div>}>
          <div className="grid gap-3">
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">有效目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.items.length}</div></div>
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-xl font-semibold text-white">{summary.duplicates.length}</div></div>
            <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">无效</div><div className="mt-2 text-xl font-semibold text-white">{summary.invalids.length}</div></div>
          </div>
          <div className="mt-4 rounded-[14px] bg-panel/80 p-4">
            <div className="text-sm font-medium text-white">有效链接</div>
            <div className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap text-sm text-slate-200 select-text cursor-text">{cleaned || '还没有可用的群链接。'}</div>
          </div>
        </GlassPanel>

        <GlassPanel className="bg-card" header={<div className="text-sm font-medium text-white">异常项</div>}>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">重复目标</div>
              <div className="max-h-[120px] overflow-auto whitespace-pre-wrap text-amber-200 select-text cursor-text">{summary.duplicates.join('\n') || '没有重复项。'}</div>
            </div>
            <div>
              <div className="mb-2 text-xs tracking-[0.18em] text-textMuted">无效目标</div>
              <div className="max-h-[120px] overflow-auto whitespace-pre-wrap text-rose-200 select-text cursor-text">{summary.invalids.join('\n') || '没有无效项。'}</div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  )
})

export default function AutoJoinView() {
  const activeTab = useAutoJoinStore((state) => state.activeTab)
  const taskSnapshots = useAutoJoinStore((state) => state.taskSnapshots)
  const tasks = useAutoJoinStore((state) => state.tasks)
  const completionDialogTaskId = useAutoJoinStore((state) => state.completionDialogTaskId)
  const closeCompletionDialog = useAutoJoinStore((state) => state.closeCompletionDialog)
  const completionSnapshot = useMemo(() => taskSnapshots.find((item) => item.taskId === completionDialogTaskId) ?? null, [completionDialogTaskId, taskSnapshots])
  const completionTask = useMemo(() => tasks.find((item) => item.id === completionDialogTaskId) ?? null, [completionDialogTaskId, tasks])
  const completionStopped = Boolean(completionSnapshot?.stopped || completionTask?.status === 'stopped')

  return (
    <>
      <div className="flex min-h-full flex-col gap-5">
        <TabBar />

        {activeTab === 'tasks' ? <TasksWorkbench /> : null}
        {activeTab === 'logs' ? <LogsWorkbench /> : null}
        {activeTab === 'links' ? <LinksWorkbench /> : null}
      </div>

      <ResultDialogShell
        open={Boolean(completionSnapshot)}
        onClose={closeCompletionDialog}
        title={completionStopped ? '极速群发任务已停止' : '极速群发任务完成'}
        subtitle={completionSnapshot?.message || (completionStopped ? '这轮任务已经停止。' : '这轮任务已经跑完了。')}
        icon={<CheckCircle2 size={18} />}
        tone={completionStopped ? 'warning' : 'success'}
        maxWidth="max-w-[560px]"
      >
        <ResultHero label={completionStopped ? '本轮已停止' : '本轮已完成'} value={completionStopped ? `已执行 ${completionSnapshot?.total || 0} 条` : `${completionSnapshot?.total || 0} 条`} tone={completionStopped ? 'warning' : 'success'} />

        {((completionSnapshot?.sendSuccessCount || 0) + (completionSnapshot?.sendSkippedCount || 0) + (completionSnapshot?.sendFailedCount || 0)) > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <ResultStatCard label="成功" value={completionSnapshot?.successCount || 0} tone="success" />
              <ResultStatCard label="审核" value={completionSnapshot?.requestedCount || 0} tone="warning" />
              <ResultStatCard label="失败" value={completionSnapshot?.failedCount || 0} tone="danger" />
              <ResultStatCard label="已在群" value={completionSnapshot?.alreadyCount || 0} tone="violet" />
              <ResultStatCard label="频道跳过" value={completionSnapshot?.channelSkippedCount || 0} tone="warning" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ResultStatCard label="发送成功" value={completionSnapshot?.sendSuccessCount || 0} tone="success" />
              <ResultStatCard label="跳过发送" value={completionSnapshot?.sendSkippedCount || 0} tone="warning" />
              <ResultStatCard label="发送失败" value={completionSnapshot?.sendFailedCount || 0} tone="danger" />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ResultStatCard label="可发言" value={completionSnapshot?.speakableCount || 0} tone="success" />
            <ResultStatCard label="需验证" value={completionSnapshot?.requestedCount || 0} tone="warning" />
            <ResultStatCard label="禁言群" value={completionSnapshot?.mutedCount || 0} tone="danger" />
            <ResultStatCard label="已在群" value={completionSnapshot?.alreadyCount || 0} tone="violet" />
            <ResultStatCard label="频道跳过" value={completionSnapshot?.channelSkippedCount || 0} tone="warning" />
          </div>
        )}

        <ResultPrimaryButton label="知道了" onClick={closeCompletionDialog} tone={completionStopped ? 'warning' : 'success'} />
      </ResultDialogShell>
    </>
  )
}
