import { Activity, Globe2, RadioTower, ShieldAlert } from 'lucide-react'
import { useAppStore } from '../../store/appstore'
import { GlassPanel } from '../common/glasspanel'
import { KpiCard } from './kpicard'
import { AccountsTable } from '../accounts/accountstable'
import { selectFilteredAccounts } from '../../store/appstore'

export function DashboardView() {
  const stats = useAppStore((state) => state.stats)
  const filteredAccounts = useAppStore(selectFilteredAccounts)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-5">
        {stats.map((item) => (
          <KpiCard key={item.id} {...item} />
        ))}
      </div>

      <div className="grid grid-cols-[1.35fr_0.9fr] gap-6">
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
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-neonSoft"><Activity size={18} /> 信号速率</div>
              <div className="mt-4 text-3xl font-semibold text-white">3.84k/s</div>
              <div className="mt-3 h-2 rounded-full bg-white/5">
                <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-neon to-cyan-300" />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-emerald-300"><Globe2 size={18} /> Proxy 覆盖</div>
              <div className="mt-4 text-3xl font-semibold text-white">42 节点</div>
              <div className="mt-2 text-sm text-textMuted">11 个区域已同步</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-warning"><ShieldAlert size={18} /> 安全脉冲</div>
              <div className="mt-4 text-3xl font-semibold text-white">低风险</div>
              <div className="mt-2 text-sm text-textMuted">威胁情报已自动校准</div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-textMain">Session 流</div>
              <div className="text-sm text-textMuted">Telegram 风格的企业运行面板</div>
            </div>
            <RadioTower className="text-neonSoft" size={18} />
          </div>

          <div className="mt-6 space-y-4">
            {[
              ['网关 01', '正常', '98ms'],
              ['Session 核心', '已同步', '11ms'],
              ['Proxy 链路', '稳定', '23 条路由'],
              ['自动化总线', '运行中', '24 个任务']
            ].map(([title, status, meta]) => (
              <div key={title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4">
                <div>
                  <div className="font-medium text-white">{title}</div>
                  <div className="text-xs text-textMuted">{meta}</div>
                </div>
                <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">
                  {status}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <AccountsTable accounts={filteredAccounts} />
    </div>
  )
}
