import { MonitorCog, ShieldCheck, Sparkles } from 'lucide-react'
import { useAppStore } from '../../store/appstore'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'

export function AccountsView() {
  const accounts = useAppStore((state) => state.accounts)
  const search = useAppStore((state) => state.search)
  const setSearch = useAppStore((state) => state.setSearch)

  const onlineCount = accounts.filter((item) => item.status === 'Online').length
  const frozenCount = accounts.filter((item) => item.status === 'Frozen').length
  const healthyCount = accounts.filter((item) => item.session === 'Healthy').length

  return (
    <div className="space-y-5">
      <GlassPanel className="overflow-hidden bg-gradient-to-r from-neon/10 via-white/[0.03] to-transparent">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-neonSoft">
              <Sparkles size={14} /> Enterprise DataGrid
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">Accounts Control Surface</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
              Built with TanStack Table + virtualization for desktop-grade Telegram account operations. Sticky headers, multi-select, filters, pagination, neon hover states, and client-like density.
            </p>
          </div>

          <div className="grid min-w-[360px] grid-cols-3 gap-3">
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-textMuted"><MonitorCog size={14} /> Online</div>
              <div className="mt-3 text-3xl font-semibold text-white">{onlineCount}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-textMuted"><ShieldCheck size={14} /> Frozen</div>
              <div className="mt-3 text-3xl font-semibold text-white">{frozenCount}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-textMuted"><Sparkles size={14} /> Healthy</div>
              <div className="mt-3 text-3xl font-semibold text-white">{healthyCount}</div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <AccountTable data={accounts} externalSearch={search} onExternalSearchChange={setSearch} />
    </div>
  )
}
