import { memo } from 'react'
import { FileClock } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'

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
              {checkState.logs.map((log) => (
                <div key={log.id} className="text-sm leading-7 text-white">
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  )
})
