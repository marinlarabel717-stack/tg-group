import { memo, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { FileClock, KeyRound, ShieldCheck, ShieldX, SquareTerminal, Trash2, UserRoundPen } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { CheckResultDialog } from '../accounts/checkresultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useUIStore } from '../../stores/uistore'
import { useBatchCreateStore } from '../../stores/batchcreatestore'
import { useOtherToolsStore } from '../../stores/othertoolsstore'
import type { CheckLogEntry, CheckLogLevel, OtherToolsSniperListenerLogEntry, ProfileOperationAction, ProfileOperationLogEntry, ProfileOperationProgressOverview, ProxyCheckLogEntry, SessionManagerLogEntry, SessionManagerProgressState, TwoFactorAction, TwoFactorLogEntry, TwoFactorProgressOverview } from '../../types'
import { isGeoRestrictedError } from '../../lib/ui-text'

function formatLogTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '[--:--:--]'

  return `[${new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)}]`
}

function getAccountLogLineClass(log: CheckLogEntry) {
  if (log.status === 'alive') return 'text-emerald-300'
  if (log.status === 'limited') return 'text-yellow-300'
  if (log.status === 'temporary_limited') return 'text-orange-300'
  if (log.status === 'geo_restricted') return 'text-lime-300'
  if (log.status === 'multi_ip') return 'text-pink-300'
  if (log.status === 'frozen') return 'text-blue-300'
  if (log.status === 'session_expired' || log.status === 'not_logged_in') return 'text-rose-300'
  if (log.status === 'banned') return 'text-rose-300'
  if (log.status === 'timeout') return 'text-violet-300'
  if (log.status === 'unknown' && isGeoRestrictedError(log.message)) return 'text-lime-300'
  if (log.status === 'unknown') return 'text-slate-200'
  if (log.message.includes('本次检测已完成')) return 'text-emerald-300'
  return 'text-white'
}

function getLevelClass(level: CheckLogLevel) {
  if (level === 'success') return 'text-emerald-300'
  if (level === 'error') return 'text-rose-300'
  if (level === 'warning') return 'text-amber-200'
  return 'text-white'
}

function getTwoFactorLineClass(log: TwoFactorLogEntry) {
  return getLevelClass(log.level)
}

function getProfileLineClass(log: ProfileOperationLogEntry) {
  return getLevelClass(log.level)
}

function getProxyLogLineClass(log: ProxyCheckLogEntry) {
  if (log.level === 'success') return 'text-emerald-300'
  if (log.level === 'error') return 'text-rose-300'
  if (log.level === 'warning') return 'text-amber-200'
  return 'text-white'
}

function getSniperLogLineClass(log: OtherToolsSniperListenerLogEntry) {
  return getLevelClass(log.level)
}

function getSessionCleanupLineClass(log: SessionManagerLogEntry) {
  return getLevelClass(log.level)
}

function readTwoFactorActionLabel(action: TwoFactorAction | null) {
  if (action === 'change-2fa') return '更改 2FA'
  if (action === 'disable-2fa') return '关闭 2FA'
  if (action === 'reset-2fa') return '重置 2FA'
  return '2FA 管理'
}

function readProfileActionLabel(action: ProfileOperationAction | null) {
  switch (action) {
    case 'random-profile': return '一键随机更换'
    case 'random-avatar': return '随机生成头像'
    case 'random-nickname': return '随机生成昵称'
    case 'random-username': return '随机生成用户名'
    case 'random-bio': return '随机生成简介'
    case 'custom-avatar': return '自定义头像'
    case 'custom-nickname': return '自定义昵称'
    case 'custom-username': return '自定义用户名'
    case 'custom-bio': return '自定义简介'
    case 'remove-username': return '删除用户名'
    case 'remove-bio': return '删除简介'
    case 'clear-all-profile': return '一键删除资料'
    default: return '个人资料'
  }
}

const LogLines = memo(function LogLines({
  logs,
  lineClassResolver
}: {
  logs: Array<{ id: string; createdAt: string; message: string }>
  lineClassResolver: (log: any) => string
}) {
  return (
    <div className="space-y-2 select-text">
      {logs.map((log) => {
        const lineClass = lineClassResolver(log)
        return (
          <div key={log.id} className={`cursor-text select-text text-sm leading-7 ${lineClass}`}>
            <span className={lineClass}>{formatLogTimestamp(log.createdAt)}</span>
            <span className={`mx-2 ${lineClass}`}>-</span>
            <span className="select-text">{log.message}</span>
          </div>
        )
      })}
    </div>
  )
})

