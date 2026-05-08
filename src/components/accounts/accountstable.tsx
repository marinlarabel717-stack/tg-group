import { memo } from 'react'
import { ExternalLink, FolderOpen, Info, Lock } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import type { AccountRecord } from '../../types'
import { formatSessionStatus } from '../../lib/ui-text'

function actionClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

export const AccountsTable = memo(function AccountsTable({ accounts }: { accounts: AccountRecord[] }) {
  return (
    <GlassPanel
      className="bg-card"
      header={
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-textMain">账号矩阵</div>
            <div className="text-sm text-textMuted">面向 Telegram Session 的高密度控制表格</div>
          </div>
          <div className="rounded-full bg-neon/10 px-4 py-2 text-xs font-medium tracking-[0.22em] text-neonSoft">
            实时同步
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-textMuted">
                <th className="rounded-l-[12px] bg-panel px-4 py-4">手机号</th>
                <th className="bg-panel px-4 py-4">国家</th>
                <th className="bg-panel px-4 py-4">状态</th>
                <th className="bg-panel px-4 py-4">用户名</th>
                <th className="rounded-r-[12px] bg-panel px-4 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr
                key={account.id}
                className="group"
              >
                <td className="rounded-l-[12px] bg-panel px-4 py-4 transition group-hover:bg-hover">
                  <div className="font-medium text-textMain">{account.phone}</div>
                  <div className="mt-1 text-xs text-textMuted">{account.id} • {account.lastSeen}</div>
                </td>
                <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                  {account.country}
                </td>
                <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={account.status} />
                    <span className="text-xs text-textMuted">Session {formatSessionStatus(account.session)}</span>
                  </div>
                </td>
                <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                  <div className="font-medium text-textMain">{account.username}</div>
                  <div className="mt-1 text-xs text-textMuted">{account.online ? '当前在线' : '空闲中'}</div>
                </td>
                <td className="rounded-r-[12px] bg-panel px-4 py-4 transition group-hover:bg-hover">
                  <div className="flex items-center justify-end gap-2">
                    <button title="打开目录" className={actionClass()}><FolderOpen size={16} /></button>
                    <button title="锁定账号" className={actionClass()}><Lock size={16} /></button>
                    <button title="查看详情" className={actionClass()}><Info size={16} /></button>
                    <button title="跳转外部" className={actionClass()}><ExternalLink size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  )
})
