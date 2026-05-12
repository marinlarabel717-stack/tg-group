import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  ImagePlus,
  Import,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
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

const tabs: Array<{ key: DirectMessageTabKey; label: string; icon: typeof Send; hint: string }> = [
  { key: 'send', label: '私信群发', icon: Send, hint: '配置账号、目标用户和私信内容' },
  { key: 'logs', label: '私信日志', icon: Clock3, hint: '看每一轮发送结果和分配情况' },
  { key: 'collect', label: '用户采集', icon: UserPlus2, hint: '先整理用户来源，再回流到群发' },
  { key: 'auto-reply', label: '自动回复', icon: Bot, hint: '设置触发关键词和自动应答规则' }
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
  if (mode === 'group_members') return '群成员'
  if (mode === 'comment_users') return '评论用户'
  if (mode === 'react_users') return '反应用户'
  return '手工名单'
}

function getTargetTone(target: DirectMessageTargetRecord) {
  if (!target.valid) return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
  if (target.duplicate) return 'border-amber-300/20 bg-amber-300/10 text-amber-100'
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
}

const TabBar = memo(function TabBar() {
  const activeTab = useDirectMessageStore((state) => state.activeTab)
  const setActiveTab = useDirectMessageStore((state) => state.setActiveTab)

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-[18px] border p-4 text-left transition ${active ? 'border-violet-400/25 bg-violet-400/10' : 'border-white/8 bg-card hover:bg-white/[0.03]'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${active ? 'bg-violet-400/16 text-violet-300' : 'bg-white/[0.05] text-textMuted'}`}>
                <Icon size={18} />
              </div>
              <div>
                <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{tab.label}</div>
                <div className="mt-1 text-xs text-textMuted">{tab.hint}</div>
              </div>
            </div>
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
  const validTargets = useMemo(() => targets.filter((item) => item.valid).length, [targets])
  const invalidTargets = useMemo(() => targets.filter((item) => !item.valid).length, [targets])
  const duplicateTargets = useMemo(() => targets.filter((item) => item.duplicate).length, [targets])
  const effectiveTargetCount = useMemo(() => targets.filter((item) => item.valid && (dedupeEnabled ? !item.duplicate : true)).length, [dedupeEnabled, targets])
  const latestRun = runs[0] ?? null

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
      <div className="space-y-5">
        <GlassPanel className="bg-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-[22px] font-semibold text-white">私信群发工作台</div>
              <div className="mt-2 text-sm text-textMuted">我按海浪那种单页深色控制台去收口：上面切功能，当前页只做发送主链路，减少来回跳。根据公开页面结构，它把私信能力拆成“私信群发 / 私信日志 / 用户采集 / 自动回复”几个入口，我这里也对齐成这套分组。citeturn1search0turn1open0turn1open1</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px] xl:max-w-[420px]">
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                <div className="text-xs tracking-[0.18em] text-textMuted">发送账号</div>
                <div className="mt-2 text-2xl font-semibold text-white">{selectedAccounts.length}</div>
                <div className="mt-1 text-xs text-textMuted">当前已选</div>
              </div>
              <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                <div className="text-xs tracking-[0.18em] text-textMuted">可发目标</div>
                <div className="mt-2 text-2xl font-semibold text-white">{effectiveTargetCount}</div>
                <div className="mt-1 text-xs text-textMuted">去重后</div>
              </div>
            </div>
          </div>
        </GlassPanel>

        <div className="grid gap-5 xl:grid-cols-[minmax(700px,1fr)_360px]">
          <div className="space-y-5">
            <GlassPanel className="bg-card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">发送配置</div>
                  <div className="mt-1 text-sm text-textMuted">功能形态我尽量靠海浪那种“配置在左、结果在右、一次把关键参数放全”的感觉去做。公开页能看到它的私信页以深色后台、集中参数区和日志入口为主。citeturn1open0turn1open1</div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => generatePreview(accounts)} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                    <RefreshCw size={16} /> 生成发送预览
                  </button>
                  <button type="button" onClick={startMockSend} className="flex items-center gap-2 rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300">
                    <Send size={16} /> 开始发送
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="rounded-[18px] border border-white/8 bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">发送账号</div>
                      <div className="mt-1 text-xs text-textMuted">先选账号，再配置整轮群发</div>
                    </div>
                    <button type="button" onClick={() => setAccountPickerOpen(true)} className="rounded-[12px] bg-violet-400/12 px-3 py-2 text-sm text-violet-300 transition hover:bg-violet-400/18">选择账号</button>
                  </div>

                  <div className="mt-4 rounded-[16px] border border-white/8 bg-black/10 p-4">
                    <div className="text-xs tracking-[0.18em] text-textMuted">当前主账号</div>
                    <div className="mt-2 text-base font-semibold text-white">{activeAccount ? readAccountLabel(activeAccount) : '还没选账号'}</div>
                    <div className="mt-1 text-sm text-textMuted">{activeAccount ? `${activeAccount.phone || activeAccount.userId || '未识别'} · ${formatAccountStatus(activeAccount.status)}` : '点右上角“选择账号”后开始。'}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedAccounts.length === 0 ? <div className="text-sm text-textMuted">暂无发送账号</div> : selectedAccounts.map((account) => {
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

                <div className="rounded-[18px] border border-white/8 bg-panel p-4">
                  <div>
                    <div className="text-sm font-semibold text-white">发送策略</div>
                    <div className="mt-1 text-xs text-textMuted">把海浪页里常见的节奏参数先做成直观版</div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="space-y-2 text-sm">
                      <span className="text-textMuted">导入模式</span>
                      <select value={sendMode} onChange={(event) => setSendMode(event.target.value as typeof sendMode)} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30">
                        <option value="username">用户名单</option>
                        <option value="contact">联系人模式</option>
                        <option value="txt">TXT 模式</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm">
                      <span className="text-textMuted">批次并发</span>
                      <input type="number" min={1} max={20} value={groupConcurrency} onChange={(event) => setGroupConcurrency(Number(event.target.value) || 1)} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                    </label>
                    <label className="space-y-2 text-sm">
                      <span className="text-textMuted">发送间隔(秒)</span>
                      <input type="number" min={5} max={600} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value) || 5)} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-white">
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={dedupeEnabled} onChange={(event) => setDedupeEnabled(event.target.checked)} /> 去重发送</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} /> 自动回复联动</label>
                  </div>

                  <div className="mt-4 rounded-[16px] border border-white/8 bg-black/10 p-4 text-sm text-textMuted">
                    当前按 <span className="text-white">每批 {accountPerGroup}</span> 个账号、每 <span className="text-white">{intervalSeconds}</span> 秒推进一次。你要更激进或更保守，直接改这里就行。
                  </div>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="bg-card">
              <div className="text-lg font-semibold text-white">目标用户</div>
              <div className="mt-1 text-sm text-textMuted">海浪那边的群发入口也是先把目标导进去再跑，所以这里我把导入、整理、去重都塞在一个区域里。citeturn1open0turn1open1</div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <label className="block space-y-2 text-sm">
                    <span className="text-textMuted">目标用户名单</span>
                    <textarea rows={10} value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="一行一个，支持 @username / t.me/xxx / +8613xxxxxxx" className="w-full rounded-[14px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => importTargets(targetInput, { mode: 'replace', source: 'manual' })} className="rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">覆盖导入</button>
                    <button type="button" onClick={() => importTargets(targetInput, { mode: 'append', source: 'manual' })} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">追加导入</button>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">
                      <Import size={14} /> 导入 TXT / CSV
                      <input type="file" accept=".txt,.csv" className="hidden" onChange={handleTargetFileUpload} />
                    </label>
                    <button type="button" onClick={clearTargets} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空</button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                    <div className="text-xs tracking-[0.18em] text-textMuted">总目标</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{targets.length}</div>
                  </div>
                  <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                    <div className="text-xs tracking-[0.18em] text-textMuted">可发送</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{effectiveTargetCount}</div>
                  </div>
                  <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                    <div className="text-xs tracking-[0.18em] text-textMuted">重复目标</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{duplicateTargets}</div>
                  </div>
                  <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
                    <div className="text-xs tracking-[0.18em] text-textMuted">格式不对</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{invalidTargets}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {targets.length === 0 ? (
                  <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-12 text-center text-sm text-textMuted">还没有目标用户。</div>
                ) : targets.map((target) => (
                  <div key={target.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-panel px-4 py-3">
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
              <div className="text-lg font-semibold text-white">私信内容</div>
              <div className="mt-1 text-sm text-textMuted">消息区按海浪那种“大块编辑 + 少量关键选项”的感觉来，先不做花里胡哨的模板树。citeturn1open0turn1open1</div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[180px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <button type="button" onClick={() => setMessageType('text')} className={`flex w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition ${messageType === 'text' ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-white/8 bg-panel text-slate-200 hover:bg-white/[0.03]'}`}>
                    <FileText size={16} /> 文字消息
                  </button>
                  <button type="button" onClick={() => setMessageType('image_text')} className={`flex w-full items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition ${messageType === 'image_text' ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-white/8 bg-panel text-slate-200 hover:bg-white/[0.03]'}`}>
                    <ImagePlus size={16} /> 图文消息
                  </button>
                </div>

                <div className="space-y-4 rounded-[18px] border border-white/8 bg-panel p-4">
                  {messageType === 'image_text' ? (
                    <div className="rounded-[16px] border border-white/8 bg-black/10 p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">
                          <Upload size={14} /> 上传图片
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                        {imageUrl ? <button type="button" onClick={clearImage} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">删除图片</button> : null}
                        <div className="text-sm text-textMuted">{imageName || (imageUrl ? '已上传图片' : '还没上传图片')}</div>
                      </div>
                      {imageUrl ? <img src={imageUrl} alt="preview" className="mt-4 max-h-[200px] rounded-[14px] border border-white/8 object-cover" /> : null}
                    </div>
                  ) : null}

                  <label className="block space-y-2 text-sm">
                    <span className="text-textMuted">私信文案</span>
                    <textarea rows={8} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="直接写你要发给用户的话..." className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                  </label>
                </div>
              </div>
            </GlassPanel>
          </div>

          <div className="space-y-5">
            <GlassPanel className="bg-card sticky top-4">
              <div className="text-lg font-semibold text-white">实时日志</div>
              <div className="mt-1 text-sm text-textMuted">海浪公开页里有独立“私信日志”入口，我这里右侧先做成实时概览，完整明细放到日志页。citeturn1search0turn1open0</div>

              {lastActionMessage ? <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div> : null}

              <div className="mt-4 space-y-4">
                <div className="rounded-[18px] border border-white/8 bg-panel p-4">
                  <div className="text-sm font-semibold text-white">你现在只看这里</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div>发送账号：{selectedAccounts.length}</div>
                    <div>预览条数：{previewItems.length}</div>
                    <div>可发送目标：{effectiveTargetCount}</div>
                    <div>消息类型：{messageType === 'image_text' ? '图文私信' : '文字私信'}</div>
                    <div>最新一轮：{latestRun ? `${latestRun.sent} / ${latestRun.total}` : '还没开始'}</div>
                  </div>
                </div>

                <div className="rounded-[18px] border border-white/8 bg-panel p-4">
                  <div className="text-sm font-semibold text-white">预览队列</div>
                  <div className="mt-3 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                    {previewItems.length === 0 ? (
                      <div className="rounded-[16px] bg-black/10 px-4 py-10 text-center text-sm text-textMuted">还没有发送预览。</div>
                    ) : previewItems.map((item) => (
                      <div key={item.id} className="rounded-[14px] border border-white/8 bg-black/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate text-sm font-medium text-white">{item.targetValue}</div>
                          <div className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === 'sent' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-sky-400/10 text-sky-300'}`}>{item.status === 'sent' ? '已进队列' : '待发送'}</div>
                        </div>
                        <div className="mt-2 text-xs text-textMuted">账号：{item.accountLabel}</div>
                        <div className="mt-1 text-xs text-textMuted">第 {item.batchIndex + 1} 批 · 等待 {item.waitSeconds} 秒</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-white">选择发送账号</div>
                <div className="mt-1 text-sm text-textMuted">继续沿用账号管理那种表格选择器，不改成一堆小卡片。</div>
              </div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-[360px]">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" />
                  <input
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="搜索手机号 / 账号名 / 用户 ID"
                    className="h-11 w-full rounded-[12px] border border-white/8 bg-panel pl-11 pr-4 text-sm text-white outline-none focus:border-violet-400/30"
                  />
                </div>
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
                          <input type="checkbox" checked={checked} onChange={(event) => setDraftAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((item) => item !== account.id))} />
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
  const totalSent = useMemo(() => runs.reduce((sum, item) => sum + item.sent, 0), [runs])
  const totalRuns = runs.length

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(720px,1fr)_320px]">
      <GlassPanel className="bg-card min-h-[720px]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">私信日志</div>
            <div className="mt-1 text-sm text-textMuted">海浪公开页把“私信日志”单独做成模块，我这里也单独拆开，让发送页不再塞满明细。citeturn1search0turn1open0</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-textMuted">
            <div className="rounded-full bg-white/[0.05] px-3 py-2">总轮次 {totalRuns}</div>
            <div className="rounded-full bg-emerald-400/10 px-3 py-2 text-emerald-200">已进队列 {totalSent}</div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {runs.length === 0 ? (
            <div className="rounded-[18px] bg-panel px-4 py-14 text-center text-sm text-textMuted">还没有私信发送记录。</div>
          ) : runs.map((run) => (
            <div key={run.id} className="rounded-[18px] border border-white/8 bg-panel p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-base font-semibold text-white">{run.summary}</div>
                  <div className="mt-1 text-xs text-textMuted">{formatDateTimeFull(run.createdAt)}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-textMuted">
                  <div className="rounded-full bg-white/[0.05] px-3 py-1.5">账号 {run.accountCount}</div>
                  <div className="rounded-full bg-white/[0.05] px-3 py-1.5">目标 {run.total}</div>
                  <div className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-200">已进队列 {run.sent}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {run.items.map((item) => (
                  <div key={item.id} className="rounded-[14px] border border-white/8 bg-black/10 px-4 py-3">
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

      <GlassPanel className="bg-card">
        <div className="text-lg font-semibold text-white">日志摘要</div>
        <div className="mt-4 space-y-3">
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.18em] text-textMuted">总轮次</div>
            <div className="mt-2 text-2xl font-semibold text-white">{totalRuns}</div>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.18em] text-textMuted">已进队列</div>
            <div className="mt-2 text-2xl font-semibold text-white">{totalSent}</div>
          </div>
        </div>
      </GlassPanel>
    </div>
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
    <div className="grid gap-5 xl:grid-cols-[minmax(720px,1fr)_320px]">
      <GlassPanel className="bg-card min-h-[720px]">
        <div>
          <div className="text-lg font-semibold text-white">用户采集</div>
          <div className="mt-1 text-sm text-textMuted">海浪把“用户采集”做成独立入口，我这里也拆开，先做成名单整理台，后面再接真实采集源。citeturn1search0turn1open0</div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            {(['manual', 'group_members', 'comment_users', 'react_users'] as DirectMessageCollectorMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => setCollectorMode(mode)} className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${collectorMode === mode ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-white/8 bg-panel text-slate-200 hover:bg-white/[0.03]'}`}>
                {readCollectorModeLabel(mode)}
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-[18px] border border-white/8 bg-panel p-4">
            <div className="rounded-[14px] bg-black/10 px-4 py-3 text-sm text-textMuted">当前先把这块做成“采集名单整理台”。你把外部采到的用户贴进来，我先给你做识别、去重、回流发送目标。</div>
            <textarea rows={12} value={collectorInput} onChange={(event) => setCollectorInput(event.target.value)} placeholder="把采集到的用户名单贴到这里，一行一个。" className="w-full rounded-[14px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => collectUsers(collectorInput, readCollectorModeLabel(collectorMode))} className="rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">识别名单</button>
              <button type="button" onClick={appendCollectedUsersToTargets} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-300">加入发送目标</button>
              <button type="button" onClick={clearCollectedUsers} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空</button>
            </div>
            <div className="rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="text-lg font-semibold text-white">采集结果</div>
        <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
          {collectedUsers.length === 0 ? (
            <div className="rounded-[16px] bg-panel px-4 py-12 text-center text-sm text-textMuted">还没有采集结果。</div>
          ) : collectedUsers.map((item) => (
            <div key={item.id} className="rounded-[16px] border border-white/8 bg-panel p-4">
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">自动回复</div>
          <div className="mt-1 text-sm text-textMuted">海浪公开功能里也有“自动回复”入口，我这里先把规则台做出来，后面再接真实入站。citeturn1search0turn1open0</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} /> 开启自动回复</label>
          <button type="button" onClick={addAutoReplyRule} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-400/18">
            <Plus size={14} /> 新增规则
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {autoReplyRules.map((rule, index) => (
          <div key={rule.id} className="rounded-[18px] border border-white/8 bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">规则 {index + 1}</div>
              <div className="flex items-center gap-3 text-sm text-textMuted">
                <label className="inline-flex items-center gap-2 text-white"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateAutoReplyRule(rule.id, { enabled: event.target.checked })} /> 启用</label>
                <button type="button" onClick={() => removeAutoReplyRule(rule.id)} className="rounded-[10px] bg-white/[0.05] px-3 py-2 text-white transition hover:bg-white/[0.08]">删除</button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm md:col-span-1">
                <span className="text-textMuted">触发词</span>
                <input value={rule.keyword} onChange={(event) => updateAutoReplyRule(rule.id, { keyword: event.target.value })} placeholder="价格 / 购买 / 客服" className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">匹配方式</span>
                <select value={rule.matchMode} onChange={(event) => updateAutoReplyRule(rule.id, { matchMode: event.target.value as 'contains' | 'exact' })} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30">
                  <option value="contains">包含匹配</option>
                  <option value="exact">完全匹配</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">冷却时间(秒)</span>
                <input type="number" min={0} value={rule.cooldownSeconds} onChange={(event) => updateAutoReplyRule(rule.id, { cooldownSeconds: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
              </label>
            </div>

            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-textMuted">自动回复内容</span>
              <textarea rows={5} value={rule.replyText} onChange={(event) => updateAutoReplyRule(rule.id, { replyText: event.target.value })} placeholder="用户触发后自动回复的话..." className="w-full rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-white outline-none focus:border-violet-400/30" />
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