const LOG_RENDER_CHUNK = 200
const LOG_INITIAL_RENDER_COUNT = 300

const IncrementalLogLines = memo(function IncrementalLogLines({
  logs,
  lineClassResolver
}: {
  logs: Array<{ id: string; createdAt: string; message: string }>
  lineClassResolver: (log: any) => string
}) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(logs.length, LOG_INITIAL_RENDER_COUNT))

  useEffect(() => {
    setVisibleCount((current) => {
      if (logs.length === 0) return 0
      if (logs.length <= LOG_INITIAL_RENDER_COUNT) return logs.length
      if (current === 0) return Math.min(logs.length, LOG_INITIAL_RENDER_COUNT)
      if (current >= logs.length) return logs.length
      return Math.max(current, Math.min(logs.length, LOG_INITIAL_RENDER_COUNT))
    })
  }, [logs.length])

  const hiddenCount = Math.max(logs.length - visibleCount, 0)
  const displayedLogs = hiddenCount > 0 ? logs.slice(-visibleCount) : logs

  return (
    <div className="space-y-3 select-text">
      {hiddenCount > 0 ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(logs.length, current + LOG_RENDER_CHUNK))}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-textMuted transition hover:bg-white/[0.07] hover:text-white"
          >
            加载更早日志（还有 {hiddenCount} 条）
          </button>
        </div>
      ) : null}

      <LogLines logs={displayedLogs} lineClassResolver={lineClassResolver} />
    </div>
  )
})

const ProxySummary = memo(function ProxySummary() {
  const proxyState = useProxyPoolStore((state) => state.state)
  const logsContext = useUIStore((state) => state.logsContext)
  const running = proxyState.checkState.running

  if (logsContext !== 'proxy-pool') {
    return null
  }

  if (!running && proxyState.checkState.logs.length === 0) {
    return null
  }

  return (
    <GlassPanel className="bg-card p-0">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">代理检查日志</div>
            <div className="mt-1 text-xs text-textMuted">检查完成后会显示可用数量、不可用数量，并自动删除不可用代理。</div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ${running ? 'bg-sky-400/10 text-sky-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
            {running ? '检查中' : '已完成'}
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-white/5 px-5 py-4 md:grid-cols-4">
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-textMuted">总数量</div>
          <div className="mt-2 text-2xl font-semibold text-white">{proxyState.checkState.totalCount}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="flex items-center gap-2 text-xs tracking-[0.16em] text-emerald-300"><ShieldCheck size={14} /> 可用数量</div>
          <div className="mt-2 text-2xl font-semibold text-white">{proxyState.checkState.aliveCount}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="flex items-center gap-2 text-xs tracking-[0.16em] text-rose-300"><ShieldX size={14} /> 不可用数量</div>
          <div className="mt-2 text-2xl font-semibold text-white">{proxyState.checkState.deadCount}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-violet-300">自动删除</div>
          <div className="mt-2 text-2xl font-semibold text-white">{proxyState.checkState.removedCount}</div>
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto px-5 py-4 select-text">
        {proxyState.checkState.logs.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-sm text-textMuted">暂无代理日志</div>
        ) : (
          <IncrementalLogLines logs={proxyState.checkState.logs} lineClassResolver={getProxyLogLineClass} />
        )}
      </div>
    </GlassPanel>
  )
})

