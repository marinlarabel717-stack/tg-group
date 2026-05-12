import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Bot, CheckCircle2, Clock3, MessageCircleMore, MessageSquareText, Plus, RefreshCw, Send, Upload, UserPlus2, Users, X, XCircle } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import {
  useDirectMessageStore,
  type DirectMessageCollectorMode,
  type DirectMessageTabKey,
  type DirectMessageTargetRecord
} from '../../stores/directmessagestore'
import { formatAccountStatus, formatDateTimeFull } from '../../lib/ui-text'

const tabs: Array<{ key: DirectMessageTabKey; label: string; icon: typeof MessageSquareText }> = [
  { key: 'send', label: '私信发送', icon: Send },
  { key: 'logs', label: '发送日志', icon: Clock3 },
  { key: 'collect', label: '用户采集', icon: UserPlus2 },
  { key: 'auto-reply', label: '自动回复', icon: Bot }
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
  if (mode === 'group_members') return '群成员名单'
  if (mode === 'comment_users') return '评论用户名单'
  if (mode === 'react_users') return '反应用户名单'
  return '手工名单'
}

function getTargetTone(target: DirectMessageTargetRecord) {
  if (!target.valid) return 'bg-rose-400/10 text-rose-200 border-rose-400/20'
  if (target.duplicate) return 'bg-amber-300/10 text-amber-100 border-amber-300/20'
  return 'bg-emerald-400/10 text-emerald-200 border-emerald-400/20'
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
            className={`flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm transition ${active ? 'bg-violet-400/12 text-violet-300' : 'bg-white/[0.03] text-textMuted hover:bg-white/[0.06] hover:text-white'}`}
          >
            <Icon size={16} />
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
  const selectedAccountId = useDirectMessageStore((state) => state.selectedAccountId)
  const setSelectedAccounts = useDirectMessageStore((state) => state.setSelectedAccounts)
  const setSelectedAccountId = useDirectMessageStore((state) => state.setSelectedAccountId)
  const sendMode = useDirectMessageStore((state) => state.sendMode)
  const setSendMode = useDirectMessageStore((state) => state.setSendMode)
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
  const imageUrl = useDirectMessageStore((state) => state.imageUrl)
  const imageName = useDirectMessageStore((state) => state.imageName)
  const setImagePayload = useDirectMessageStore((state) => state.setImagePayload)
  const clearImage = useDirectMessageStore((state) => state.clearImage)
  const groupConcurrency = useDirectMessageStore((state) => state.groupConcurrency)
  const setGroupConcurrency = useDirectMessageStore((state) => state.setGroupConcurrency)
  const accountPerGroup = useDirectMessageStore((state) => state.accountPerGroup)
  const setAccountPerGroup = useDirectMessageStore((state) => state.setAccountPerGroup)
  const intervalSeconds = useDirectMessageStore((state) => state.intervalSeconds)
  const setIntervalSeconds = useDirectMessageStore((state) => state.setIntervalSeconds)
  const dedupeEnabled = useDirectMessageStore((state) => state.dedupeEnabled)
  const setDedupeEnabled = useDirectMessageStore((state) => state.setDedupeEnabled)
  const autoReplyEnabled = useDirectMessageStore((state) => state.autoReplyEnabled)
  const setAutoReplyEnabled = useDirectMessageStore((state) => state.setAutoReplyEnabled)
  const previewItems = useDirectMessageStore((state) => state.previewItems)
  const generatePreview = useDirectMessageStore((state) => state.generatePreview)
  const clearPreview = useDirectMessageStore((state) => state.clearPreview)
  const startMockSend = useDirectMessageStore((state) => state.startMockSend)
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

  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedAccountIds.includes(account.id)), [accounts, selectedAccountIds])
  const activeAccount = useMemo(() => accounts.find((account) => account.id === selectedAccountId) ?? selectedAccounts[0] ?? null, [accounts, selectedAccountId, selectedAccounts])
  const latestRun = runs[0] ?? null
  const validTargets = useMemo(() => targets.filter((item) => item.valid).length, [targets])
  const invalidTargets = useMemo(() => targets.filter((item) => !item.valid).length, [targets])
  const duplicateTargets = useMemo(() => targets.filter((item) => item.duplicate).length, [targets])
  const effectiveTargetCount = useMemo(() => targets.filter((item) => item.valid && (dedupeEnabled ? !item.duplicate : true)).length, [dedupeEnabled, targets])

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

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePayload({ url: reader.result, name: file.name })
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(640px,1fr)_360px]">
        <GlassPanel className="bg-card">
          <div>
            <div className="text-lg font-semibold text-white">第 1 步：选择发送账号</div>
            <div className="mt-1 text-sm text-textMuted">先把账号选好。这里继续沿用广播页那种简单工作台，不绕弯。</div>
          </div>

          <div className="mt-4 space-y-4">
            <button type="button" onClick={() => setAccountPickerOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
              <Users size={16} /> 选择账号
            </button>

            <div className="rounded-[18px] bg-panel p-4">
              <div className="text-xs tracking-[0.18em] text-textMuted">当前发送账号</div>
              <div className="mt-2 text-base font-semibold text-white">{activeAccount ? readAccountLabel(activeAccount) : '还没选择账号'}</div>
              <div className="mt-2 text-sm text-textMuted">{activeAccount ? `${activeAccount.phone || activeAccount.userId || '未识别'} · ${formatAccountStatus(activeAccount.status)}` : '点上面的“选择账号”开始。'}</div>
            </div>

            <div className="rounded-[18px] bg-panel p-4">
              <div className="text-sm font-semibold text-white">已选账号</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAccounts.length === 0 ? (
                  <div className="text-sm text-textMuted">还没选发送账号。</div>
                ) : selectedAccounts.map((account) => {
                  const active = account.id === activeAccount?.id
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`rounded-full px-3 py-2 text-sm transition ${active ? 'bg-violet-400/14 text-violet-300' : 'bg-white/[0.05] text-textMuted hover:bg-white/[0.1] hover:text-white'}`}
                    >
                      {readAccountLabel(account)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4 z-10">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">私信用户</div>
                <div className="mt-1 text-sm text-textMuted">先把主链路写出来：选账号 → 导入目标 → 配消息 → 生成预览 → 开始发送。</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => generatePreview(accounts)} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                  <RefreshCw size={16} /> 生成发送预览
                </button>
                <button type="button" onClick={startMockSend} className="flex items-center gap-2 rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300">
                  <Send size={16} /> 开始发送
                </button>
                <button type="button" onClick={clearPreview} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空预览</button>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-lg font-semibold text-white">第 2 步：导入目标用户</div>
            <div className="mt-1 text-sm text-textMuted">支持用户名单、手机号、t.me 链接。先把名单导进来，再一键做发送预览。</div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">导入模式</span>
                <select value={sendMode} onChange={(event) => setSendMode(event.target.value as typeof sendMode)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30">
                  <option value="username">用户名单模式</option>
                  <option value="contact">联系人模式</option>
                  <option value="txt">TXT 粘贴模式</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">批次并发</span>
                <input type="number" min={1} max={20} value={groupConcurrency} onChange={(event) => setGroupConcurrency(Number(event.target.value) || 1)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">每批账号数</span>
                <input type="number" min={1} max={50} value={accountPerGroup} onChange={(event) => setAccountPerGroup(Number(event.target.value) || 1)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
            </div>

            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-textMuted">目标用户名单</span>
              <textarea rows={8} value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="一行一个，支持 @username / t.me/xxx / +8613xxxxxxx" className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => importTargets(targetInput, { mode: 'replace', source: 'manual' })} className="rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">替换导入</button>
              <button type="button" onClick={() => importTargets(targetInput, { mode: 'append', source: 'manual' })} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">追加导入</button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">
                <Upload size={14} /> 导入 TXT / CSV
                <input type="file" accept=".txt,.csv" className="hidden" onChange={handleTargetFileUpload} />
              </label>
              <button type="button" onClick={clearTargets} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空目标</button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">总目标</div><div className="mt-2 text-xl font-semibold text-white">{targets.length}</div></div>
              <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">可用目标</div><div className="mt-2 text-xl font-semibold text-white">{validTargets}</div></div>
              <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">重复目标</div><div className="mt-2 text-xl font-semibold text-white">{duplicateTargets}</div></div>
              <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">格式不对</div><div className="mt-2 text-xl font-semibold text-white">{invalidTargets}</div></div>
            </div>

            <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {targets.length === 0 ? (
                <div className="rounded-[16px] bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有导入目标用户。</div>
              ) : targets.map((target) => (
                <div key={target.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-panel px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{target.value}</div>
                    <div className="mt-1 text-xs text-textMuted">来源：{target.source === 'file' ? '文件导入' : target.source === 'collect' ? '用户采集' : '手工输入'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full border px-2.5 py-1 text-[11px] ${getTargetTone(target)}`}>{!target.valid ? '格式不对' : target.duplicate ? '重复目标' : '可发送'}</div>
                    <button type="button" onClick={() => removeTarget(target.id)} className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/[0.05] hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-lg font-semibold text-white">第 3 步：私信内容设置</div>
            <div className="mt-1 text-sm text-textMuted">先收口成最常用的：纯文字 / 图文、间隔、去重、自动回复。</div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">消息类型</span>
                <select value={messageType} onChange={(event) => setMessageType(event.target.value as typeof messageType)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30">
                  <option value="text">纯文字</option>
                  <option value="image_text">图文</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">发送间隔（秒）</span>
                <input type="number" min={5} max={600} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value) || 5)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
              <div className="space-y-2 text-sm">
                <span className="text-textMuted">快捷开关</span>
                <div className="flex flex-wrap gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-white"><input type="checkbox" checked={dedupeEnabled} onChange={(event) => setDedupeEnabled(event.target.checked)} /> 去重发送</label>
                  <label className="inline-flex items-center gap-2 text-white"><input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} /> 自动回复</label>
                </div>
              </div>
            </div>

            {messageType === 'image_text' ? (
              <div className="mt-4 rounded-[16px] bg-panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">
                    <Upload size={14} /> 上传图片
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  {imageUrl ? <button type="button" onClick={clearImage} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">删除图片</button> : null}
                  <div className="text-sm text-textMuted">{imageName || (imageUrl ? '已上传图片' : '还没上传图片')}</div>
                </div>
                {imageUrl ? <img src={imageUrl} alt="preview" className="mt-4 max-h-[180px] rounded-[14px] border border-white/8 object-cover" /> : null}
              </div>
            ) : null}

            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-textMuted">私信内容</span>
              <textarea rows={7} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="直接写你要发给用户的话..." className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>
          </GlassPanel>
        </div>

        <GlassPanel className="bg-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">运行结果</div>
              <div className="mt-1 text-sm text-textMuted">先把结果写明白，别让人看不懂现在到底会发什么。</div>
            </div>
            <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{previewItems.length} 条</div>
          </div>

          {lastActionMessage ? <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div> : null}

          <div className="mt-4 space-y-4">
            <div className="rounded-[18px] border border-white/8 bg-panel p-4">
              <div className="text-sm font-semibold text-white">你现在只看这里</div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div>发送账号：{selectedAccounts.length}</div>
                <div>有效目标：{effectiveTargetCount}</div>
                <div>消息类型：{messageType === 'image_text' ? '图文私信' : '纯文字私信'}</div>
                <div>发送间隔：{intervalSeconds} 秒 / 每批账号 {accountPerGroup}</div>
                <div>最近一次发送：{latestRun ? `${latestRun.sent} / ${latestRun.total}` : '还没开始'}</div>
              </div>
            </div>

            <div className="rounded-[18px] border border-white/8 bg-panel p-4">
              <div className="text-sm font-semibold text-white">当前策略</div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div>• 导入模式：{sendMode === 'username' ? '用户名单模式' : sendMode === 'contact' ? '联系人模式' : 'TXT 粘贴模式'}</div>
                <div>• 批次并发：{groupConcurrency}</div>
                <div>• 每批账号：{accountPerGroup}</div>
                <div>• 去重发送：{dedupeEnabled ? '开启' : '关闭'}</div>
                <div>• 自动回复：{autoReplyEnabled ? '开启' : '关闭'}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 max-h-[760px] space-y-3 overflow-y-auto pr-1">
            {previewItems.length === 0 ? (
              <div className="rounded-[18px] bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有发送预览。先选账号、导入目标，再点“生成发送预览”。</div>
            ) : previewItems.map((item) => (
              <div key={item.id} className="rounded-[16px] bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{item.targetValue}</div>
                  <div className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === 'sent' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-sky-400/10 text-sky-300'}`}>{item.status === 'sent' ? '已进队列' : '待发送'}</div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-200">
                  <div>分配账号：{item.accountLabel}</div>
                  <div>批次：第 {item.batchIndex + 1} 批</div>
                  <div>预计等待：{item.waitSeconds} 秒</div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-white">选择发送账号</div>
                <div className="mt-1 text-sm text-textMuted">这里继续沿用账号管理那种表格式选择，方便你一眼看清账号状态。</div>
              </div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="搜索手机号 / 账号名 / 用户 ID"
                  className="h-11 w-full rounded-[12px] border border-white/8 bg-panel px-4 text-sm text-white outline-none focus:border-violet-400/30 lg:max-w-[360px]"
                />
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(filteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                  <div className="rounded-full bg-white/[0.04] px-3 py-2 text-sm text-textMuted">已选 {draftAccountIds.length} / {accounts.length}</div>
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
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号。</div>
                  ) : filteredAccounts.map((account) => {
                    const checked = draftAccountIds.includes(account.id)
                    return (
                      <label key={account.id} className={`grid cursor-pointer grid-cols-[64px_180px_1.2fr_140px_120px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${checked ? 'bg-violet-400/10' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setDraftAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))}
                          />
                        </div>
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
    <GlassPanel className="bg-card min-h-[720px]">
      <div>
        <div className="text-lg font-semibold text-white">发送日志</div>
        <div className="mt-1 text-sm text-textMuted">先给你一个能看的结果台。每次点“开始发送”后，都会把这次分配结果记在这里。</div>
      </div>

      <div className="mt-5 space-y-4">
        {runs.length === 0 ? (
          <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">还没有发送记录。先去“私信发送”生成一次发送预览并开始发送。</div>
        ) : runs.map((run) => (
          <div key={run.id} className="rounded-[18px] bg-panel p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-base font-semibold text-white">{run.summary}</div>
                <div className="mt-1 text-xs text-textMuted">{formatDateTimeFull(run.createdAt)}</div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-textMuted">
                <div className="rounded-full bg-white/[0.05] px-3 py-1.5">账号 {run.accountCount}</div>
                <div className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-200">已进队列 {run.sent}</div>
                <div className="rounded-full bg-white/[0.05] px-3 py-1.5">总数 {run.total}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {run.items.map((item) => (
                <div key={item.id} className="rounded-[14px] border border-white/8 bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-white">{item.targetValue}</div>
                    <div className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">已进队列</div>
                  </div>
                  <div className="mt-2 text-sm text-textMuted">{item.accountLabel}</div>
                  <div className="mt-2 text-xs text-textMuted">{item.message}</div>
                </div>
              ))}
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
  const appendCollectedUsersToTargets = useDirectMessageStore((state) => state.appendCollectedUsersToTargets)
  const clearCollectedUsers = useDirectMessageStore((state) => state.clearCollectedUsers)
  const lastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(620px,1fr)_360px]">
      <GlassPanel className="bg-card min-h-[720px]">
        <div>
          <div className="text-lg font-semibold text-white">用户采集</div>
          <div className="mt-1 text-sm text-textMuted">我先把“采集入口”做出来。现在支持把你手里的名单先整理进系统，再一键回流到私信发送目标。</div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="text-textMuted">采集模式</span>
            <select value={collectorMode} onChange={(event) => setCollectorMode(event.target.value as DirectMessageCollectorMode)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30">
              <option value="manual">手工名单</option>
              <option value="group_members">群成员名单</option>
              <option value="comment_users">评论用户名单</option>
              <option value="react_users">反应用户名单</option>
            </select>
          </label>
          <div className="md:col-span-2 rounded-[16px] bg-panel px-4 py-4 text-sm text-textMuted">
            当前先把这块做成“名单整理台”。你可以先把采到的用户名 / 手机号 / t.me 链接贴进来，我帮你整理去重，后面再接真实采集链路。
          </div>
        </div>

        <label className="mt-4 block space-y-2 text-sm">
          <span className="text-textMuted">采集结果输入区</span>
          <textarea rows={10} value={collectorInput} onChange={(event) => setCollectorInput(event.target.value)} placeholder="把采集到的用户名单贴到这里，一行一个。" className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => collectUsers(collectorInput, readCollectorModeLabel(collectorMode))} className="rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">识别名单</button>
          <button type="button" onClick={appendCollectedUsersToTargets} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300">加入发送目标</button>
          <button type="button" onClick={clearCollectedUsers} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空采集结果</button>
        </div>

        <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">采集结果</div>
            <div className="mt-1 text-sm text-textMuted">先把采集到的用户放这里，方便后续一键转成发送目标。</div>
          </div>
          <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{collectedUsers.length} 条</div>
        </div>

        <div className="mt-4 max-h-[760px] space-y-3 overflow-y-auto pr-1">
          {collectedUsers.length === 0 ? (
            <div className="rounded-[18px] bg-panel px-4 py-10 text-center text-sm text-textMuted">还没有采集结果。</div>
          ) : collectedUsers.map((item) => (
            <div key={item.id} className="rounded-[16px] bg-panel p-4">
              <div className="text-sm font-semibold text-white">{item.value}</div>
              <div className="mt-2 text-xs text-textMuted">来源：{item.sourceLabel}</div>
              <div className="mt-1 text-xs text-textMuted">时间：{formatDateTimeFull(item.importedAt)}</div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  )
})

const AutoReplyWorkbench = memo(function AutoReplyWorkbench() {
  const autoReplyEnabled = useDirectMessageStore((state) => state.autoReplyEnabled)
  const setAutoReplyEnabled = useDirectMessageStore((state) => state.setAutoReplyEnabled)
  const autoReplyRules = useDirectMessageStore((state) => state.autoReplyRules)
  const addAutoReplyRule = useDirectMessageStore((state) => state.addAutoReplyRule)
  const updateAutoReplyRule = useDirectMessageStore((state) => state.updateAutoReplyRule)
  const removeAutoReplyRule = useDirectMessageStore((state) => state.removeAutoReplyRule)

  return (
    <GlassPanel className="bg-card min-h-[720px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">自动回复</div>
          <div className="mt-1 text-sm text-textMuted">这块先把规则工作台做出来，后面再接真实私聊入站和自动回复执行。</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} /> 开启自动回复</label>
          <button type="button" onClick={addAutoReplyRule} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">
            <Plus size={14} /> 新增规则
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {autoReplyRules.map((rule, index) => (
          <div key={rule.id} className="rounded-[18px] bg-panel p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm font-semibold text-white">规则 {index + 1}</div>
              <div className="flex items-center gap-3 text-sm text-textMuted">
                <label className="inline-flex items-center gap-2 text-white"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateAutoReplyRule(rule.id, { enabled: event.target.checked })} /> 启用</label>
                <button type="button" onClick={() => removeAutoReplyRule(rule.id)} className="rounded-[10px] bg-white/[0.05] px-3 py-2 text-white transition hover:bg-white/[0.08]">删除</button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm md:col-span-1">
                <span className="text-textMuted">触发关键词</span>
                <input value={rule.keyword} onChange={(event) => updateAutoReplyRule(rule.id, { keyword: event.target.value })} placeholder="比如：价格 / 怎么买 / 联系客服" className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">匹配方式</span>
                <select value={rule.matchMode} onChange={(event) => updateAutoReplyRule(rule.id, { matchMode: event.target.value as 'contains' | 'exact' })} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30">
                  <option value="contains">包含关键词</option>
                  <option value="exact">完全匹配</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">冷却时间（秒）</span>
                <input type="number" min={0} value={rule.cooldownSeconds} onChange={(event) => updateAutoReplyRule(rule.id, { cooldownSeconds: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
            </div>

            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-textMuted">回复内容</span>
              <textarea rows={5} value={rule.replyText} onChange={(event) => updateAutoReplyRule(rule.id, { replyText: event.target.value })} placeholder="用户触发后，自动回什么内容..." className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

export default memo(function DirectMessageView() {
  const initAccounts = useAccountStore((state) => state.init)
  const activeTab = useDirectMessageStore((state) => state.activeTab)

  useEffect(() => {
    void initAccounts()
  }, [initAccounts])

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
