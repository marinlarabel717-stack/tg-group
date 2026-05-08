import { memo, useEffect } from 'react'
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
          <div className="text-lg font-semibold text-textMain">本地账号网络</div>
          <div className="text-sm text-textMuted">第一阶段只展示本地管理视角，不接自动化与代理池</div>
        </div>
        <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs tracking-[0.2em] text-cyan-300">阶段一</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-neonSoft"><Activity size={18} /> 数据吞吐</div>
          <div className="mt-4 text-3xl font-semibold text-white">SQLite</div>
          <div className="mt-2 text-sm text-textMuted">Session / JSON / 状态数据统一入库</div>
        </div>
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-emerald-300"><Globe2 size={18} /> 文件扫描</div>
          <div className="mt-4 text-3xl font-semibold text-white">递归</div>
          <div className="mt-2 text-sm text-textMuted">支持拖拽、文件夹扫描、同名 JSON 自动匹配</div>
        </div>
        <div className="rounded-[16px] bg-panel p-6">
          <div className="flex items-center gap-3 text-warning"><ShieldAlert size={18} /> 状态维护</div>
          <div className="mt-4 text-3xl font-semibold text-white">Check Engine</div>
          <div className="mt-2 text-sm text-textMuted">登录检测已接入，但不主动改动已确认界面结构</div>
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
          <div className="text-sm text-textMuted">当前桌面框架预留区</div>
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

  useEffect(() => {
    void init()
  }, [init])

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