const AccountOperationSummary = memo(function AccountOperationSummary({
  title,
  subtitle,
  icon,
  running,
  stopRequested,
  currentPhone,
  total,
  completed,
  successCount,
  failedCount,
  concurrency,
  logs,
  onStop,
  onClear,
  lineClassResolver,
  scrollContainerRef,
  onScroll
}: {
  title: string
  subtitle: string
  icon: ReactNode
  running: boolean
  stopRequested: boolean
  currentPhone: string | null
  total: number
  completed: number
  successCount: number
  failedCount: number
  concurrency: number
  logs: Array<{ id: string; createdAt: string; message: string; level: CheckLogLevel; accountId?: number | null }>
  onStop: () => void
  onClear: () => void
  lineClassResolver: (log: any) => string
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  onScroll?: () => void
}) {
  const [failedOnly, setFailedOnly] = useState(false)
  const failedAccountIds = useMemo(() => new Set(logs.filter((log) => log.level === 'error' && typeof log.accountId === 'number').map((log) => log.accountId as number)), [logs])
  const displayedLogs = useMemo(() => {
    if (!failedOnly) return logs
    return logs.filter((log) => log.level === 'error' || (typeof log.accountId === 'number' && failedAccountIds.has(log.accountId)))
  }, [failedAccountIds, failedOnly, logs])

  return (
    <GlassPanel className="min-h-[520px] bg-card p-0">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white">{icon}<span>{title}</span></div>
            <div className="mt-1 text-xs text-textMuted">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!running || stopRequested}
              onClick={onStop}
              className="rounded-[12px] bg-rose-400/12 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopRequested ? '停止中' : '停止任务'}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
            >
              清空日志
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-white/5 px-5 py-4 md:grid-cols-4">
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-textMuted">当前进度</div>
          <div className="mt-2 text-2xl font-semibold text-white">{completed} / {total}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-emerald-300">成功</div>
          <div className="mt-2 text-2xl font-semibold text-white">{successCount}</div>
        </div>
        <button
          type="button"
          onClick={() => setFailedOnly((value) => !value)}
          className={`rounded-[14px] px-4 py-4 text-left transition ${failedOnly ? 'border border-rose-400/30 bg-rose-400/12' : 'bg-panel hover:bg-rose-400/8'}`}
        >
          <div className="text-xs tracking-[0.16em] text-rose-300">失败</div>
          <div className="mt-2 text-2xl font-semibold text-white">{failedCount}</div>
          <div className="mt-2 text-xs text-textMuted">{failedOnly ? '当前只看失败账号日志，点一下恢复全部' : '点这里只看失败账号日志'}</div>
        </button>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-violet-300">并发线程</div>
          <div className="mt-2 text-2xl font-semibold text-white">{concurrency}</div>
        </div>
      </div>

      <div className="border-b border-white/5 px-5 py-4">
        <div className="rounded-[14px] bg-panel px-4 py-4 text-sm text-textMuted">
          <div className="flex flex-wrap items-center gap-3">
            <span>状态：<span className={running ? 'text-sky-300' : 'text-emerald-300'}>{running ? (stopRequested ? '停止中' : '执行中') : '已结束'}</span></span>
            <span>当前账号：<span className="text-white">{currentPhone || '等待中'}</span></span>
          </div>
          <div className={`mt-3 rounded-[12px] px-3 py-3 ${stopRequested ? 'border border-amber-400/15 bg-amber-400/10 text-amber-100' : 'bg-white/[0.03]'}`}>
            {stopRequested
              ? '已收到停止指令：不会再领取新账号，并会立即终止当前仍在执行的账号。'
              : '执行过程中会统一把进度写进日志中心，任务结束后再同步最新资料到账号列表。'}
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef as RefObject<HTMLDivElement> | undefined} onScroll={onScroll} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
        {displayedLogs.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
            <FileClock size={24} className="text-neonSoft" />
            <div className="text-base font-medium text-white">{failedOnly ? '当前没有失败账号日志' : '暂无运行日志'}</div>
          </div>
        ) : (
          <IncrementalLogLines logs={displayedLogs} lineClassResolver={lineClassResolver} />
        )}
      </div>
    </GlassPanel>
  )
})

function TwoFactorSummary({ state, logs, scrollContainerRef, onScroll }: { state: TwoFactorProgressOverview; logs: TwoFactorLogEntry[]; scrollContainerRef: RefObject<HTMLDivElement | null>; onScroll?: () => void }) {
  const stopTwoFactorTask = useAccountStore((store) => store.stopTwoFactorTask)
  const clearTwoFactorLogs = useAccountStore((store) => store.clearTwoFactorLogs)

  return (
    <AccountOperationSummary
      title="2FA 管理日志"
      subtitle={`${readTwoFactorActionLabel(state.action)} 的执行过程和结果都会统一显示在这里。`}
      icon={<KeyRound size={16} className="text-violet-300" />}
      running={state.running}
      stopRequested={state.stopRequested}
      currentPhone={state.currentPhone}
      total={state.total}
      completed={state.completed}
      successCount={state.successCount}
      failedCount={state.failedCount}
      concurrency={state.concurrency}
      logs={logs}
      onStop={() => void stopTwoFactorTask()}
      onClear={() => void clearTwoFactorLogs()}
      lineClassResolver={getTwoFactorLineClass}
      scrollContainerRef={scrollContainerRef}
      onScroll={onScroll}
    />
  )
}

