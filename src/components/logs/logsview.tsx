import { memo } from 'react'
import { FileClock } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import type { CheckLogEntry } from '../../types'

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

function getLogLineClass(log: CheckLogEntry) {
  if (log.status === 'alive') return 'text-emerald-300'
  if (log.status === 'limited' || log.status === 'temporary_limited') return 'text-yellow-300'
  if (log.status === 'frozen') return 'text-sky-300'
  if (log.status === 'banned') return 'text-rose-300'
  if (log.status === 'timeout') return 'text-orange-300'

  if (log.message.includes('本次检测已完成')) return 'text-emerald-300'
  if (log.message.startsWith('总数量') || log.message.startsWith('无限制') || log.message.startsWith('双向') || log.message.startsWith('临时双向') || log.message.startsWith('冻结') || log.message.startsWith('封禁') || log.message.startsWith('超时')) {
    return 'text-slate-200'
  }

  return 'text-white'
}

export default memo(function LogsView() {
  const checkState = useAccountStore((state) => state.checkState)

  return (
    <div className="contain-layout">
      <GlassPanel className="min-h-[720px] bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="text-sm font-medium text-white">运行日志</div>
        </div>

        <div className="max-h-[760px] overflow-y-auto px-5 py-4">
          {checkState.logs.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-textMuted">
              <FileClock size={24} className="text-neonSoft" />
              <div className="text-base font-medium text-white">暂无运行日志</div>
            </div>
          ) : (
            <div className="space-y-2">
              {checkState.logs.map((log) => {
                const lineClass = getLogLineClass(log)
                return (
                  <div key={log.id} className={`text-sm leading-7 ${lineClass}`}>
                    <span className={`mr-2 ${lineClass}`}>{formatLogTimestamp(log.createdAt)}</span>
                    <span>{log.message}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  )
})
