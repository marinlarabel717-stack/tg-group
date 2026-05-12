import { memo, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, MessageSquareText, Play, RefreshCw, Send, Upload, UserRound, Users, XCircle } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus } from '../../lib/ui-text'

interface ParsedTargetResult {
  raw: string[]
  valid: string[]
  invalid: string[]
  duplicates: string[]
}

interface DmPreviewItem {
  id: string
  target: string
  accountId: number | null
  accountLabel: string
  status: 'queued'
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function parseTargets(input: string): ParsedTargetResult {
  const raw = input
    .split(/\r?\n|,|，|;|；|\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    const normalized = item.toLowerCase()
    const isUsername = /^@?[a-zA-Z0-9_]{5,}$/.test(item)
    const isTgLink = /^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,}(?:\/[0-9]+)?$/i.test(item)
    const isPhone = /^\+?\d{6,15}$/.test(item)

    if (!isUsername && !isTgLink && !isPhone) {
      invalid.push(item)
      continue
    }

    const finalValue = isUsername && !item.startsWith('@') ? `@${item}` : item
    const dedupeKey = finalValue.toLowerCase()
    if (seen.has(dedupeKey)) {
      duplicates.push(finalValue)
      continue
    }

    seen.add(dedupeKey)
    valid.push(finalValue)
  }

  return { raw, valid, invalid, duplicates }
}