function ProfileSummary({ state, logs, scrollContainerRef, onScroll }: { state: ProfileOperationProgressOverview; logs: ProfileOperationLogEntry[]; scrollContainerRef: RefObject<HTMLDivElement | null>; onScroll?: () => void }) {
  const stopProfileOperationTask = useAccountStore((store) => store.stopProfileOperationTask)
  const clearProfileOperationLogs = useAccountStore((store) => store.clearProfileOperationLogs)

  return (
    <AccountOperationSummary
      title="个人资料日志"
      subtitle={`${readProfileActionLabel(state.action)} 的执行过程和结果都会统一显示在这里。`}
      icon={<UserRoundPen size={16} className="text-sky-300" />}
      running={state.running}
      stopRequested={state.stopRequested}
      currentPhone={state.currentPhone}
      total={state.total}
      completed={state.completed}
      successCount={state.successCount}
      failedCount={state.failedCount}
      concurrency={state.concurrency}
      logs={logs}
      onStop={() => void stopProfileOperationTask()}
      onClear={() => void clearProfileOperationLogs()}
      lineClassResolver={getProfileLineClass}
      scrollContainerRef={scrollContainerRef}
      onScroll={onScroll}
    />
  )
}

function CleanupSummary({ scrollContainerRef, onScroll }: { scrollContainerRef: RefObject<HTMLDivElement | null>; onScroll?: () => void }) {
  const [state, setState] = useState<SessionManagerProgressState>({
    running: false,
    action: null,
    total: 0,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    currentAccountId: null,
    currentPhone: null,
    logs: [],
    lastUpdatedAt: null
  })

  useEffect(() => {
    if (!window.desktopSessionManager?.getState || !window.desktopSessionManager?.onProgress) return

    void window.desktopSessionManager.getState().then(setState).catch(() => undefined)
    return window.desktopSessionManager.onProgress((nextState) => {
      setState(nextState)
    })
  }, [])

  return (
    <GlassPanel className="min-h-[520px] bg-card p-0">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white"><Trash2 size={16} className="text-violet-300" /><span>账号清理日志</span></div>
            <div className="mt-1 text-xs text-textMuted">从账号管理操作菜单启动后，会自动跳到这里显示删除过程。</div>
          </div>
          <button
            type="button"
            onClick={() => void window.desktopSessionManager?.clearLogs?.().then(setState).catch(() => undefined)}
            className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
          >
            清空日志
          </button>
        </div>
      </div>

      <div className="grid gap-4 border-b border-white/5 px-5 py-4 md:grid-cols-4">
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-textMuted">当前进度</div>
          <div className="mt-2 text-2xl font-semibold text-white">{state.completed} / {state.total}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-emerald-300">成功</div>
          <div className="mt-2 text-2xl font-semibold text-white">{state.successCount}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-rose-300">失败</div>
          <div className="mt-2 text-2xl font-semibold text-white">{state.failedCount}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-violet-300">状态</div>
          <div className="mt-2 text-2xl font-semibold text-white">{state.running ? '执行中' : '已结束'}</div>
        </div>
      </div>

      <div className="border-b border-white/5 px-5 py-4">
        <div className="rounded-[14px] bg-panel px-4 py-4 text-sm text-textMuted">
          <div className="flex flex-wrap items-center gap-3">
            <span>当前账号：<span className="text-white">{state.currentPhone || '等待中'}</span></span>
          </div>
          <div className="mt-3 rounded-[12px] bg-white/[0.03] px-3 py-3">
            清理过程会按账号逐个记录，聊天、群组频道、联系人分开统计。
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef as RefObject<HTMLDivElement>} onScroll={onScroll} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
        {state.logs.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
            <Trash2 size={24} className="text-violet-300" />
            <div className="text-base font-medium text-white">暂无账号清理日志</div>
          </div>
        ) : (
          <IncrementalLogLines logs={state.logs} lineClassResolver={getSessionCleanupLineClass} />
        )}
      </div>
    </GlassPanel>
  )
}

