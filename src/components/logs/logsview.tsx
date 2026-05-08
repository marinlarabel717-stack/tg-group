import { memo, useMemo } from 'react'
import { FileClock, Loader2, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from '../accounts/statusbadge'
import { useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatDateTime, formatCheckLogLevel } from '../../lib/ui-text'

export default memo(function LogsView() {
  const accounts = useAccountStore((state) => state.accounts)
  const checkState = useAccountStore((state) => state.checkState)

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs tracking-[0.24em] text-neonSoft">
              <Sparkles size={14} /> 运行日志
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">检测任务日志中心</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
              实时查看账号检测任务的执行进度、手机号状态分类和异常信息。
            </p>
          </div>

          <div className="grid min-w-[360px] grid-cols-3 gap-3">
            <div className="rounded-[14px] bg-panel p-5">
              <div className="text-xs tracking-[0.2em] text-textMuted">待执行</div>
              <div className="mt-3 text-3xl font-semibold text-white">{checkState.pendingCount}</div>
            </div>
            <div className="rounded-[14px] bg-panel p-5">
              <div className="text-xs tracking-[0.2em] text-textMuted">执行中</div>
              <div className="mt-3 text-3xl font-semibold text-white">{checkState.activeCount}</div>
            </div>
            <div className="rounded-[14px] bg-panel p-5">
              <div className="text-xs tracking-[0.2em] text-textMuted">已完成</div>
              <div className="mt-3 text-3xl font-semibold text-white">{checkState.completedCount}</div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-xs tracking-[0.22em] text-textMuted">日志流</div>
            <div className="mt-1 text-sm text-white">
              {checkState.running ? '检测进行中，结果会持续写入。' : '当前没有正在运行的检测任务。'}
            </div>
          </div>
          {checkState.running ? <Loader2 size={18} className="animate-spin text-neonSoft" /> : <FileClock size={18} className="text-textMuted" />}
        </div>

        <div className="max-h-[680px] overflow-y-auto px-4 py-3">
          {checkState.logs.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-textMuted">
              <FileClock size={24} className="text-neonSoft" />
              <div className="text-base font-medium text-white">暂无运行日志</div>
              <div className="max-w-md text-sm">启动批量检测后，这里会实时显示“手机号 ---- 状态”的执行记录。</div>
            </div>
          ) : (
            <div className="space-y-2">
              {checkState.logs.map((log) => {
                const account = log.accountId ? accountMap.get(log.accountId) : null
                const phone = log.phone || account?.phone || (log.accountId ? `账号#${log.accountId}` : '系统')
                const statusText = log.status ? formatAccountStatus(log.status) : ''
                return (
                  <div key={log.id} className="rounded-[12px] bg-panel px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs tracking-[0.18em] text-textMuted">{formatCheckLogLevel(log.level)}</span>
                          <span className="text-xs text-textMuted">{formatDateTime(log.createdAt)}</span>
                          {typeof log.attempt === 'number' ? <span className="text-xs text-textMuted">第 {log.attempt} 次</span> : null}
                        </div>
                        <div className="mt-2 break-all text-sm text-white">{log.message}</div>
                        <div className="mt-2 text-xs text-textMuted">{phone}{statusText ? ` ---- ${statusText}` : ''}</div>
                      </div>
                      {log.status ? <StatusBadge status={log.status} /> : null}
                    </div>
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
