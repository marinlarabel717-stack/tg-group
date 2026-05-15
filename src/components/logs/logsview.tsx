import { memo, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { FileClock, KeyRound, ShieldCheck, ShieldX, UserRoundPen } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { CheckResultDialog } from '../accounts/checkresultdialog'
import { useAccountStore } from '../../stores/accountstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useUIStore } from '../../stores/uistore'
import type { CheckLogEntry, CheckLogLevel, ProfileOperationAction, ProfileOperationLogEntry, ProfileOperationProgressState, ProxyCheckLogEntry, TwoFactorAction, TwoFactorLogEntry, TwoFactorProgressState } from '../../types'
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

function readTwoFactorActionLabel(action: TwoFactorAction | null) {
  if (action === 'change-2fa') return '更改 2FA'
  if (action === 'disable-2fa') return '关闭 2FA'
  if (action === 'reset-2fa') return '重置 2FA'
  return '2FA 管理'
}

function readProfileActionLabel(action: ProfileOperationAction | null) {
  switch (action) {
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
          <LogLines logs={proxyState.checkState.logs} lineClassResolver={getProxyLogLineClass} />
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
  scrollContainerRef
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
  logs: Array<{ id: string; createdAt: string; message: string }>
  onStop: () => void
  onClear: () => void
  lineClassResolver: (log: any) => string
  scrollContainerRef?: RefObject<HTMLDivElement | null>
}) {
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
        <div className="rounded-[14px] bg-panel px-4 py-4">
          <div className="text-xs tracking-[0.16em] text-rose-300">失败</div>
          <div className="mt-2 text-2xl font-semibold text-white">{failedCount}</div>
        </div>
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
              ? '已收到停止指令：不会再领取新账号，正在等待当前已启动的账号先收尾。'
              : '执行过程中会统一把进度写进日志中心，任务结束后再同步最新资料到账号列表。'}
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef as RefObject<HTMLDivElement> | undefined} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
        {logs.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
            <FileClock size={24} className="text-neonSoft" />
            <div className="text-base font-medium text-white">暂无运行日志</div>
          </div>
        ) : (
          <LogLines logs={logs} lineClassResolver={lineClassResolver} />
        )}
      </div>
    </GlassPanel>
  )
})

function TwoFactorSummary({ state, scrollContainerRef }: { state: TwoFactorProgressState; scrollContainerRef: RefObject<HTMLDivElement | null> }) {
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
      logs={state.logs}
      onStop={() => void stopTwoFactorTask()}
      onClear={() => void clearTwoFactorLogs()}
      lineClassResolver={getTwoFactorLineClass}
      scrollContainerRef={scrollContainerRef}
    />
  )
}

function ProfileSummary({ state, scrollContainerRef }: { state: ProfileOperationProgressState; scrollContainerRef: RefObject<HTMLDivElement | null> }) {
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
      logs={state.logs}
      onStop={() => void stopProfileOperationTask()}
      onClear={() => void clearProfileOperationLogs()}
      lineClassResolver={getProfileLineClass}
      scrollContainerRef={scrollContainerRef}
    />
  )
}

export default memo(function LogsView() {
  const initAccounts = useAccountStore((state) => state.init)
  const stopCheck = useAccountStore((state) => state.stopCheck)
  const clearCheckLogs = useAccountStore((state) => state.clearCheckLogs)
  const initProxyPool = useProxyPoolStore((state) => state.init)
  const checkState = useAccountStore((state) => state.checkState)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const logsContext = useUIStore((state) => state.logsContext)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void initAccounts()
    void initProxyPool()
  }, [initAccounts, initProxyPool])

  const activeLogCount = useMemo(() => {
    if (logsContext === 'accounts') return checkState.logs.length
    if (logsContext === 'accounts-two-factor') return twoFactorState.logs.length
    if (logsContext === 'accounts-profile') return profileOperationState.logs.length
    return 0
  }, [checkState.logs.length, logsContext, profileOperationState.logs.length, twoFactorState.logs.length])

  useEffect(() => {
    const element = scrollContainerRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [activeLogCount])

  if (logsContext === 'proxy-pool') {
    return <ProxySummary />
  }

  if (logsContext === 'accounts-two-factor') {
    return <TwoFactorSummary state={twoFactorState} scrollContainerRef={scrollContainerRef} />
  }

  if (logsContext === 'accounts-profile') {
    return <ProfileSummary state={profileOperationState} scrollContainerRef={scrollContainerRef} />
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
                disabled={!checkState.running}
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

        <div ref={scrollContainerRef} className="max-h-[560px] overflow-y-auto px-5 py-4 select-text">
          {checkState.logs.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center text-textMuted">
              <FileClock size={24} className="text-neonSoft" />
              <div className="text-base font-medium text-white">暂无账号运行日志</div>
            </div>
          ) : (
            <LogLines logs={checkState.logs} lineClassResolver={getAccountLogLineClass} />
          )}
        </div>
      </GlassPanel>
    </div>
  )
})
