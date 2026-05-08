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
              <div className="text-lg font-semibold text-textMain">Realtime Network Mesh</div>
              <div className="text-sm text-textMuted">Enterprise telemetry with cyber glass surface</div>
            </div>
            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
              Live
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-neonSoft"><Activity size={18} /> Signal Rate</div>
              <div className="mt-4 text-3xl font-semibold text-white">3.84k/s</div>
              <div className="mt-3 h-2 rounded-full bg-white/5">
                <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-neon to-cyan-300" />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-emerald-300"><Globe2 size={18} /> Proxy Reach</div>
              <div className="mt-4 text-3xl font-semibold text-white">42 nodes</div>
              <div className="mt-2 text-sm text-textMuted">11 regions synchronized</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-center gap-3 text-warning"><ShieldAlert size={18} /> Security Pulse</div>
              <div className="mt-4 text-3xl font-semibold text-white">Low Risk</div>
              <div className="mt-2 text-sm text-textMuted">Threat feed auto-adjusted</div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-textMain">Session Stream</div>
              <div className="text-sm text-textMuted">Telegram styled enterprise operations</div>
            </div>
            <RadioTower className="text-neonSoft" size={18} />
          </div>

          <div className="mt-6 space-y-4">
            {[
              ['Gateway 01', 'Healthy', '98ms'],
              ['Session Core', 'Synced', '11ms'],
              ['Proxy Chain', 'Stable', '23 routes'],
              ['Automation Bus', 'Running', '24 jobs']
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
