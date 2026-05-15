import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Bot,
  Clock3,
  Copy,
  Download,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  UserPlus2,
  Users,
  X
} from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import {
  useDirectMessageStore,
  type DirectMessageCollectorMode,
  type DirectMessageDeleteMode,
  type DirectMessageTabKey
} from '../../stores/directmessagestore'
import { formatAccountStatus, formatDateTimeFull } from '../../lib/ui-text'

const tabs: Array<{ key: DirectMessageTabKey; label: string; icon: typeof Send }> = [
  { key: 'send', label: '私信群发', icon: Send },
  { key: 'logs', label: '私信日志', icon: Clock3 },
  { key: 'collect', label: '用户采集', icon: UserPlus2 },
  { key: 'auto-reply', label: '自动回复', icon: Bot }
]

const messageModes = [
  { key: 'text', label: '文本直发' },
  { key: 'channel_forward', label: '频道转发' },
  { key: 'hidden_channel_forward', label: '隐藏频道来源转发' },
  { key: 'postbot_code', label: 'post图文+按钮' }
] as const

const deleteModes: Array<{ key: DirectMessageDeleteMode; label: string; hint: string }> = [
  { key: 'none', label: '不删除', hint: '发出去后保留消息。' },
  { key: 'self', label: '仅自己删除', hint: '发送后自动在当前账号侧删除，对方那边保留。' },
  { key: 'both', label: '双向删除', hint: '发送后尝试双方都删，更适合 @机器人 用户。' }
]

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function readCollectorModeLabel(mode: DirectMessageCollectorMode) {
  if (mode === 'contact') return '联系人'
  if (mode === 'group_members') return '群成员'
  if (mode === 'comment_users') return '评论用户'
  if (mode === 'react_users') return '反应用户'
  return '手工名单'
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

function readMessageTypeLabel(messageType: 'text' | 'channel_forward' | 'hidden_channel_forward' | 'postbot_code') {
  if (messageType === 'channel_forward') return '频道转发'
  if (messageType === 'hidden_channel_forward') return '隐藏频道来源转发'
  if (messageType === 'postbot_code') return 'post图文+按钮'
  return '文本直发'
}

function formatTimeOnly(value?: string | null) {
  if (!value) return '--:--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
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

const TabBar = memo(function TabBar() {
  const activeTab = useDirectMessageStore((state) => state.activeTab)
  const setActiveTab = useDirectMessageStore((state) => state.setActiveTab)

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-300' : 'border-white/[0.06] bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
})

const SendWorkbench = memo(function SendWorkbench() {
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const selectedAccountIds = useDirectMessageStore((state) => state.selectedAccountIds)
  const setSelectedAccounts = useDirectMessageStore((state) => state.setSelectedAccounts)
  const targetInput = useDirectMessageStore((state) => state.targetInput)
  const setTargetInput = useDirectMessageStore((state) => state.setTargetInput)
  const targetSummary = useDirectMessageStore((state) => state.targetSummary)
  const targets = useDirectMessageStore((state) => state.targets)
  const importTargets = useDirectMessageStore((state) => state.importTargets)
  const clearTargets = useDirectMessageStore((state) => state.clearTargets)
  const messageType = useDirectMessageStore((state) => state.messageType)
  const setMessageType = useDirectMessageStore((state) => state.setMessageType)
  const messageText = useDirectMessageStore((state) => state.messageText)
  const setMessageText = useDirectMessageStore((state) => state.setMessageText)
  const sourceLink = useDirectMessageStore((state) => state.sourceLink)
  const setSourceLink = useDirectMessageStore((state) => state.setSourceLink)
  const postbotCode = useDirectMessageStore((state) => state.postbotCode)
  const setPostbotCode = useDirectMessageStore((state) => state.setPostbotCode)
  const deleteMode = useDirectMessageStore((state) => state.deleteMode)
  const setDeleteMode = useDirectMessageStore((state) => state.setDeleteMode)
  const deleteDelaySeconds = useDirectMessageStore((state) => state.deleteDelaySeconds)
  const setDeleteDelaySeconds = useDirectMessageStore((state) => state.setDeleteDelaySeconds)
  const pinAfterSendEnabled = useDirectMessageStore((state) => state.pinAfterSendEnabled)
  const setPinAfterSendEnabled = useDirectMessageStore((state) => state.setPinAfterSendEnabled)
  const pinDelaySeconds = useDirectMessageStore((state) => state.pinDelaySeconds)
  const setPinDelaySeconds = useDirectMessageStore((state) => state.setPinDelaySeconds)
  const welcomeMessageEnabled = useDirectMessageStore((state) => state.welcomeMessageEnabled)
  const setWelcomeMessageEnabled = useDirectMessageStore((state) => state.setWelcomeMessageEnabled)
  const welcomeMessageText = useDirectMessageStore((state) => state.welcomeMessageText)
  const setWelcomeMessageText = useDirectMessageStore((state) => state.setWelcomeMessageText)
  const welcomeDelaySeconds = useDirectMessageStore((state) => state.welcomeDelaySeconds)
  const setWelcomeDelaySeconds = useDirectMessageStore((state) => state.setWelcomeDelaySeconds)
  const randomEmojiEnabled = useDirectMessageStore((state) => state.randomEmojiEnabled)
  const setRandomEmojiEnabled = useDirectMessageStore((state) => state.setRandomEmojiEnabled)
  const groupConcurrency = useDirectMessageStore((state) => state.groupConcurrency)
  const setGroupConcurrency = useDirectMessageStore((state) => state.setGroupConcurrency)
  const intervalSeconds = useDirectMessageStore((state) => state.intervalSeconds)
  const setIntervalSeconds = useDirectMessageStore((state) => state.setIntervalSeconds)
  const startSend = useDirectMessageStore((state) => state.startSend)
  const stopSend = useDirectMessageStore((state) => state.stopSend)
  const sending = useDirectMessageStore((state) => state.sending)
  const stopping = useDirectMessageStore((state) => state.stopping)
  const lastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)

  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [draftAccountIds, setDraftAccountIds] = useState<number[]>(selectedAccountIds)
  const [accountSearch, setAccountSearch] = useState('')
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('10')

  useEffect(() => {
    if (!accountPickerOpen) {
      setDraftAccountIds(selectedAccountIds)
    }
  }, [accountPickerOpen, selectedAccountIds])

  useEffect(() => {
    const validIds = selectedAccountIds.filter((id) => accounts.some((account) => account.id === id))
    if (validIds.length !== selectedAccountIds.length) {
      setSelectedAccounts(validIds)
    }
  }, [accounts, selectedAccountIds, setSelectedAccounts])

  useEffect(() => {
    if (!accountPickerOpen) return
    setRangeStart('1')
    setRangeEnd(String(Math.min(10, Math.max(accounts.length, 1))))
  }, [accountPickerOpen, accounts.length])

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
  const occupiedSelectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account.id) && getAccountTaskMeta(accountTaskStatusMap, account.id).occupied),
    [accountTaskStatusMap, accounts, selectedAccountIds]
  )

  const validTargets = targetSummary.valid
  const invalidTargets = targetSummary.invalid
  const duplicateTargets = targetSummary.duplicate
  const effectiveTargets = targets

  const exportTargetsAsTxt = () => {
    const content = effectiveTargets.map((item) => item.value).join('\n')
    if (!content) return
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'direct-message-targets.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const copyTargets = async () => {
    const content = effectiveTargets.map((item) => item.value).join('\n')
    if (!content) return
    await navigator.clipboard.writeText(content)
  }

  const applyAccountSelection = () => {
    setSelectedAccounts(draftAccountIds.filter((accountId) => !getAccountTaskMeta(accountTaskStatusMap, accountId).occupied))
    setAccountPickerOpen(false)
  }

  const handleTargetFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    importTargets(content, { mode: 'append', source: 'file' })
    event.target.value = ''
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="grid gap-4 md:grid-cols-3">
              <button type="button" disabled={sending || stopping} onClick={() => setAccountPickerOpen(true)} className="rounded-[16px] bg-panel/80 px-4 py-4 text-left transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60">
                <div className="text-xs tracking-[0.18em] text-textMuted">账号数量</div>
                <div className="mt-2 text-2xl font-semibold text-white">{selectedAccountIds.length}</div>
                <div className="mt-1 text-xs text-textMuted">{occupiedSelectedAccounts.length > 0 ? `有 ${occupiedSelectedAccounts.length} 个账号正在忙，先别拿来发私信。` : '点这里选择账号'}</div>
              </button>

              <label className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">发送间隔</div>
                <input type="number" min={5} max={600} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value) || 5)} className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none focus:border-white/[0.12]" />
              </label>

              <label className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">并发线程</div>
                <input type="number" min={1} max={20} value={groupConcurrency} onChange={(event) => setGroupConcurrency(Number(event.target.value) || 1)} className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none focus:border-white/[0.12]" />
              </label>
            </div>

            <div className="mt-4 rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
              <div className="text-xs tracking-[0.18em] text-textMuted">发送后删除</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {deleteModes.map((mode) => {
                  const active = deleteMode === mode.key
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setDeleteMode(mode.key)}
                      className={`rounded-[14px] border px-4 py-3 text-left transition ${active ? 'border-violet-300/45 bg-violet-400/10 text-violet-200' : 'border-white/[0.06] bg-black/10 text-slate-200 hover:border-white/[0.12] hover:bg-white/[0.03]'}`}
                    >
                      <div className="text-sm font-medium">{mode.label}</div>
                      <div className="mt-1 text-xs text-textMuted">{mode.hint}</div>
                    </button>
                  )
                })}
              </div>

              {deleteMode !== 'none' ? (
                <label className="mt-3 block rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
                  <div className="text-xs tracking-[0.14em] text-textMuted">删除延时（秒）</div>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={deleteDelaySeconds}
                    onChange={(event) => setDeleteDelaySeconds(Number(event.target.value) || 0)}
                    className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none focus:border-white/[0.12]"
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <label className="inline-flex items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={pinAfterSendEnabled} onChange={(event) => setPinAfterSendEnabled(event.target.checked)} />
                  发送后自动置顶
                </label>
                <div className="mt-2 text-xs text-textMuted">按你填的秒数等待后，把刚发出的广告在当前账号侧置顶。</div>
                {pinAfterSendEnabled ? (
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={pinDelaySeconds}
                    onChange={(event) => setPinDelaySeconds(Number(event.target.value) || 0)}
                    className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none focus:border-white/[0.12]"
                  />
                ) : null}
              </div>

              <div className="rounded-[16px] bg-panel/80 px-4 py-4 text-sm">
                <label className="inline-flex items-center gap-2 text-sm text-white">
                  <input type="checkbox" checked={welcomeMessageEnabled} onChange={(event) => setWelcomeMessageEnabled(event.target.checked)} />
                  先发欢迎帖子，再发广告
                </label>
                <div className="mt-2 text-xs text-textMuted">会先发一条欢迎内容，等几秒后再发送正式广告。</div>
                {welcomeMessageEnabled ? (
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={welcomeDelaySeconds}
                    onChange={(event) => setWelcomeDelaySeconds(Number(event.target.value) || 0)}
                    className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-3 py-3 text-white outline-none focus:border-white/[0.12]"
                  />
                ) : null}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-semibold text-white">发送目标</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyTargets} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Copy size={14} /> 直接复制</button>
                <button type="button" onClick={exportTargetsAsTxt} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Download size={14} /> TXT导出</button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                  <Upload size={14} /> 导入TXT
                  <input type="file" accept=".txt,.csv" className="hidden" onChange={handleTargetFileUpload} />
                </label>
                <button type="button" onClick={clearTargets} className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"><Trash2 size={14} /> 清空</button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">总数量</div><div className="mt-2 text-xl font-semibold text-white">{targetSummary.total}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">可发送</div><div className="mt-2 text-xl font-semibold text-white">{effectiveTargets.length}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-xl font-semibold text-white">{duplicateTargets}</div></div>
              <div className="rounded-[14px] bg-panel/80 px-4 py-3"><div className="text-xs tracking-[0.18em] text-textMuted">格式不对</div><div className="mt-2 text-xl font-semibold text-white">{invalidTargets}</div></div>
            </div>

            <div className="mt-4">
              <textarea
                rows={11}
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="一行一个，支持 @username / t.me/xxx / +8613xxxxxxx"
                className="w-full rounded-[16px] border border-white/[0.06] bg-panel px-4 py-4 text-white outline-none focus:border-white/[0.12]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300">复制进来会自动清理重复和格式错误</div>
              </div>
            </div>

          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">发送文案</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {messageModes.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setMessageType(mode.key)}
                  className={`rounded-[12px] px-4 py-2.5 text-sm transition ${messageType === mode.key ? 'bg-violet-400 text-slate-950' : 'bg-white/[0.05] text-white hover:bg-white/[0.08]'}`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[16px] bg-panel/80 p-4">
              {messageType === 'text' ? (
                <div className="space-y-3">
                  <textarea
                    rows={10}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder="文本直发：直接写发送内容"
                    className="w-full rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-4 text-white outline-none focus:border-white/[0.12]"
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-white">
                    <input type="checkbox" checked={randomEmojiEnabled} onChange={(event) => setRandomEmojiEnabled(event.target.checked)} />
                    纯文本随机符号模式（每次随机带 1-2 个 emoji）
                  </label>
                </div>
              ) : null}

              {messageType === 'channel_forward' ? (
                <input
                  value={sourceLink}
                  onChange={(event) => setSourceLink(event.target.value)}
                  placeholder="频道转发：填频道消息链接"
                  className="w-full rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-4 text-white outline-none focus:border-white/[0.12]"
                />
              ) : null}

              {messageType === 'hidden_channel_forward' ? (
                <input
                  value={sourceLink}
                  onChange={(event) => setSourceLink(event.target.value)}
                  placeholder="隐藏频道来源转发：填频道消息链接"
                  className="w-full rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-4 text-white outline-none focus:border-white/[0.12]"
                />
              ) : null}

              {messageType === 'postbot_code' ? (
                <textarea
                  rows={10}
                  value={postbotCode}
                  onChange={(event) => setPostbotCode(event.target.value)}
                  placeholder="post图文+按钮：贴 postbot 生成代码"
                  className="w-full rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-4 text-white outline-none focus:border-white/[0.12]"
                />
              ) : null}

              {welcomeMessageEnabled ? (
                <div className="mt-4 rounded-[14px] border border-white/[0.06] bg-black/10 p-4">
                  <div className="text-sm font-medium text-white">欢迎帖子内容</div>
                  <div className="mt-1 text-xs text-textMuted">这条会先发，等待上面设置的秒数后，再发正式广告。</div>
                  <textarea
                    rows={5}
                    value={welcomeMessageText}
                    onChange={(event) => setWelcomeMessageText(event.target.value)}
                    placeholder="先发的欢迎内容写这里"
                    className="mt-3 w-full rounded-[14px] border border-white/[0.06] bg-black/10 px-4 py-4 text-white outline-none focus:border-white/[0.12]"
                  />
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4">
            <div className="text-base font-semibold text-white">发送操作</div>
            <div className="mt-3 space-y-3">
              <button type="button" disabled={sending || occupiedSelectedAccounts.length > 0} onClick={() => void startSend(accounts)} className="w-full rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">{sending ? '发送中' : '开始发送'}</button>
              <button type="button" disabled={!sending || stopping} onClick={() => void stopSend()} className="w-full rounded-[12px] bg-rose-400/12 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50">{stopping ? '停止中' : '停止发送'}</button>
            </div>
            <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '准备开始发送'}</div>
          </GlassPanel>
        </div>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-card px-5 py-4">
              <div className="text-lg font-semibold text-white">选择发送账号</div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="搜索手机号 / 账号名" className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel pl-11 pr-4 text-sm text-white outline-none focus:border-white/[0.12]" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(selectableFilteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                </div>
              </div>

              {filteredAccounts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm text-textMuted">区间选择</div>
                  <input
                    inputMode="numeric"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="开始"
                    className="h-10 w-20 rounded-[12px] border border-white/[0.06] bg-panel px-3 text-sm text-white outline-none focus:border-white/[0.12]"
                  />
                  <span className="text-textMuted">-</span>
                  <input
                    inputMode="numeric"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="结束"
                    className="h-10 w-20 rounded-[12px] border border-white/[0.06] bg-panel px-3 text-sm text-white outline-none focus:border-white/[0.12]"
                  />
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

              <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-panel">
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

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/[0.06] bg-card px-5 py-4">
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
  const runs = useDirectMessageStore((state) => state.runs)
  const clearRuns = useDirectMessageStore((state) => state.clearRuns)
  const stopSend = useDirectMessageStore((state) => state.stopSend)
  const previewItems = useDirectMessageStore((state) => state.previewItems)
  const sending = useDirectMessageStore((state) => state.sending)
  const stopping = useDirectMessageStore((state) => state.stopping)
  const lastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)
  const messageType = useDirectMessageStore((state) => state.messageType)
  const latestRun = runs[0] ?? null
  const [accountStatsExpanded, setAccountStatsExpanded] = useState(false)
  const detailedItems = useMemo(
    () => runs.flatMap((run) => run.items.map((item) => ({ ...item, fallbackAt: run.createdAt }))),
    [runs]
  )
  const summaryItems = useMemo(() => {
    if (sending) {
      return previewItems
        .filter((item) => item.status === 'sent' || item.status === 'failed')
        .map((item) => ({
          accountPhone: item.accountPhone,
          status: item.status,
          sentAt: item.sentAt,
          fallbackAt: new Date().toISOString()
        }))
    }
    return latestRun ? latestRun.items.map((item) => ({ ...item, fallbackAt: latestRun.createdAt })) : []
  }, [latestRun, previewItems, sending])
  const latestAccountStats = useMemo(() => {
    if (summaryItems.length === 0) return [] as Array<{ phone: string; total: number; sent: number; failed: number }>
    const grouped = new Map<string, { phone: string; total: number; sent: number; failed: number }>()
    for (const item of summaryItems) {
      const phone = item.accountPhone || '未知手机号'
      const current = grouped.get(phone) || { phone, total: 0, sent: 0, failed: 0 }
      current.total += 1
      if (item.status === 'sent') current.sent += 1
      if (item.status === 'failed') current.failed += 1
      grouped.set(phone, current)
    }
    return Array.from(grouped.values()).sort((left, right) => right.total - left.total || left.phone.localeCompare(right.phone))
  }, [summaryItems])
  const summarySuccessCount = sending ? previewItems.filter((item) => item.status === 'sent').length : (latestRun?.sent ?? 0)
  const summaryFailedCount = sending ? previewItems.filter((item) => item.status === 'failed').length : (latestRun?.failed ?? 0)
  const visibleAccountStats = accountStatsExpanded ? latestAccountStats : latestAccountStats.slice(0, 3)
  const averageSuccessPerAccount = useMemo(() => {
    const successAccounts = latestAccountStats.filter((item) => item.sent > 0)
    if (successAccounts.length === 0) return 0
    const totalSuccess = successAccounts.reduce((sum, item) => sum + item.sent, 0)
    return Math.round(totalSuccess / successAccounts.length)
  }, [latestAccountStats])
  const liveItems = useMemo(
    () => previewItems
      .filter((item) => item.status === 'sent' || item.status === 'failed')
      .map((item, index) => ({
      id: item.id,
      sentAt: item.sentAt,
      fallbackAt: new Date().toISOString(),
      accountPhone: item.accountPhone,
      messageType,
      targetValue: item.targetValue,
      status: item.status,
      sequence: index + 1,
      message: item.errorMessage
    })),
    [previewItems, messageType]
  )

  const exportLogs = () => {
    if (detailedItems.length === 0) return
    const content = detailedItems.map((item) => {
      const line = `[${formatTimeOnly(item.sentAt || item.fallbackAt)}] [${item.accountPhone}] - 通过${readMessageTypeLabel(item.messageType)} - 向${item.targetValue} - ${item.status === 'sent' ? '发送成功' : '发送失败'} -- ${item.sequence}`
      return item.status === 'failed' ? `${line} (${item.message})` : line
    }).join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'direct-message-logs.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-white">私信日志</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!sending || stopping}
            onClick={() => void stopSend()}
            className="rounded-[12px] bg-rose-400/12 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stopping ? '停止中' : '停止任务'}
          </button>
          <button type="button" onClick={exportLogs} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">导出日志</button>
          <button type="button" onClick={clearRuns} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]">清空日志</button>
        </div>
      </div>
      {sending ? (
        <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '有新的成功或失败结果会显示在下面。'}</div>
      ) : null}
      <div className="mt-4 rounded-[16px] bg-panel/70 px-4 py-4">
        <div className="text-sm font-semibold text-white">{sending ? '本次私信进行中' : latestRun?.summary.includes('任务已停止') ? '本次私信已停止' : latestRun ? '本次私信已完成' : '本次私信总计'}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-[14px] bg-emerald-400/8 px-4 py-3">
              <div className="text-xs tracking-[0.16em] text-emerald-200/80">发送成功</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">{summarySuccessCount}</div>
            </div>
            <div className="rounded-[14px] bg-rose-400/8 px-4 py-3">
              <div className="text-xs tracking-[0.16em] text-rose-200/80">发送失败</div>
              <div className="mt-2 text-2xl font-semibold text-rose-300">{summaryFailedCount}</div>
            </div>
            <div className="rounded-[14px] bg-amber-400/8 px-4 py-3">
              <div className="text-xs tracking-[0.16em] text-amber-200/80">均号成功</div>
              <div className="mt-2 text-2xl font-semibold text-amber-300">{averageSuccessPerAccount}</div>
            </div>
          </div>
          {latestAccountStats.length > 0 ? (
            <div className="mt-4 rounded-[14px] bg-black/10 px-4 py-4">
              <div className="text-sm font-medium text-white">本次各号码发送情况</div>
              <div className="mt-3 space-y-2">
                {visibleAccountStats.map((item) => (
                  <div key={item.phone} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="select-text text-white">{item.phone}</span>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-slate-200">发送 {item.total}</span>
                      <span className="text-emerald-300">成功 {item.sent}</span>
                      <span className="text-rose-300">失败 {item.failed}</span>
                    </div>
                  </div>
                ))}
              </div>
              {latestAccountStats.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setAccountStatsExpanded((value) => !value)}
                  className="mt-3 text-sm text-violet-300 transition hover:text-violet-200"
                >
                  {accountStatsExpanded ? '收起' : `查看全部（${latestAccountStats.length}）`}
                </button>
              ) : null}
            </div>
          ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {sending && liveItems.length > 0 ? liveItems.map((item) => (
          <div key={item.id} className={`rounded-[14px] px-4 py-3 ${item.status === 'sent' ? 'bg-emerald-400/8' : 'bg-rose-400/8'}`}>
            <div className={`text-sm font-medium ${item.status === 'sent' ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span className="select-text">[{formatTimeOnly(item.sentAt || item.fallbackAt)}] [{item.accountPhone}] - 通过{readMessageTypeLabel(item.messageType)} - 向{item.targetValue} - {item.status === 'sent' ? '发送成功' : '发送失败'} -- {item.sequence}</span>
            </div>
            {item.status === 'failed' && item.message ? (
              <div className="mt-1 select-text text-xs text-rose-200">{item.message}</div>
            ) : null}
          </div>
        )) : detailedItems.length === 0 ? (
          <div className="rounded-[16px] bg-panel/70 px-4 py-10 text-center text-sm text-textMuted">还没有发送记录</div>
        ) : detailedItems.map((item) => (
          <div key={item.id} className={`rounded-[14px] px-4 py-3 ${item.status === 'sent' ? 'bg-emerald-400/8' : 'bg-rose-400/8'}`}>
            <div className={`text-sm font-medium ${item.status === 'sent' ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span className="select-text">[{formatTimeOnly(item.sentAt || item.fallbackAt)}] [{item.accountPhone}] - 通过{readMessageTypeLabel(item.messageType)} - 向{item.targetValue} - {item.status === 'sent' ? '发送成功' : '发送失败'} -- {item.sequence}</span>
            </div>
            {item.status === 'failed' ? (
              <div className="mt-1 select-text text-xs text-rose-200">{item.message}</div>
            ) : null}
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const CollectWorkbench = memo(function CollectWorkbench() {
  const collectorMode = useDirectMessageStore((state) => state.collectorMode)
  const setCollectorMode = useDirectMessageStore((state) => state.setCollectorMode)
  const collectorInput = useDirectMessageStore((state) => state.collectorInput)
  const setCollectorInput = useDirectMessageStore((state) => state.setCollectorInput)
  const collectedUsers = useDirectMessageStore((state) => state.collectedUsers)
  const collectUsers = useDirectMessageStore((state) => state.collectUsers)
  const collectUsersFromSource = useDirectMessageStore((state) => state.collectUsersFromSource)
  const appendCollectedUsersToTargets = useDirectMessageStore((state) => state.appendCollectedUsersToTargets)
  const collecting = useDirectMessageStore((state) => state.collecting)

  return (
    <GlassPanel className="bg-card">
      <div className="flex flex-wrap gap-2">
        {(['manual', 'contact', 'group_members', 'comment_users', 'react_users'] as DirectMessageCollectorMode[]).map((mode) => (
          <button key={mode} type="button" onClick={() => setCollectorMode(mode)} className={`rounded-[12px] px-4 py-2.5 text-sm transition ${collectorMode === mode ? 'bg-violet-400 text-slate-950' : 'bg-white/[0.05] text-white hover:bg-white/[0.08]'}`}>{readCollectorModeLabel(mode)}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {collectorMode !== 'contact' ? (
          <textarea rows={10} value={collectorInput} onChange={(event) => setCollectorInput(event.target.value)} placeholder={collectorMode === 'manual' ? '手工名单一行一个' : '把群链接或频道消息链接贴这里'} className="w-full rounded-[16px] border border-white/[0.06] bg-panel px-4 py-4 text-white outline-none focus:border-white/[0.12]" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {collectorMode === 'manual' ? (
            <button type="button" onClick={() => collectUsers(collectorInput, '手工名单')} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">识别名单</button>
          ) : (
            <button type="button" disabled={collecting} onClick={() => void collectUsersFromSource()} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18 disabled:cursor-not-allowed disabled:opacity-60">{collecting ? '采集中' : '开始采集'}</button>
          )}
          <button type="button" onClick={appendCollectedUsersToTargets} className="rounded-[12px] bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-violet-300">加入发送目标</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {collectedUsers.map((item) => (
          <div key={item.id} className="rounded-[14px] bg-panel/70 px-4 py-3">
            <div className="truncate text-sm text-white">{item.value}</div>
            <div className="mt-1 text-xs text-textMuted">{item.sourceLabel}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const AutoReplyWorkbench = memo(function AutoReplyWorkbench() {
  const autoReplyEnabled = useDirectMessageStore((state) => state.autoReplyEnabled)
  const setAutoReplyEnabled = useDirectMessageStore((state) => state.setAutoReplyEnabled)
  const autoReplyRules = useDirectMessageStore((state) => state.autoReplyRules)
  const autoReplyState = useDirectMessageStore((state) => state.autoReplyState)
  const autoReplyEvents = useDirectMessageStore((state) => state.autoReplyEvents)
  const autoReplySyncing = useDirectMessageStore((state) => state.autoReplySyncing)
  const syncAutoReply = useDirectMessageStore((state) => state.syncAutoReply)
  const addAutoReplyRule = useDirectMessageStore((state) => state.addAutoReplyRule)
  const updateAutoReplyRule = useDirectMessageStore((state) => state.updateAutoReplyRule)
  const removeAutoReplyRule = useDirectMessageStore((state) => state.removeAutoReplyRule)

  return (
    <GlassPanel className="bg-card">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} /> 开启自动回复</label>
        <button type="button" onClick={addAutoReplyRule} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">新增规则</button>
        <button type="button" disabled={autoReplySyncing} onClick={() => void syncAutoReply()} className="rounded-[12px] bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">{autoReplySyncing ? '应用中' : '应用规则'}</button>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {autoReplyRules.map((rule, index) => (
            <div key={rule.id} className="rounded-[16px] bg-panel/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">规则 {index + 1}</div>
                <button type="button" onClick={() => removeAutoReplyRule(rule.id)} className="rounded-[10px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">删除</button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input value={rule.keyword} onChange={(event) => updateAutoReplyRule(rule.id, { keyword: event.target.value })} placeholder="触发词" className="rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 text-white outline-none focus:border-white/[0.12]" />
                <select value={rule.matchMode} onChange={(event) => updateAutoReplyRule(rule.id, { matchMode: event.target.value as 'contains' | 'exact' })} className="rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 text-white outline-none focus:border-white/[0.12]"><option value="contains">包含</option><option value="exact">完全匹配</option></select>
                <input type="number" min={0} value={rule.cooldownSeconds} onChange={(event) => updateAutoReplyRule(rule.id, { cooldownSeconds: Math.max(0, Number(event.target.value) || 0) })} placeholder="冷却秒数" className="rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 text-white outline-none focus:border-white/[0.12]" />
              </div>
              <textarea rows={4} value={rule.replyText} onChange={(event) => updateAutoReplyRule(rule.id, { replyText: event.target.value })} placeholder="自动回复内容" className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-black/10 px-4 py-3 text-white outline-none focus:border-white/[0.12]" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-[16px] bg-panel/80 px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">当前状态</div><div className="mt-2 text-lg font-semibold text-white">{autoReplyState.enabled ? '已启用' : '未启用'}</div></div>
          <div className="rounded-[16px] bg-panel/80 px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">监听账号</div><div className="mt-2 text-lg font-semibold text-white">{autoReplyState.activeCount}</div></div>
          <div className="rounded-[16px] bg-panel/80 px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">最近事件</div><div className="mt-2 text-sm text-white">{autoReplyEvents[0] ? `${autoReplyEvents[0].senderLabel} · ${formatDateTimeFull(autoReplyEvents[0].createdAt)}` : '暂无'}</div></div>
        </div>
      </div>
    </GlassPanel>
  )
})

export default memo(function DirectMessageView() {
  const initAccounts = useAccountStore((state) => state.init)
  const activeTab = useDirectMessageStore((state) => state.activeTab)
  const initRuntime = useDirectMessageStore((state) => state.initRuntime)

  useEffect(() => {
    void initAccounts()
    void initRuntime()
  }, [initAccounts, initRuntime])

  return (
    <div className="space-y-5">
      <TabBar />
      {activeTab === 'send' ? <SendWorkbench /> : null}
      {activeTab === 'logs' ? <LogsWorkbench /> : null}
      {activeTab === 'collect' ? <CollectWorkbench /> : null}
      {activeTab === 'auto-reply' ? <AutoReplyWorkbench /> : null}
    </div>
  )
})
