import { memo, useEffect, useMemo } from 'react'
import { Activity, Globe2, RadioTower, ShieldAlert } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { KpiCard } from './kpicard'
import { AccountsTable } from '../accounts/accountstable'
import { useDashboardStore } from '../../stores/dashboardstore'
import { useSessionStore } from '../../stores/sessionstore'
import { useAccountStore } from '../../stores/accountstore'

const DashboardNetworkPanel = memo(function DashboardNetworkPanel() {
  return (
    <GlassPanel>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-textMain">检查引擎概览</div>
          <div className="text-sm text-textMuted">当前阶段只接 Session 登录检测、SpamBot 状态检测与数据库回写</div>
        </div>
        <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs tracking-[0.2em] text-cyan-300">Check Engine</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-neonSoft"><Activity size={18} /> 资料回写</div>
          <div className="mt-4 text-3xl font-semibold text-white">SQLite</div>
          <div className="mt-2 text-sm text-textMuted">profile_json / status / 时间字段统一更新</div>
        </div>
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-emerald-300"><Globe2 size={18} /> 登录检测</div>
          <div className="mt-4 text-3xl font-semibold text-white">GramJS</div>
          <div className="mt-2 text-sm text-textMuted">优先加载 Telethon SQLite Session，失败时回退字符串 Session</div>
        </div>
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-warning"><ShieldAlert size={18} /> 状态判定</div>
          <div className="mt-4 text-3xl font-semibold text-white">SpamBot</div>
          <div className="mt-2 text-sm text-textMuted">自动解析限制、封禁、多 IP、超时等结果</div>
        </div>
      </div>
    </GlassPanel>
  )
})

const DashboardSessionPanel = memo(function DashboardSessionPanel() {
  const stream = useSessionStore((state) => state.stream)

  return (
    <GlassPanel>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-textMain">Session 流</div>
          <div className="text-sm text-textMuted">保留现有模块，不扩展自动化和加群能力</div>
        </div>
        <RadioTower className="text-neonSoft" size={18} />
      </div>

      <div className="mt-6 space-y-4">
        {stream.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-4">
            <div>
              <div className="font-medium text-white">{item.title}</div>
              <div className="text-xs text-textMuted">{item.meta}</div>
            </div>
            <div className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">{item.status}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const DashboardPreviewTable = memo(function DashboardPreviewTable() {
  const init = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)

  const preview = useMemo(() => accounts.slice(0, 8), [accounts])

  useEffect(() => {
    void init()
  }, [init])

  return <AccountsTable accounts={preview} />
})

export function DashboardView() {
  const stats = useDashboardStore((state) => state.stats)

  return (
    <div className="space-y-6 contain-layout">
      <div className="grid grid-cols-4 gap-5">
        {stats.map((item) => (
          <KpiCard key={item.id} {...item} />
        ))}
      </div>

      <div className="grid grid-cols-[1.35fr_0.9fr] gap-6">
        <DashboardNetworkPanel />
        <DashboardSessionPanel />
      </div>

      <DashboardPreviewTable />
    </div>
  )
}

export default memo(DashboardView)
