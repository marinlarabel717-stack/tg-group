import { memo } from 'react'
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
          <div className="text-lg font-semibold text-textMain">实时网络网格</div>
          <div className="text-sm text-textMuted">桌面级遥测总览与玻璃态运行视图</div>
        </div>
        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs tracking-[0.2em] text-cyan-300">
          实时
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[16px] border border-white/8 bg-[#0d1522] p-5">
          <div className="flex items-center gap-3 text-neonSoft"><Activity size={18} /> 信号速率</div>
          <div className="mt-4 text-3xl font-semibold text-white">3.84k/s</div>
          <div className="mt-3 h-2 rounded-full bg-white/5">
            <div className="h-2 w-3/4 rounded-full bg-neon/70" />
          </div>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-[#0d1522] p-5">
          <div className="flex items-center gap-3 text-emerald-300"><Globe2 size={18} /> Proxy 覆盖</div>
          <div className="mt-4 text-3xl font-semibold text-white">42 节点</div>
          <div className="mt-2 text-sm text-textMuted">11 个区域已同步</div>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-[#0d1522] p-5">
          <div className="flex items-center gap-3 text-warning"><ShieldAlert size={18} /> 安全脉冲</div>
          <div className="mt-4 text-3xl font-semibold text-white">低风险</div>
          <div className="mt-2 text-sm text-textMuted">威胁情报已自动校准</div>
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
          <div className="text-sm text-textMuted">Telegram 风格的企业运行面板</div>
        </div>
        <RadioTower className="text-neonSoft" size={18} />
      </div>

      <div className="mt-6 space-y-4">
        {stream.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-[14px] border border-white/8 bg-[#0d1522] px-4 py-4">
            <div>
              <div className="font-medium text-white">{item.title}</div>
              <div className="text-xs text-textMuted">{item.meta}</div>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">
              {item.status}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

const DashboardPreviewTable = memo(function DashboardPreviewTable() {
  const accounts = useAccountStore((state) => state.accounts)
  return <AccountsTable accounts={accounts.slice(0, 8)} />
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
