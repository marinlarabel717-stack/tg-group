import { useMemo, useState } from 'react'
import { Bot, Clock3, FolderSearch2, Hash, RadioTower, SearchCheck, Trash2, Users } from 'lucide-react'
import { GlassPanel } from '../components/common/glasspanel'
import { useAccountStore } from '../stores/accountstore'
import type { GroupCollectorFilterPayload, GroupCollectorLastSeenBucket, GroupCollectorMode, GroupCollectorResult, GroupCollectorRole, GroupCollectorUserPayload } from '../types'

type CollectorTabKey = 'groups' | 'channels' | 'keywords' | 'logs'
type LogLevel = 'info' | 'success' | 'warning' | 'error'

interface CollectorLogItem {
  id: string
  level: LogLevel
  message: string
  createdAt: string
}

const tabs: Array<{ key: CollectorTabKey; label: string; icon: typeof SearchCheck }> = [
  { key: 'groups', label: '采集群组', icon: FolderSearch2 },
  { key: 'channels', label: '采集频道', icon: RadioTower },
  { key: 'keywords', label: '采集关键词', icon: Hash },
  { key: 'logs', label: '采集日志', icon: Clock3 }
]

const modeOptions: Array<{ value: GroupCollectorMode; label: string; description: string }> = [
  { value: 'public_members', label: '公开群组（采集所有）', description: '能直接读取成员列表的群，按成员列表完整采集。' },
  { value: 'hidden_history', label: '隐藏成员群组（采集历史聊天）', description: '看不到成员列表时，改为扫描历史消息发送者。' }
]

const roleOptions: Array<{ value: GroupCollectorRole; label: string }> = [
  { value: 'owner', label: '群主' },
  { value: 'admin', label: '管理员' }
]

const avatarOptions = [
  { value: 'has', label: '有头像' },
  { value: 'none', label: '无头像' }
] as const

const usernameOptions = [
  { value: 'has', label: '有用户名' },
  { value: 'none', label: '无用户名' }
] as const

const premiumOptions = [
  { value: 'premium', label: '有会员' },
  { value: 'normal', label: '无会员' }
] as const

const lastSeenOptions: Array<{ value: GroupCollectorLastSeenBucket; label: string }> = [
  { value: 'online', label: '在线' },
  { value: 'recent', label: '最近在线' },
  { value: 'week', label: '近一周' },
  { value: 'month', label: '近一月' },
  { value: 'offline', label: '离线/更早' }
]

function createLog(level: LogLevel, message: string): CollectorLogItem {
  return {
    id: `collector_log_${Math.random().toString(36).slice(2, 10)}`,
    level,
    message,
    createdAt: new Date().toISOString()
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
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

function toggleSelection<T extends string>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] border px-3 py-2 text-sm transition ${active ? 'border-cyan-300/24 bg-cyan-300/10 text-cyan-200' : 'border-white/[0.07] bg-white/[0.03] text-slate-200 hover:border-white/[0.12] hover:bg-white/[0.05]'}`}
    >
      {label}
    </button>
  )
}

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'info' | 'success' | 'warning' }) {
  const toneClassName = tone === 'success'
    ? 'border-emerald-300/14 bg-emerald-300/8 text-emerald-50'
    : tone === 'warning'
      ? 'border-amber-300/14 bg-amber-300/8 text-amber-50'
      : tone === 'info'
        ? 'border-cyan-300/14 bg-cyan-300/8 text-cyan-50'
        : 'border-white/[0.06] bg-white/[0.03] text-white'

  return (
    <div className={`rounded-[16px] border px-4 py-3 ${toneClassName}`}>
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function ResultBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }) {
  const toneClassName = tone === 'success'
    ? 'bg-emerald-300/12 text-emerald-200'
    : tone === 'warning'
      ? 'bg-amber-300/12 text-amber-200'
      : tone === 'danger'
        ? 'bg-rose-300/12 text-rose-200'
        : tone === 'info'
          ? 'bg-cyan-300/12 text-cyan-200'
          : 'bg-white/[0.06] text-slate-200'

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${toneClassName}`}>{label}</span>
}

function renderRoleTone(role: GroupCollectorRole) {
  if (role === 'owner') return 'warning' as const
  if (role === 'admin') return 'info' as const
  return 'neutral' as const
}

