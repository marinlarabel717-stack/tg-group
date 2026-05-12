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
import {
  useDirectMessageStore,
  type DirectMessageCollectorMode,
  type DirectMessageTabKey,
  type DirectMessageTargetRecord
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

function getTargetTone(target: DirectMessageTargetRecord) {
  if (!target.valid) return 'bg-rose-400/10 text-rose-200'
  if (target.duplicate) return 'bg-amber-300/10 text-amber-100'
  return 'bg-emerald-400/10 text-emerald-200'
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
            className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-white/8 bg-card text-slate-200 hover:bg-white/[0.03]'}`}
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

  const selectedAccountIds = useDirectMessageStore((state) => state.selectedAccountIds)
  const setSelectedAccounts = useDirectMessageStore((state) => state.setSelectedAccounts)
  const targetInput = useDirectMessageStore((state) => state.targetInput)
  const setTargetInput = useDirectMessageStore((state) => state.setTargetInput)
  const targets = useDirectMessageStore((state) => state.targets)
  const importTargets = useDirectMessageStore((state) => state.importTargets)
  const removeTarget = useDirectMessageStore((state) => state.removeTarget)
  const clearTargets = useDirectMessageStore((state) => state.clearTargets)
  const messageType = useDirectMessageStore((state) => state.messageType)
  const setMessageType = useDirectMessageStore((state) => state.setMessageType)
  const messageText = useDirectMessageStore((state) => state.messageText)
  const setMessageText = useDirectMessageStore((state) => state.setMessageText)
  const sourceLink = useDirectMessageStore((state) => state.sourceLink)
  const setSourceLink = useDirectMessageStore((state) => state.setSourceLink)
  const postbotCode = useDirectMessageStore((state) => state.postbotCode)
  const setPostbotCode = useDirectMessageStore((state) => state.setPostbotCode)
  const groupConcurrency = useDirectMessageStore((state) => state.groupConcurrency)
  const setGroupConcurrency = useDirectMessageStore((state) => state.setGroupConcurrency)
  const intervalSeconds = useDirectMessageStore((state) => state.intervalSeconds)
  const setIntervalSeconds = useDirectMessageStore((state) => state.setIntervalSeconds)
  const dedupeEnabled = useDirectMessageStore((state) => state.dedupeEnabled)
  const setDedupeEnabled = useDirectMessageStore((state) => state.setDedupeEnabled)
  const previewItems = useDirectMessageStore((state) => state.previewItems)
  const generatePreview = useDirectMessageStore((state) => state.generatePreview)
  const startSend = useDirectMessageStore((state) => state.startSend)
  const sending = useDirectMessageStore((state) => state.sending)
  const clearPreview = useDirectMessageStore((state) => state.clearPreview)
  const runs = useDirectMessageStore((state) => state.runs)
  const lastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)

  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [draftAccountIds, setDraftAccountIds] = useState<number[]>(selectedAccountIds)
  const [accountSearch, setAccountSearch] = useState('')

  useEffect(() => {
    if (!accountPickerOpen) {
      setDraftAccountIds(selectedAccountIds)
    }
  }, [accountPickerOpen, selectedAccountIds])

  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const nickname = readAccountLabel(account).toLowerCase()
      return [nickname, account.username || '', account.phone || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [accountSearch, accounts])

  const validTargets = useMemo(() => targets.filter((item) => item.valid).length, [targets])
  const invalidTargets = useMemo(() => targets.filter((item) => !item.valid).length, [targets])
  const duplicateTargets = useMemo(() => targets.filter((item) => item.duplicate).length, [targets])
  const effectiveTargets = useMemo(() => targets.filter((item) => item.valid && (dedupeEnabled ? !item.duplicate : true)), [dedupeEnabled, targets])
  const successCount = useMemo(() => previewItems.filter((item) => item.status === 'sent').length, [previewItems])
  const failedCount = useMemo(() => previewItems.filter((item) => item.status === 'failed').length, [previewItems])
  const latestRun = runs[0] ?? null

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
    setSelectedAccounts(draftAccountIds)
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
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="grid gap-4 md:grid-cols-4">
              <button type="button" onClick={() => setAccountPickerOpen(true)} className="rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-left transition hover:bg-white/[0.03]">
                <div className="text-xs tracking-[0.18em] text-textMuted">账号数量</div>
                <div className="mt-2 text-2xl font-semibold text-white">{selectedAccountIds.length}</div>
                <div className="mt-1 text-xs text-textMuted">点这里选择账号</div>
              </button>

              <label className="rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">发送间隔</div>
                <input type="number" min={5} max={600} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value) || 5)} className="mt-3 w-full rounded-[12px] border border-white/8 bg-black/10 px-3 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>

              <label className="rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-sm">
                <div className="text-xs tracking-[0.18em] text-textMuted">并发线程</div>
                <input type="number" min={1} max={20} value={groupConcurrency} onChange={(event) => setGroupConcurrency(Number(event.target.value) || 1)} className="mt-3 w-full rounded-[12px] border border-white/8 bg-black/10 px-3 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>

              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                <div className="text-xs tracking-[0.18em] text-textMuted">发送操作</div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => generatePreview(accounts)} className="flex-1 rounded-[12px] bg-violet-400/12 px-3 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">预览</button>
                  <button type="button" disabled={sending} onClick={() => void startSend()} className="flex-1 rounded-[12px] bg-violet-400 px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60">{sending ? '发送中' : '开始发送'}</button>
                </div>
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

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div>
                <textarea
                  rows={11}
                  value={targetInput}
                  onChange={(event) => setTargetInput(event.target.value)}
                  placeholder="一行一个，支持 @username / t.me/xxx / +8613xxxxxxx"
                  className="w-full rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-white outline-none focus:border-violet-400/30"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => importTargets(targetInput, { mode: 'replace', source: 'manual' })} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">覆盖导入</button>
                  <button type="button" onClick={() => importTargets(targetInput, { mode: 'append', source: 'manual' })} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">追加导入</button>
                  <label className="inline-flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">
                    <input type="checkbox" checked={dedupeEnabled} onChange={(event) => setDedupeEnabled(event.target.checked)} /> 自动去重复
                  </label>
                  <button type="button" onClick={clearPreview} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">清空预览</button>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">总数量</div><div className="mt-2 text-2xl font-semibold text-white">{targets.length}</div></div>
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">可发送</div><div className="mt-2 text-2xl font-semibold text-white">{effectiveTargets.length}</div></div>
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">重复</div><div className="mt-2 text-2xl font-semibold text-white">{duplicateTargets}</div></div>
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">格式不对</div><div className="mt-2 text-2xl font-semibold text-white">{invalidTargets}</div></div>
              </div>
            </div>

            <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {targets.length === 0 ? (
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有发送目标</div>
              ) : targets.map((target) => (
                <div key={target.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/8 bg-panel px-4 py-3">
                  <div className="min-w-0 truncate text-sm text-white">{target.value}</div>
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full px-2.5 py-1 text-[11px] ${getTargetTone(target)}`}>{!target.valid ? '格式不对' : target.duplicate ? '重复' : '可发送'}</div>
                    <button type="button" onClick={() => removeTarget(target.id)} className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/[0.05] hover:text-white"><X size={14} /></button>
                  </div>
                </div>
              ))}
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

            <div className="mt-4 rounded-[16px] border border-white/8 bg-panel p-4">
              {messageType === 'text' ? (
                <textarea
                  rows={10}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="文本直发：直接写发送内容"
                  className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-4 text-white outline-none focus:border-violet-400/30"
                />
              ) : null}

              {messageType === 'channel_forward' ? (
                <input
                  value={sourceLink}
                  onChange={(event) => setSourceLink(event.target.value)}
                  placeholder="频道转发：填频道消息链接"
                  className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-4 text-white outline-none focus:border-violet-400/30"
                />
              ) : null}

              {messageType === 'hidden_channel_forward' ? (
                <input
                  value={sourceLink}
                  onChange={(event) => setSourceLink(event.target.value)}
                  placeholder="隐藏频道来源转发：填频道消息链接"
                  className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-4 text-white outline-none focus:border-violet-400/30"
                />
              ) : null}

              {messageType === 'postbot_code' ? (
                <textarea
                  rows={10}
                  value={postbotCode}
                  onChange={(event) => setPostbotCode(event.target.value)}
                  placeholder="post图文+按钮：贴 postbot 生成代码"
                  className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-4 text-white outline-none focus:border-violet-400/30"
                />
              ) : null}
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4">
            <div className="text-base font-semibold text-white">运行结果</div>
            <div className="mt-3 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage || '准备开始发送'}</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">待发送</div><div className="mt-2 text-2xl font-semibold text-white">{previewItems.length - successCount - failedCount}</div></div>
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">成功</div><div className="mt-2 text-2xl font-semibold text-white">{successCount}</div></div>
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">失败</div><div className="mt-2 text-2xl font-semibold text-white">{failedCount}</div></div>
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">自动删除</div><div className="mt-2 text-sm font-semibold text-white">成功后自动移出名单</div></div>
            </div>

            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {previewItems.length === 0 ? (
                <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有发送预览</div>
              ) : previewItems.map((item) => (
                <div key={item.id} className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-white">{item.targetValue}</div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === 'sent' ? 'bg-emerald-400/10 text-emerald-200' : item.status === 'failed' ? 'bg-rose-400/10 text-rose-200' : 'bg-sky-400/10 text-sky-300'}`}>{item.status === 'sent' ? '成功' : item.status === 'failed' ? '失败' : '等待中'}</div>
                  </div>
                  <div className="mt-2 text-xs text-textMuted">等待 {item.waitSeconds} 秒</div>
                  {item.errorMessage ? <div className="mt-2 text-xs text-rose-200">{item.errorMessage}</div> : null}
                </div>
              ))}
            </div>

            {latestRun ? <div className="mt-4 text-xs text-textMuted">最近一轮：{formatDateTimeFull(latestRun.createdAt)}</div> : null}
          </GlassPanel>
        </div>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div className="text-lg font-semibold text-white">选择发送账号</div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="搜索手机号 / 账号名 / 用户 ID" className="h-11 w-full rounded-[12px] border border-white/8 bg-panel pl-11 pr-4 text-sm text-white outline-none focus:border-violet-400/30" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(filteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[18px] border border-white/8 bg-panel">
                <div className="grid grid-cols-[64px_180px_1.2fr_140px_120px] border-b border-white/6 px-4 py-3 text-xs uppercase tracking-[0.16em] text-textMuted">
                  <div>选择</div>
                  <div>手机号</div>
                  <div>账号名</div>
                  <div>状态</div>
                  <div>用户 ID</div>
                </div>

                <div className="max-h-[520px] overflow-y-auto">
                  {loading && accounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">正在读取账号...</div>
                  ) : filteredAccounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号</div>
                  ) : filteredAccounts.map((account) => {
                    const checked = draftAccountIds.includes(account.id)
                    return (
                      <label key={account.id} className={`grid cursor-pointer grid-cols-[64px_180px_1.2fr_140px_120px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${checked ? 'bg-violet-400/10' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center"><input type="checkbox" checked={checked} onChange={(event) => setDraftAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} /></div>
                        <div className="truncate text-white">{account.phone || '—'}</div>
                        <div className="truncate text-white">{readAccountLabel(account)}</div>
                        <div className="truncate text-textMuted">{formatAccountStatus(account.status)}</div>
                        <div className="truncate text-textMuted">{account.userId || '—'}</div>
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
  const runs = useDirectMessageStore((state) => state.runs)

  return (
    <GlassPanel className="bg-card">
      <div className="text-base font-semibold text-white">私信日志</div>
      <div className="mt-4 space-y-3">
        {runs.length === 0 ? (
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有发送记录</div>
        ) : runs.map((run) => (
          <div key={run.id} className="rounded-[16px] border border-white/8 bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">{run.summary}</div>
              <div className="text-xs text-textMuted">{formatDateTimeFull(run.createdAt)}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-[12px] bg-black/10 px-3 py-3 text-sm text-white">总数 {run.total}</div>
              <div className="rounded-[12px] bg-black/10 px-3 py-3 text-sm text-white">成功 {run.sent}</div>
              <div className="rounded-[12px] bg-black/10 px-3 py-3 text-sm text-white">失败 {run.failed}</div>
            </div>
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
          <textarea rows={10} value={collectorInput} onChange={(event) => setCollectorInput(event.target.value)} placeholder={collectorMode === 'manual' ? '手工名单一行一个' : '把群链接或频道消息链接贴这里'} className="w-full rounded-[16px] border border-white/8 bg-panel px-4 py-4 text-white outline-none focus:border-violet-400/30" />
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
          <div key={item.id} className="rounded-[14px] border border-white/8 bg-panel px-4 py-3">
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
            <div key={rule.id} className="rounded-[16px] border border-white/8 bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">规则 {index + 1}</div>
                <button type="button" onClick={() => removeAutoReplyRule(rule.id)} className="rounded-[10px] bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">删除</button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input value={rule.keyword} onChange={(event) => updateAutoReplyRule(rule.id, { keyword: event.target.value })} placeholder="触发词" className="rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                <select value={rule.matchMode} onChange={(event) => updateAutoReplyRule(rule.id, { matchMode: event.target.value as 'contains' | 'exact' })} className="rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30"><option value="contains">包含</option><option value="exact">完全匹配</option></select>
                <input type="number" min={0} value={rule.cooldownSeconds} onChange={(event) => updateAutoReplyRule(rule.id, { cooldownSeconds: Math.max(0, Number(event.target.value) || 0) })} placeholder="冷却秒数" className="rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </div>
              <textarea rows={4} value={rule.replyText} onChange={(event) => updateAutoReplyRule(rule.id, { replyText: event.target.value })} placeholder="自动回复内容" className="mt-3 w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">当前状态</div><div className="mt-2 text-lg font-semibold text-white">{autoReplyState.enabled ? '已启用' : '未启用'}</div></div>
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">监听账号</div><div className="mt-2 text-lg font-semibold text-white">{autoReplyState.activeCount}</div></div>
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4"><div className="text-xs tracking-[0.18em] text-textMuted">最近事件</div><div className="mt-2 text-sm text-white">{autoReplyEvents[0] ? `${autoReplyEvents[0].senderLabel} · ${formatDateTimeFull(autoReplyEvents[0].createdAt)}` : '暂无'}</div></div>
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
