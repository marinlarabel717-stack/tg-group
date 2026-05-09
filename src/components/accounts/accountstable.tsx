import { memo } from 'react'
import { FileJson2, FolderOpen } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { StatusBadge } from './statusbadge'
import type { AccountRecord } from '../../types'
import { formatDateTime, formatRelativePath } from '../../lib/ui-text'

function actionClass() {
  return 'flex h-9 w-9 items-center justify-center rounded-[10px] bg-panel text-slate-300 transition hover:bg-hover hover:text-neonSoft'
}

export const AccountsTable = memo(function AccountsTable({ accounts }: { accounts: AccountRecord[] }) {
  const revealPath = window.desktopAccounts?.revealPath

  return (
    <GlassPanel
      className="bg-card"
      header={
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-textMain">账号预览</div>
            <div className="text-sm text-textMuted">桌面级本地账号库快速视图</div>
          </div>
          <div className="rounded-full bg-neon/10 px-4 py-2 text-xs font-medium tracking-[0.22em] text-neonSoft">
            SQLite 已接通
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-sm text-textMuted">
              <th className="rounded-l-[12px] bg-panel px-4 py-4">手机号</th>
              <th className="bg-panel px-4 py-4">状态</th>
              <th className="bg-panel px-4 py-4">国家</th>
              <th className="bg-panel px-4 py-4">最后检测</th>
              <th className="rounded-r-[12px] bg-panel px-4 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="rounded-[12px] bg-panel px-4 py-10 text-center text-sm text-textMuted">
                  还没有账号数据，先去账号管理页导入 Session。
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="group">
                  <td className="rounded-l-[12px] bg-panel px-4 py-4 transition group-hover:bg-hover">
                    <div className="font-medium text-textMain">{account.phone || '未识别手机号'}</div>
                    <div className="mt-1 text-xs text-textMuted">{formatRelativePath(account.sessionPath)}</div>
                  </td>
                  <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                    <StatusBadge status={account.status} errorMessage={typeof account.profile?.check_error === 'string' ? account.profile.check_error : null} />
                  </td>
                  <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                    {account.country || '未识别'}
                  </td>
                  <td className="bg-panel px-4 py-4 transition group-hover:bg-hover">
                    {formatDateTime(account.lastCheckTime)}
                  </td>
                  <td className="rounded-r-[12px] bg-panel px-4 py-4 transition group-hover:bg-hover">
                    <div className="flex items-center justify-end gap-2">
                      <button title="打开 Session" className={actionClass()} onClick={() => void revealPath?.(account.sessionPath)}>
                        <FolderOpen size={16} />
                      </button>
                      <button title="打开 JSON" className={actionClass()} onClick={() => void revealPath?.(account.jsonPath)}>
                        <FileJson2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  )
})
