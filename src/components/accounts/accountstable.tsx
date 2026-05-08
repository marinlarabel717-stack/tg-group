import { ExternalLink, FolderOpen, Info, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import type { AccountRecord } from '../../types'

function actionClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/35 text-slate-300 transition hover:border-neon/40 hover:bg-neon/10 hover:text-neonSoft hover:shadow-neon'
}

export function AccountsTable({ accounts }: { accounts: AccountRecord[] }) {
  return (
    <GlassPanel
      className="overflow-hidden"
      header={
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-textMain">Accounts Matrix</div>
            <div className="text-sm text-textMuted">High density control table for Telegram sessions</div>
          </div>
          <div className="rounded-full border border-neon/20 bg-neon/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-neonSoft">
            Realtime synced
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3">
          <thead>
            <tr className="text-left text-sm text-textMuted">
              <th className="rounded-l-2xl bg-white/5 px-4 py-4">Phone Number</th>
              <th className="bg-white/5 px-4 py-4">Country</th>
              <th className="bg-white/5 px-4 py-4">Status</th>
              <th className="bg-white/5 px-4 py-4">Username</th>
              <th className="rounded-r-2xl bg-white/5 px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account, index) => (
              <motion.tr
                key={account.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="group"
              >
                <td className="rounded-l-3xl border border-white/10 border-r-0 bg-white/5 px-4 py-4 transition group-hover:border-neon/30 group-hover:bg-white/[0.08]">
                  <div className="font-medium text-textMain">{account.phone}</div>
                  <div className="mt-1 text-xs text-textMuted">{account.id} • {account.lastSeen}</div>
                </td>
                <td className="border border-white/10 border-l-0 border-r-0 bg-white/5 px-4 py-4 transition group-hover:border-neon/30 group-hover:bg-white/[0.08]">
                  {account.country}
                </td>
                <td className="border border-white/10 border-l-0 border-r-0 bg-white/5 px-4 py-4 transition group-hover:border-neon/30 group-hover:bg-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={account.status} />
                    <span className="text-xs text-textMuted">Session {account.session}</span>
                  </div>
                </td>
                <td className="border border-white/10 border-l-0 border-r-0 bg-white/5 px-4 py-4 transition group-hover:border-neon/30 group-hover:bg-white/[0.08]">
                  <div className="font-medium text-textMain">{account.username}</div>
                  <div className="mt-1 text-xs text-textMuted">{account.online ? 'Online now' : 'Idle'}</div>
                </td>
                <td className="rounded-r-3xl border border-white/10 border-l-0 bg-white/5 px-4 py-4 transition group-hover:border-neon/30 group-hover:bg-white/[0.08]">
                  <div className="flex items-center justify-end gap-2">
                    <button className={actionClass()}><FolderOpen size={16} /></button>
                    <button className={actionClass()}><Lock size={16} /></button>
                    <button className={actionClass()}><Info size={16} /></button>
                    <button className={actionClass()}><ExternalLink size={16} /></button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  )
}