function renderLastSeenTone(bucket: GroupCollectorLastSeenBucket) {
  if (bucket === 'online') return 'success' as const
  if (bucket === 'recent' || bucket === 'week') return 'info' as const
  if (bucket === 'month') return 'warning' as const
  return 'neutral' as const
}

function GroupCollectorWorkbench() {
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)

  const [mode, setMode] = useState<GroupCollectorMode>('public_members')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [source, setSource] = useState('')
  const [participantLimit, setParticipantLimit] = useState('')
  const [historyLimit, setHistoryLimit] = useState('1000')
  const [roleFilters, setRoleFilters] = useState<GroupCollectorRole[]>([])
  const [onlyBots, setOnlyBots] = useState(false)
  const [avatarFilters, setAvatarFilters] = useState<Array<'has' | 'none'>>([])
  const [usernameFilters, setUsernameFilters] = useState<Array<'has' | 'none'>>([])
  const [premiumFilters, setPremiumFilters] = useState<Array<'premium' | 'normal'>>([])
  const [lastSeenFilters, setLastSeenFilters] = useState<GroupCollectorLastSeenBucket[]>([])
  const [collecting, setCollecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<GroupCollectorResult | null>(null)
  const [items, setItems] = useState<GroupCollectorUserPayload[]>([])
  const [logs, setLogs] = useState<CollectorLogItem[]>([])

  const appendLog = (level: LogLevel, message: string) => {
    setLogs((current) => [createLog(level, message), ...current].slice(0, 120))
  }

  const filters = useMemo<GroupCollectorFilterPayload>(() => ({
    roleFilters,
    onlyBots,
    avatarFilters,
    usernameFilters,
    premiumFilters,
    lastSeenFilters
  }), [avatarFilters, lastSeenFilters, onlyBots, premiumFilters, roleFilters, usernameFilters])

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) || null,
    [accountId, accounts]
  )

  const handleCollect = async () => {
    if (!accountId) {
      setErrorMessage('请先选择采集账号。')
      appendLog('warning', '采集未开始：还没有选择采集账号。')
      return
    }
    if (!source.trim()) {
      setErrorMessage('请先填写群链接或群用户名。')
      appendLog('warning', '采集未开始：还没有填写群链接或群用户名。')
      return
    }

    setCollecting(true)
    setErrorMessage('')
    setResult(null)
    setItems([])
    appendLog('info', `开始采集：${mode === 'public_members' ? '公开群组' : '隐藏成员群组'} / ${source.trim()}`)

    try {
      const next = await window.desktopDirectMessage?.collectGroupUsers({
        accountId,
        source: source.trim(),
        mode,
        participantLimit: participantLimit.trim() ? Number(participantLimit) : undefined,
        historyLimit: historyLimit.trim() ? Number(historyLimit) : undefined,
        filters
      })

      if (!next) {
        throw new Error('采集服务没有返回结果。')
      }

      setResult(next)
      setItems(next.items)
      appendLog('success', `${next.message} 原始 ${next.total}，保留 ${next.matched}，过滤 ${next.filtered}。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      appendLog('error', `采集失败：${message}`)
    } finally {
      setCollecting(false)
    }
  }

  const clearFilters = () => {
    setRoleFilters([])
    setOnlyBots(false)
    setAvatarFilters([])
    setUsernameFilters([])
    setPremiumFilters([])
    setLastSeenFilters([])
    appendLog('info', '已清空采集过滤参数。')
  }

  const clearResults = () => {
    setResult(null)
    setItems([])
    setErrorMessage('')
    appendLog('info', '已清空本轮采集结果。')
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="border border-white/[0.05] bg-panel/92 shadow-none">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[18px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(10,16,30,0.66)_0%,rgba(7,12,24,0.82)_100%)] p-5">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-cyan-300/12 bg-cyan-300/8 text-cyan-200">
                <Users size={18} />
              </div>
              <div>
                <div className="text-[22px] font-bold text-white">采集群组</div>
                <div className="mt-2 text-sm leading-6 text-white/64">
                  这版先只做群组采集。所有过滤参数都按你的勾选执行，不预设默认筛选。
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-white/88">采集模式</div>
                <div className="grid gap-3">
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMode(option.value)}
                      className={`rounded-[16px] border px-4 py-3 text-left transition ${mode === option.value ? 'border-cyan-300/24 bg-cyan-300/10' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]'}`}
                    >
                      <div className="text-sm font-medium text-white">{option.label}</div>
                      <div className="mt-1 text-xs leading-5 text-white/50">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-white/78">
                  <span className="font-medium">采集账号</span>
                  <select
                    value={accountId ?? ''}
                    onChange={(event) => setAccountId(event.target.value ? Number(event.target.value) : null)}
                    className="h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-cyan-300/24"
                  >
                    <option value="">请选择账号</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {readAccountLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm text-white/78">
                  <span className="font-medium">群链接 / 群用户名</span>
                  <input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="例如 @groupname 或 https://t.me/groupname"
                    className="h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white placeholder:text-white/26 outline-none transition focus:border-cyan-300/24"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-white/78">
                  <span className="font-medium">公开群组采集数量</span>
                  <input
                    value={participantLimit}
                    onChange={(event) => setParticipantLimit(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="留空表示尽量全量采集"
                    className="h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white placeholder:text-white/26 outline-none transition focus:border-cyan-300/24"
                  />
                </label>

                <label className="space-y-2 text-sm text-white/78">
                  <span className="font-medium">隐藏成员历史消息数</span>
                  <input
                    value={historyLimit}
                    onChange={(event) => setHistoryLimit(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="例如 1000"
                    className="h-11 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white placeholder:text-white/26 outline-none transition focus:border-cyan-300/24"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white/88">采集过滤</div>
                <div className="mt-1 text-xs leading-5 text-white/46">不默认勾选。你手动勾哪些，就按哪些条件过滤。</div>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.05]"
              >
                <Trash2 size={14} />
                清空筛选
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">身份</div>
                <div className="flex flex-wrap gap-2">
                  {roleOptions.map((item) => (
                    <FilterChip
                      key={item.value}
                      active={roleFilters.includes(item.value)}
                      label={item.label}
                      onClick={() => setRoleFilters((current) => toggleSelection(current, item.value))}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">账号类型</div>
                <div className="flex flex-wrap gap-2">
                  <FilterChip active={onlyBots} label="机器人" onClick={() => setOnlyBots((current) => !current)} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">头像</div>
                <div className="flex flex-wrap gap-2">
                  {avatarOptions.map((item) => (
                    <FilterChip
                      key={item.value}
                      active={avatarFilters.includes(item.value)}
                      label={item.label}
                      onClick={() => setAvatarFilters((current) => toggleSelection(current, item.value))}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">用户名</div>
                <div className="flex flex-wrap gap-2">
                  {usernameOptions.map((item) => (
                    <FilterChip
                      key={item.value}
                      active={usernameFilters.includes(item.value)}
                      label={item.label}
                      onClick={() => setUsernameFilters((current) => toggleSelection(current, item.value))}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">会员</div>
                <div className="flex flex-wrap gap-2">
                  {premiumOptions.map((item) => (
                    <FilterChip
                      key={item.value}
                      active={premiumFilters.includes(item.value)}
                      label={item.label}
                      onClick={() => setPremiumFilters((current) => toggleSelection(current, item.value))}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs tracking-[0.16em] text-white/34">在线时间</div>
                <div className="flex flex-wrap gap-2">
                  {lastSeenOptions.map((item) => (
                    <FilterChip
                      key={item.value}
                      active={lastSeenFilters.includes(item.value)}
                      label={item.label}
                      onClick={() => setLastSeenFilters((current) => toggleSelection(current, item.value))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={collecting || loading}
          onClick={() => void handleCollect()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[16px] border border-cyan-300/16 bg-[linear-gradient(180deg,rgba(19,31,55,0.98)_0%,rgba(9,17,34,1)_100%)] px-5 text-sm font-medium text-cyan-50 transition hover:border-cyan-300/28 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {collecting ? <Bot size={16} className="animate-pulse" /> : <SearchCheck size={16} className="text-cyan-300" />}
          {collecting ? '采集中...' : '开始采集'}
        </button>

        <button
          type="button"
          onClick={clearResults}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-5 text-sm font-medium text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.05]"
        >
          <Trash2 size={15} />
          清空结果
        </button>

        <div className="text-sm text-white/52">
          当前账号：<span className="text-white/82">{selectedAccount ? readAccountLabel(selectedAccount) : '未选择'}</span>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[14px] border border-rose-300/[0.14] bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="原始用户" value={String(result?.total ?? 0)} tone="neutral" />
        <StatCard label="命中结果" value={String(result?.matched ?? items.length)} tone="success" />
        <StatCard label="过滤/跳过" value={String(result?.filtered ?? 0)} tone="warning" />
      </div>

      <GlassPanel className="border border-white/[0.05] bg-panel/92 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white/88">采集结果</div>
            <div className="mt-1 text-xs text-white/44">先把“采集群组”做出来，后面再补导出和一键加入私信目标池。</div>
          </div>
          <div className="text-sm text-white/45">共 {items.length} 条</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[16px] border border-white/[0.05]">
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead className="sticky top-0 bg-[#0b1321] text-xs uppercase tracking-[0.12em] text-white/42">
                <tr>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">身份</th>
                  <th className="px-4 py-3">属性</th>
                  <th className="px-4 py-3">在线</th>
                  <th className="px-4 py-3">可用目标</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-white/36">还没有采集结果，先选择参数后开始采集。</td>
                  </tr>
                ) : items.map((item) => (
                  <tr key={item.userId} className="border-t border-white/[0.05] bg-white/[0.01] align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{item.displayName}</div>
                      <div className="mt-1 text-xs text-white/42">ID: {item.userId}</div>
                      <div className="mt-1 text-xs text-white/42">@{item.username || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <ResultBadge label={item.role === 'owner' ? '群主' : item.role === 'admin' ? '管理员' : '普通成员'} tone={renderRoleTone(item.role)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.isBot ? <ResultBadge label="机器人" tone="warning" /> : null}
                        <ResultBadge label={item.hasAvatar ? '有头像' : '无头像'} tone={item.hasAvatar ? 'info' : 'neutral'} />
                        <ResultBadge label={item.hasUsername ? '有用户名' : '无用户名'} tone={item.hasUsername ? 'info' : 'neutral'} />
                        <ResultBadge label={item.isPremium ? '会员' : '普通'} tone={item.isPremium ? 'success' : 'neutral'} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ResultBadge label={item.lastSeenLabel} tone={renderLastSeenTone(item.lastSeenBucket)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-white">{item.targetValue || '暂无可直接发送目标'}</div>
                      <div className="mt-1 text-xs text-white/38">来源：{item.sourceLabel}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="border border-white/[0.05] bg-panel/92 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white/88">本轮日志</div>
            <div className="mt-1 text-xs text-white/44">先把群组采集的开始 / 成功 / 失败过程放在这里。</div>
          </div>
          <button
            type="button"
            onClick={() => setLogs([])}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-200 transition hover:border-white/[0.12] hover:bg-white/[0.05]"
          >
            <Trash2 size={14} />
            清空日志
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {logs.length === 0 ? (
            <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-4 py-6 text-sm text-white/34">本轮还没有日志，开始采集后这里会实时记录。</div>
          ) : logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm text-slate-200">
              <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${log.level === 'success' ? 'bg-emerald-300' : log.level === 'warning' ? 'bg-amber-300' : log.level === 'error' ? 'bg-rose-300' : 'bg-cyan-300'}`} />
              <div className="min-w-0 flex-1">
                <div className="break-words leading-6 text-white/82">{log.message}</div>
                <div className="mt-1 text-xs text-white/34">{formatTime(log.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  )
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <GlassPanel className="border border-white/[0.05] bg-panel/92 shadow-none">
      <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.03] p-6">
        <div className="text-[20px] font-bold text-white">{title}</div>
        <div className="mt-3 max-w-[760px] text-sm leading-6 text-white/56">{description}</div>
      </div>
    </GlassPanel>
  )
}

export default function SessionManagerModule() {
  const [activeTab, setActiveTab] = useState<CollectorTabKey>('groups')

  const tabContent = useMemo(() => {
    if (activeTab === 'groups') return <GroupCollectorWorkbench />
    if (activeTab === 'channels') return <PlaceholderTab title="采集频道" description="频道采集下一轮再接，后面会按评论用户 / 反应用户两条线继续做。" />
    if (activeTab === 'keywords') return <PlaceholderTab title="采集关键词" description="关键词采集下一轮再接，后面会按指定来源 + 关键词命中消息发送者来做。" />
    return <PlaceholderTab title="采集日志" description="独立日志中心下一轮再收口。目前群组采集日志已经先落在“采集群组”页底部。" />
  }, [activeTab])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = tab.key === activeTab
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-white/[0.12] bg-cyan-300/10 text-cyan-200' : 'border-white/[0.06] bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {tabContent}
    </div>
  )
}