export default memo(function DirectMessageView() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)

  const [accountSearch, setAccountSearch] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [targetInput, setTargetInput] = useState('')
  const [sendMode, setSendMode] = useState<'username' | 'contact' | 'txt'>('username')
  const [messageType, setMessageType] = useState<'text' | 'image_text'>('text')
  const [messageText, setMessageText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [groupConcurrency, setGroupConcurrency] = useState(3)
  const [accountPerGroup, setAccountPerGroup] = useState(5)
  const [intervalSeconds, setIntervalSeconds] = useState(25)
  const [dedupeEnabled, setDedupeEnabled] = useState(true)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [previewItems, setPreviewItems] = useState<DmPreviewItem[]>([])
  const [lastActionMessage, setLastActionMessage] = useState('')

  useEffect(() => {
    void initAccounts()
  }, [initAccounts])

  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const nickname = readAccountLabel(account).toLowerCase()
      return [nickname, account.username || '', account.phone || '', account.userId || ''].some((value) => value.toLowerCase().includes(keyword))
    })
  }, [accountSearch, accounts])

  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedAccountIds.includes(account.id)), [accounts, selectedAccountIds])
  const parsedTargets = useMemo(() => parseTargets(targetInput), [targetInput])

  const effectiveTargets = useMemo(() => {
    if (!dedupeEnabled) return parsedTargets.raw.filter((item) => !parsedTargets.invalid.includes(item))
    return parsedTargets.valid
  }, [dedupeEnabled, parsedTargets])

  const summary = useMemo(() => ({
    accountCount: selectedAccounts.length,
    targetCount: effectiveTargets.length,
    invalidCount: parsedTargets.invalid.length,
    duplicateCount: parsedTargets.duplicates.length,
    estimatedSendCount: selectedAccounts.length > 0 ? effectiveTargets.length : 0
  }), [selectedAccounts.length, effectiveTargets.length, parsedTargets.invalid.length, parsedTargets.duplicates.length])

  const toggleAccount = (accountId: number) => {
    setSelectedAccountIds((current) => current.includes(accountId) ? current.filter((item) => item !== accountId) : [...current, accountId])
    setPreviewItems([])
  }

  const generatePreview = () => {
    if (selectedAccounts.length === 0) {
      setPreviewItems([])
      setLastActionMessage('先选发送账号，再生成私信预览。')
      return
    }
    if (effectiveTargets.length === 0) {
      setPreviewItems([])
      setLastActionMessage('先贴用户名单 / t.me 链接 / 手机号，再生成私信预览。')
      return
    }
    if (!messageText.trim() && !(messageType === 'image_text' && imageUrl.trim())) {
      setPreviewItems([])
      setLastActionMessage('先把私信内容填好，再生成私信预览。')
      return
    }

    const nextItems = effectiveTargets.map((target, index) => {
      const account = selectedAccounts[index % selectedAccounts.length]
      return {
        id: createId('dm_preview'),
        target,
        accountId: account?.id ?? null,
        accountLabel: account ? readAccountLabel(account) : '未分配账号',
        status: 'queued' as const
      }
    })

    setPreviewItems(nextItems)
    setLastActionMessage(`已生成 ${nextItems.length} 条私信预览。当前先把操作台接好，下一步再接真实私信发送链路。`)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(620px,1fr)_360px]">
      <GlassPanel className="bg-card">
        <div>
          <div className="text-lg font-semibold text-white">第 1 步：选择发送账号</div>
          <div className="mt-1 text-sm text-textMuted">参考你给的网站，我先做成左边选账号、中间配发送、右边看结果的单页工作台。</div>
        </div>

        <div className="mt-4 space-y-4">
          <input
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="搜索账号名 / 用户名 / 手机号"
            className="h-11 w-full rounded-[12px] border border-white/8 bg-panel px-4 text-sm text-white outline-none focus:border-violet-400/30"
          />

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => { setSelectedAccountIds(filteredAccounts.map((item) => item.id)); setPreviewItems([]) }} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
            <button type="button" onClick={() => { setSelectedAccountIds([]); setPreviewItems([]) }} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.08]">清空</button>
          </div>

          <div className="rounded-[18px] bg-panel p-4">
            <div className="text-sm font-semibold text-white">已选账号</div>
            <div className="mt-2 text-sm text-textMuted">{selectedAccounts.length > 0 ? `当前已选 ${selectedAccounts.length} 个发送账号` : '还没选择发送账号。'}</div>
          </div>

          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {loading && accounts.length === 0 ? <div className="rounded-[16px] bg-panel px-4 py-10 text-center text-sm text-textMuted">正在读取账号...</div> : null}
            {!loading && filteredAccounts.length === 0 ? <div className="rounded-[16px] bg-panel px-4 py-10 text-center text-sm text-textMuted">没有匹配到账号。</div> : null}
            {filteredAccounts.map((account) => {
              const checked = selectedAccountIds.includes(account.id)
              return (
                <button key={account.id} type="button" onClick={() => toggleAccount(account.id)} className={`w-full rounded-[16px] border p-4 text-left transition ${checked ? 'border-violet-400/30 bg-violet-400/8' : 'border-white/8 bg-panel hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{readAccountLabel(account)}</div>
                      <div className="mt-1 truncate text-xs text-textMuted">{account.phone || account.userId || '未识别'} · {formatAccountStatus(account.status)}</div>
                    </div>
                    {checked ? <CheckCircle2 size={18} className="shrink-0 text-emerald-300" /> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </GlassPanel>

      <div className="space-y-5">
        <GlassPanel className="bg-card sticky top-4 z-10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">私信用户</div>
              <div className="mt-1 text-sm text-textMuted">先做第一版主工作台：选账号、贴目标、配文案、生成发送预览。</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={generatePreview} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                <RefreshCw size={16} /> 生成发送预览
              </button>
              <button type="button" onClick={() => { setPreviewItems([]); setLastActionMessage('当前私信预览已清空。') }} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空</button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="bg-card">
          <div className="text-lg font-semibold text-white">第 2 步：导入目标用户</div>
          <div className="mt-1 text-sm text-textMuted">支持用户名单、手机号、t.me 链接。后面再接 TXT 导入和真实联系人读取。</div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span className="text-textMuted">导入模式</span>
              <select value={sendMode} onChange={(event) => setSendMode(event.target.value as 'username' | 'contact' | 'txt')} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30">
                <option value="username">用户名单模式</option>
                <option value="contact">联系人模式</option>
                <option value="txt">TXT 粘贴模式</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-textMuted">分组并发</span>
              <input type="number" min={1} max={20} value={groupConcurrency} onChange={(event) => setGroupConcurrency(Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-textMuted">每组账号</span>
              <input type="number" min={1} max={50} value={accountPerGroup} onChange={(event) => setAccountPerGroup(Math.max(1, Number(event.target.value) || 1))} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>
          </div>

          <label className="mt-4 block space-y-2 text-sm">
            <span className="text-textMuted">目标用户名单</span>
            <textarea rows={10} value={targetInput} onChange={(event) => { setTargetInput(event.target.value); setPreviewItems([]) }} placeholder="一行一个，支持 @username / t.me/xxx / +8613xxxxxxx" className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">识别到目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.targetCount}</div></div>
            <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">重复目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.duplicateCount}</div></div>
            <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">无效目标</div><div className="mt-2 text-xl font-semibold text-white">{summary.invalidCount}</div></div>
            <div className="rounded-[16px] bg-panel px-4 py-4"><div className="text-xs text-textMuted">预计发送</div><div className="mt-2 text-xl font-semibold text-white">{summary.estimatedSendCount}</div></div>
          </div>
        </GlassPanel>

        <GlassPanel className="bg-card">
          <div className="text-lg font-semibold text-white">第 3 步：私信内容设置</div>
          <div className="mt-1 text-sm text-textMuted">参考你让我看的页面，先把最常用的参数收口：内容、间隔、去重、自动回复。</div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span className="text-textMuted">消息类型</span>
              <select value={messageType} onChange={(event) => setMessageType(event.target.value as 'text' | 'image_text')} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30">
                <option value="text">纯文字</option>
                <option value="image_text">图文</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-textMuted">发送间隔（秒）</span>
              <input type="number" min={5} max={600} value={intervalSeconds} onChange={(event) => setIntervalSeconds(Math.max(5, Number(event.target.value) || 5))} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
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
            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-textMuted">图片 URL</span>
              <input value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setPreviewItems([]) }} placeholder="https://..." className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
            </label>
          ) : null}

          <label className="mt-4 block space-y-2 text-sm">
            <span className="text-textMuted">私信内容</span>
            <textarea rows={7} value={messageText} onChange={(event) => { setMessageText(event.target.value); setPreviewItems([]) }} placeholder="直接写你要发给用户的话..." className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" />
          </label>
        </GlassPanel>
      </div>

      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">运行结果</div>
            <div className="mt-1 text-sm text-textMuted">这一栏先给你看账号、目标、预览分配，后面再接真实发送日志。</div>
          </div>
          <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{previewItems.length} 条</div>
        </div>

        {lastActionMessage ? <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div> : null}

        <div className="mt-4 space-y-4">
          <div className="rounded-[18px] border border-white/8 bg-panel p-4">
            <div className="text-sm font-semibold text-white">你现在只看这里</div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div className="flex items-center gap-2"><Users size={14} className="text-violet-300" /> 发送账号：{summary.accountCount}</div>
              <div className="flex items-center gap-2"><UserRound size={14} className="text-emerald-300" /> 目标用户：{summary.targetCount}</div>
              <div className="flex items-center gap-2"><MessageSquareText size={14} className="text-sky-300" /> 消息类型：{messageType === 'image_text' ? '图文私信' : '纯文字私信'}</div>
              <div className="flex items-center gap-2"><Send size={14} className="text-amber-200" /> 发送间隔：{intervalSeconds} 秒</div>
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-panel p-4">
            <div className="text-sm font-semibold text-white">当前策略</div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div>• 导入模式：{sendMode === 'username' ? '用户名单模式' : sendMode === 'contact' ? '联系人模式' : 'TXT 粘贴模式'}</div>
              <div>• 分组并发：{groupConcurrency}</div>
              <div>• 每组账号：{accountPerGroup}</div>
              <div>• 去重发送：{dedupeEnabled ? '开启' : '关闭'}</div>
              <div>• 自动回复：{autoReplyEnabled ? '开启' : '关闭'}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 max-h-[760px] space-y-3 overflow-y-auto pr-1">
          {previewItems.length === 0 ? (
            <div className="rounded-[18px] bg-panel px-4 py-10 text-center text-sm text-textMuted">
              还没有发送预览。先选账号、贴目标用户，再点“生成发送预览”。
            </div>
          ) : previewItems.map((item) => (
            <div key={item.id} className="rounded-[16px] bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{item.target}</div>
                <div className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-300">待发送</div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-200">
                <div>分配账号：{item.accountLabel}</div>
                <div>消息类型：{messageType === 'image_text' ? '图文私信' : '纯文字私信'}</div>
                <div>发送间隔：{intervalSeconds} 秒</div>
              </div>
            </div>
          ))}
        </div>

        {(parsedTargets.invalid.length > 0 || parsedTargets.duplicates.length > 0) ? (
          <div className="mt-4 space-y-3">
            {parsedTargets.invalid.length > 0 ? (
              <div className="rounded-[16px] border border-rose-400/15 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
                <div className="flex items-center gap-2 font-medium text-white"><XCircle size={14} /> 这些目标格式不对</div>
                <div className="mt-2 line-clamp-4 text-rose-100">{parsedTargets.invalid.join('、')}</div>
              </div>
            ) : null}
            {parsedTargets.duplicates.length > 0 ? (
              <div className="rounded-[16px] border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
                <div className="flex items-center gap-2 font-medium text-white"><Upload size={14} /> 这些目标重复了</div>
                <div className="mt-2 line-clamp-4 text-amber-100">{parsedTargets.duplicates.join('、')}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassPanel>
    </div>
  )
})
