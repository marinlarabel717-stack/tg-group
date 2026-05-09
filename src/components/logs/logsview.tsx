import { memo, useEffect, useRef } from 'react'
import { FileClock, ShieldCheck, ShieldX } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useUIStore } from '../../stores/uistore'
import type { CheckLogEntry, ProxyCheckLogEntry } from '../../types'
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
  if (log.status === 'limited' || log.status === 'temporary_limited') return 'text-yellow-300'
  if (log.status === 'multi_ip') return 'text-violet-300'
  if (log.status === 'frozen') return 'text-sky-300'
  if (log.status === 'banned') return 'text-rose-300'
  if (log.status === 'timeout') return 'text-slate-300'
  if (log.status === 'unknown' && isGeoRestrictedError(log.message)) return 'text-amber-200'
  if (log.status === 'unknown') return 'text-slate-200'

  if (log.message.includes('本次检测已完成')) return 'text-emerald-300'

  return 'text-white'
}

function getProxyLogLineClass(log: ProxyCheckLogEntry) {
  if (log.level === 'success') return 'text-emerald-300'
  if (log.level === 'error') return 'text-rose-300'
  if (log.level === 'warning') return 'text-amber-200'
  return 'text-white'
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
            <span className={`mx-2 ${lineClass}`}>—</span>
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

export default memo(function LogsView() {
  const initAccounts = useAccountStore((state) => state.init)
  const initProxyPool = useProxyPoolStore((state) => state.init)
  const checkState = useAccountStore((state) => state.checkState)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void initAccounts()
    void initProxyPool()
  }, [initAccounts, initProxyPool])

  useEffect(() => {
    const element = scrollContainerRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [checkState.logs.length])

  return (
    <div className="space-y-5 contain-layout">
      <ProxySummary />

      <GlassPanel className="min-h-[520px] bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="text-sm font-medium text-white">账号运行日志</div>
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