function BatchCreateSummary({ scrollContainerRef, onScroll }: { scrollContainerRef: RefObject<HTMLDivElement | null>; onScroll?: () => void }) {
  const running = useBatchCreateStore((state) => state.running)
  const stopping = useBatchCreateStore((state) => state.stopping)
  const logs = useBatchCreateStore((state) => state.logs)
  const tasks = useBatchCreateStore((state) => state.tasks)
  const taskSnapshots = useBatchCreateStore((state) => state.taskSnapshots)
  const clearLogs = useBatchCreateStore((state) => state.clearLogs)
  const stopTask = useBatchCreateStore((state) => state.stopTask)
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  const latestTask = tasks[0] ?? null
  const latestSnapshot = taskSnapshots[0] ?? null
  const allLogText = useMemo(() => logs
    .slice()
    .reverse()
    .map((log) => `${formatLogTimestamp(log.createdAt)} ${log.message}`)
    .join('\n'), [logs])
  const linkLines = useMemo(() => (latestSnapshot?.items ?? [])
    .filter((item) => item.status === 'success' && item.publicLink)
    .map((item) => `${item.publicLink} | ${item.title || '未命名目标'} | ${item.entityType === 'group' ? '公开群组' : '公开频道'}`), [latestSnapshot])
  const allLinkText = linkLines.join('\n')

  return (
    <GlassPanel className="min-h-[520px] bg-card p-0">
      <div className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white"><SquareTerminal size={16} className="text-violet-300" /><span>批量创建日志</span></div>
            <div className="mt-1 text-xs text-textMuted">开始任务后会自动跳到这里，逐条显示创建、等待、重试、成功和失败。</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('batch-create')}
              className="rounded-[12px] bg-violet-400/12 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-400/18"
            >
              回到批量创建
            </button>
            <button
              type="button"
              disabled={!running || stopping}
              onClick={() => void stopTask()}
              className="rounded-[12px] bg-rose-400/12 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? '停止中' : '停止任务'}
            </button>
            <button
              type="button"
              onClick={() => void clearLogs()}
              className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
            >
              清空日志
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-white/5 px-5 py-4 md:grid-cols-4">
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-textMuted">当前进度</div>
          <div className="mt-2 text-2xl font-semibold text-white">{latestTask ? `${latestTask.completed} / ${latestTask.total}` : '0 / 0'}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-emerald-300">成功</div>
          <div className="mt-2 text-2xl font-semibold text-white">{latestTask?.successCount ?? 0}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-rose-300">失败</div>
          <div className="mt-2 text-2xl font-semibold text-white">{latestTask?.failedCount ?? 0}</div>
        </div>
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-violet-300">状态</div>
          <div className="mt-2 text-2xl font-semibold text-white">{running ? (stopping ? '停止中' : '执行中') : '已结束'}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-4">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(allLogText || '暂无日志')}
          className="rounded-[12px] bg-violet-400/12 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-400/18"
        >
          复制全部日志
        </button>
        <button
          type="button"
          disabled={!allLinkText}
          onClick={() => void navigator.clipboard.writeText(allLinkText)}
          className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          一键复制全部链接
        </button>
      </div>

      <div ref={scrollContainerRef as RefObject<HTMLDivElement>} onScroll={onScroll} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
        {logs.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
            <SquareTerminal size={24} className="text-violet-300" />
            <div className="text-base font-medium text-white">暂无批量创建日志</div>
          </div>
        ) : (
          <IncrementalLogLines logs={logs.slice().reverse()} lineClassResolver={(log) => getLevelClass(log.level)} />
        )}

        <div className="mt-5 border-t border-white/5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">本轮结果</div>
            <div className="text-xs text-textMuted">这里保留和批量创建页一致的结果视角，避免你找不到。</div>
          </div>

          {allLinkText ? (
            <div className="mt-4 rounded-[14px] bg-panel/70 px-4 py-4 text-sm">
              <div className="mb-2 text-xs tracking-[0.16em] text-textMuted">链接清单</div>
              <div className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all text-slate-200">{allLinkText}</div>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {!latestSnapshot || latestSnapshot.items.length === 0 ? (
              <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">完成后这里会显示创建结果。</div>
            ) : latestSnapshot.items.map((item) => (
              <div key={item.id} className="rounded-[14px] bg-panel/70 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-white">{item.title || '未命名目标'} <span className="ml-2 text-xs text-textMuted">{item.entityType === 'group' ? '公开群组' : '公开频道'}</span></div>
                    <div className="mt-1 text-xs text-textMuted">{item.accountLabel}</div>
                  </div>
                  <div className={item.status === 'success' ? 'text-emerald-300' : 'text-rose-300'}>{item.status === 'success' ? '成功' : '失败'}</div>
                </div>
                <div className="mt-2 text-xs text-textMuted">{item.message}</div>
                {item.publicLink ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="rounded-[10px] bg-black/10 px-3 py-2 text-xs text-slate-200">{item.publicLink}</div>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(item.publicLink)}
                      className="inline-flex items-center gap-1 rounded-[10px] bg-white/[0.05] px-3 py-2 text-xs text-white transition hover:bg-white/[0.08]"
                    >
                      复制
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

const OtherToolsSniperSummary = memo(function OtherToolsSniperSummary() {
  const initOtherTools = useOtherToolsStore((state) => state.init)
  const listenerState = useOtherToolsStore((state) => state.listenerState)
  const setActiveModule = useUIStore((state) => state.setActiveModule)

  useEffect(() => {
    initOtherTools()
  }, [initOtherTools])

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">抢注监听日志中心</div>
              <div className="mt-1 text-xs text-textMuted">点“开始监听”后会自动跳来这里。这里主要看监听状态、命中结果和抢注日志。</div>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('other-tools')}
              className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
            >
              返回抢注页
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-b border-white/5 px-5 py-4 md:grid-cols-4">
          <div className="rounded-[14px] bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.16em] text-textMuted">监听状态</div>
            <div className="mt-2 text-2xl font-semibold text-white">{listenerState?.running ? '运行中' : '未运行'}</div>
            <div className="mt-2 text-xs text-textMuted">{listenerState?.message || '点“开始监听”后，这里会持续刷新。'}</div>
          </div>
          <div className="rounded-[14px] bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.16em] text-textMuted">已检查消息</div>
            <div className="mt-2 text-2xl font-semibold text-white">{listenerState?.checkedMessageCount ?? 0}</div>
            <div className="mt-2 text-xs text-textMuted">发现候选 {listenerState?.candidateCount ?? 0}</div>
          </div>
          <div className="rounded-[14px] bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.16em] text-textMuted">已抢到</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">{listenerState?.claimedCount ?? 0}</div>
            <div className="mt-2 text-xs text-textMuted">已盯来源 {listenerState?.expandedSourceCount ?? 0}</div>
          </div>
          <div className="rounded-[14px] bg-panel px-4 py-4">
            <div className="text-xs tracking-[0.16em] text-textMuted">自动建频道</div>
            <div className="mt-2 text-2xl font-semibold text-violet-300">{listenerState?.createdCarrierCount ?? 0}</div>
            <div className="mt-2 text-xs text-textMuted">本页主要看监听日志</div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">监听日志</div>
              <div className="mt-1 text-xs text-textMuted">最近 {listenerState?.logs.length ?? 0} 条</div>
            </div>
            <div className="text-xs text-textMuted">{listenerState?.running ? '监听中' : '等待开始'}</div>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto px-5 py-4 select-text">
          {!listenerState || listenerState.logs.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center text-sm text-textMuted">开始监听后，这里会持续追加命中、抢注、发帖结果。</div>
          ) : (
            <IncrementalLogLines logs={listenerState.logs} lineClassResolver={getSniperLogLineClass} />
          )}
        </div>
      </GlassPanel>
    </div>
  )
})

