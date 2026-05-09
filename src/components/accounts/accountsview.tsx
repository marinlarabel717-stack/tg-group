import { memo, useMemo } from 'react'
import { MonitorCog, ShieldCheck, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const { aliveCount, riskCount, checkedCount } = useMemo(() => {
    let alive = 0
    let risk = 0
    let checked = 0

    for (const item of accounts) {
      if (item.status === 'alive') alive += 1
      if (item.profileSource === 'login_check') checked += 1
      if (['banned', 'limited', 'temporary_limited', 'frozen', 'session_expired', 'not_logged_in', 'multi_ip', 'timeout'].includes(item.status)) {
        risk += 1
      }
    }

    return {
      aliveCount: alive,
      riskCount: risk,
      checkedCount: checked
    }
  }, [accounts])

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[0.24em] text-neonSoft">
            <Sparkles size={14} /> 企业数据表格
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">账号管理控制台</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
            基于现有账号管理页面增量接入检查引擎能力，保持 DataGrid 作为主界面，不重做页面、不替换模块结构。
          </p>
        </div>

        <div className="grid min-w-[360px] grid-cols-3 gap-3">
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><MonitorCog size={14} /> 存活</div>
            <div className="mt-3 text-3xl font-semibold text-white">{aliveCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><ShieldCheck size={14} /> 风险</div>
            <div className="mt-3 text-3xl font-semibold text-white">{riskCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Sparkles size={14} /> 已检测</div>
            <div className="mt-3 text-3xl font-semibold text-white">{checkedCount}</div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
})

export function AccountsView() {
  const importProgress = useAccountStore((state) => state.importProgress)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)

  return (
    <div className="space-y-5 contain-layout">
      <AccountsSummary />

      {importProgress ? (
        <GlassPanel className="bg-card py-0">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <div className="font-medium text-white">{importProgress.phase === 'completed' ? '导入完成' : '正在导入账号'}</div>
              <div className="mt-1 text-textMuted">{importProgress.message}</div>
            </div>
            <div className="text-right text-textMuted">
              <div>{importProgress.current} / {importProgress.total}</div>
              <div className="mt-1">已导入 {importProgress.importedCount} 个</div>
            </div>
          </div>
        </GlassPanel>
      ) : null}

      {!importProgress && lastActionMessage ? (
        <GlassPanel className="bg-card py-0">
          <div className="text-sm font-medium text-white">{lastActionMessage}</div>
          {errorMessage ? <div className="mt-1 text-sm text-amber-300">{errorMessage}</div> : null}
        </GlassPanel>
      ) : null}

      <AccountTable />
    </div>
  )
}

export default memo(AccountsView)
