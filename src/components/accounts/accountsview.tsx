import { memo, useMemo } from 'react'
import { MonitorCog, ShieldCheck, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const { onlineCount, frozenCount, healthyCount } = useMemo(() => {
    let online = 0
    let frozen = 0
    let healthy = 0

    for (const item of accounts) {
      if (item.status === 'Online') online += 1
      if (item.status === 'Frozen') frozen += 1
      if (item.session === 'Healthy') healthy += 1
    }

    return {
      onlineCount: online,
      frozenCount: frozen,
      healthyCount: healthy
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
            基于 TanStack Table 与虚拟滚动构建，适合高密度 Telegram 账号管理场景，支持吸顶表头、多选、筛选、分页与客户端级交互反馈。
          </p>
        </div>

        <div className="grid min-w-[360px] grid-cols-3 gap-3">
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><MonitorCog size={14} /> 存活</div>
            <div className="mt-3 text-3xl font-semibold text-white">{onlineCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><ShieldCheck size={14} /> 冻结</div>
            <div className="mt-3 text-3xl font-semibold text-white">{frozenCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Sparkles size={14} /> 正常</div>
            <div className="mt-3 text-3xl font-semibold text-white">{healthyCount}</div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
})

export function AccountsView() {
  return (
    <div className="space-y-5 contain-layout">
      <AccountsSummary />
      <AccountTable />
    </div>
  )
}

export default memo(AccountsView)