export default memo(function LogsView() {
  const initAccounts = useAccountStore((state) => state.init)
  const stopCheck = useAccountStore((state) => state.stopCheck)
  const clearCheckLogs = useAccountStore((state) => state.clearCheckLogs)
  const initProxyPool = useProxyPoolStore((state) => state.init)
  const checkRunning = useAccountStore((state) => state.checkState.running)
  const checkLogs = useAccountStore((state) => state.checkLogs)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const twoFactorLogs = useAccountStore((state) => state.twoFactorLogs)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const profileOperationLogs = useAccountStore((state) => state.profileOperationLogs)
  const batchCreateLogs = useBatchCreateStore((state) => state.logs)
  const logsContext = useUIStore((state) => state.logsContext)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  useEffect(() => {
    void initAccounts()
    void initProxyPool()
  }, [initAccounts, initProxyPool])

  const otherToolsSummaryLogs = useOtherToolsStore((state) => state.sniperSummary?.logs.length ?? 0)
  const otherToolsListenerLogs = useOtherToolsStore((state) => state.listenerState?.logs.length ?? 0)
  const [cleanupLogCount, setCleanupLogCount] = useState(0)

  useEffect(() => {
    if (logsContext !== 'accounts-cleanup' || !window.desktopSessionManager?.getState || !window.desktopSessionManager?.onProgress) return

    void window.desktopSessionManager.getState().then((state) => setCleanupLogCount(state.logs.length)).catch(() => undefined)
    return window.desktopSessionManager.onProgress((state) => {
      setCleanupLogCount(state.logs.length)
    })
  }, [logsContext])

  const activeLogCount = useMemo(() => {
    if (logsContext === 'accounts') return checkLogs.length
    if (logsContext === 'accounts-two-factor') return twoFactorLogs.length
    if (logsContext === 'accounts-profile') return profileOperationLogs.length
    if (logsContext === 'accounts-cleanup') return cleanupLogCount
    if (logsContext === 'batch-create') return batchCreateLogs.length
    if (logsContext === 'other-tools-sniper') return otherToolsSummaryLogs + otherToolsListenerLogs
    return 0
  }, [batchCreateLogs.length, checkLogs.length, cleanupLogCount, logsContext, otherToolsListenerLogs, otherToolsSummaryLogs, profileOperationLogs.length, twoFactorLogs.length])

  useEffect(() => {
    const element = scrollContainerRef.current
    if (!element) return
    if (!shouldStickToBottomRef.current) return
    element.scrollTop = element.scrollHeight
  }, [activeLogCount])

  const handleScroll = () => {
    const element = scrollContainerRef.current
    if (!element) return
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    shouldStickToBottomRef.current = distanceToBottom <= 40
  }

  if (logsContext === 'proxy-pool') {
    return <ProxySummary />
  }

  if (logsContext === 'accounts-two-factor') {
    return <TwoFactorSummary state={twoFactorState} logs={twoFactorLogs} scrollContainerRef={scrollContainerRef} onScroll={handleScroll} />
  }

  if (logsContext === 'accounts-profile') {
    return <ProfileSummary state={profileOperationState} logs={profileOperationLogs} scrollContainerRef={scrollContainerRef} onScroll={handleScroll} />
  }

  if (logsContext === 'accounts-cleanup') {
    return <CleanupSummary scrollContainerRef={scrollContainerRef} onScroll={handleScroll} />
  }

  if (logsContext === 'batch-create') {
    return <BatchCreateSummary scrollContainerRef={scrollContainerRef} onScroll={handleScroll} />
  }

  if (logsContext === 'other-tools-sniper') {
    return <OtherToolsSniperSummary />
  }

  return (
    <div className="space-y-5 contain-layout">
      <CheckResultDialog />
      <GlassPanel className="min-h-[520px] bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">账号运行日志</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!checkRunning}
                onClick={() => void stopCheck()}
                className="rounded-[12px] bg-rose-400/12 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
              >
                停止任务
              </button>
              <button
                type="button"
                onClick={() => void clearCheckLogs()}
                className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
              >
                清空日志
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} onScroll={handleScroll} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
          {checkLogs.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
              <FileClock size={24} className="text-neonSoft" />
              <div className="text-base font-medium text-white">暂无账号运行日志</div>
            </div>
          ) : (
            <IncrementalLogLines logs={checkLogs} lineClassResolver={getAccountLogLineClass} />
          )}
        </div>
      </GlassPanel>
    </div>
  )
})
