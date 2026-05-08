import { memo, useEffect, useMemo } from 'react'
import { Activity, Database, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { formatAccountStatus, formatCheckLogLevel, formatDateTime, formatProfileSource } from '../../lib/ui-text'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const checkState = useAccountStore((state) => state.checkState)

  const summary = useMemo(() => {
    let aliveCount = 0
    let riskCount = 0
    let pendingCount = 0

    for (const item of accounts) {
      if (item.status === 'alive') aliveCount += 1
      if (['banned', 'limited', 'temporary_limited', 'session_expired', 'not_logged_in', 'multi_ip', 'timeout'].includes(item.status)) {
        riskCount += 1
      }
      if (['checking', 'unknown'].includes(item.status)) {
        pendingCount += 1
      }
    }

    return {
      totalCount: accounts.length,
      aliveCount,
      riskCount,
      pendingCount,
      queueActive: checkState.activeCount
    }
  }, [accounts, checkState.activeCount])

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[0.24em] text-neonSoft">
            <Sparkles size={14} /> Check Engine · 账号登录检查系统
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">账号检查引擎</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
            当前阶段只做 Session 登录检测、SpamBot 状态检测、状态自动判定、SQLite 回写与资料更新；保持现有界面结构，只补齐中文联动与检查链路。
          </p>
        </div>

        <div className="grid min-w-[420px] grid-cols-4 gap-3">
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Database size={14} /> 总账号</div>
            <div className="mt-3 text-3xl font-semibold text-white">{summary.totalCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><ShieldCheck size={14} /> 存活</div>
            <div className="mt-3 text-3xl font-semibold text-white">{summary.aliveCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Activity size={14} /> 风险/异常</div>
            <div className="mt-3 text-3xl font-semibold text-white">{summary.riskCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><FileText size={14} /> 待处理</div>
            <div className="mt-3 text-3xl font-semibold text-white">{summary.pendingCount + summary.queueActive}</div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
})

const DropImportPanel = memo(function DropImportPanel() {
  const busy = useAccountStore((state) => state.busy)
  const importDroppedPaths = useAccountStore((state) => state.importDroppedPaths)

  return (
    <GlassPanel>
      <div
        onDragEnter={(event) => event.preventDefault()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const droppedPaths = Array.from(event.dataTransfer.files)
            .map((file) => (file as File & { path?: string }).path)
            .filter((item): item is string => Boolean(item))
          void importDroppedPaths(droppedPaths)
        }}
        className="rounded-[14px] border border-dashed border-white/10 bg-panel/60 px-6 py-8 text-center transition hover:border-cyan-300/30"
      >
        <div className="text-lg font-semibold text-white">拖拽导入 Session / JSON / 文件夹</div>
        <div className="mt-2 text-sm text-textMuted">
          支持 Telethon SQLite Session、同名 JSON 自动匹配与缺失 JSON 自动生成，占位资料会在登录检查后自动覆盖更新。
        </div>
        <div className="mt-4 text-xs tracking-[0.2em] text-textMuted">
          {busy ? '处理中…' : '可直接拖入 .session / .json / 文件夹'}
        </div>
      </div>
    </GlassPanel>
  )
})

const CheckPanels = memo(function CheckPanels() {
  const accounts = useAccountStore((state) => state.accounts)
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const selectedProfileAccountId = useAccountStore((state) => state.selectedProfileAccountId)
  const setSelectedProfileAccountId = useAccountStore((state) => state.setSelectedProfileAccountId)
  const checkState = useAccountStore((state) => state.checkState)
  const clearCheckLogs = useAccountStore((state) => state.clearCheckLogs)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)

  const profileAccount = useMemo(() => {
    return accounts.find((item) => item.id === selectedProfileAccountId) ?? accounts[0] ?? null
  }, [accounts, selectedProfileAccountId])

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
      <GlassPanel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">检查队列</div>
            <div className="mt-2 text-sm text-textMuted">
              支持批量检测、并发控制、超时控制、重试机制与中文检测日志。当前已选 {selectedIds.length} 个账号。
            </div>
          </div>
          <button
            onClick={() => void clearCheckLogs()}
            className="rounded-[12px] bg-panel px-4 py-2 text-sm text-textMain transition hover:bg-hover"
          >
            清空日志
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          <div className="rounded-[12px] bg-panel p-4">
            <div className="text-[11px] tracking-[0.2em] text-textMuted">总任务</div>
            <div className="mt-2 text-2xl font-semibold text-white">{checkState.totalCount}</div>
          </div>
          <div className="rounded-[12px] bg-panel p-4">
            <div className="text-[11px] tracking-[0.2em] text-textMuted">执行中</div>
            <div className="mt-2 text-2xl font-semibold text-white">{checkState.activeCount}</div>
          </div>
          <div className="rounded-[12px] bg-panel p-4">
            <div className="text-[11px] tracking-[0.2em] text-textMuted">排队中</div>
            <div className="mt-2 text-2xl font-semibold text-white">{checkState.pendingCount}</div>
          </div>
          <div className="rounded-[12px] bg-panel p-4">
            <div className="text-[11px] tracking-[0.2em] text-textMuted">失败数</div>
            <div className="mt-2 text-2xl font-semibold text-white">{checkState.failedCount}</div>
          </div>
        </div>

        <div className="mt-5 rounded-[14px] bg-panel p-4">
          <div className="mb-3 text-sm font-medium text-white">检测日志</div>
          <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
            {checkState.logs.length === 0 ? (
              <div className="rounded-[12px] bg-card px-4 py-6 text-sm text-textMuted">暂时还没有检测日志。</div>
            ) : (
              checkState.logs.map((log) => (
                <div key={log.id} className="rounded-[12px] bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-white">
                      [{formatCheckLogLevel(log.level)}]
                      {log.accountId ? ` #${log.accountId}` : ' 系统'}
                      {log.attempt ? ` · 第 ${log.attempt} 次` : ''}
                    </div>
                    <div className="text-xs text-textMuted">{formatDateTime(log.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-sm text-textMuted">{log.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-[12px] bg-panel px-4 py-4 text-sm text-white">最近操作：{lastActionMessage || '暂无'}</div>
          <div className="rounded-[12px] bg-panel px-4 py-4 text-sm text-amber-200">异常提示：{errorMessage || '当前没有错误。'}</div>
        </div>
      </GlassPanel>

      <GlassPanel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">账号资料回写预览</div>
            <div className="mt-2 text-sm text-textMuted">
              未检查前读取导入 JSON；登录检查成功后自动回写 profile_json / profile_source / status / 时间字段。
            </div>
          </div>
          <select
            value={profileAccount?.id ?? ''}
            onChange={(event) => setSelectedProfileAccountId(event.target.value ? Number(event.target.value) : null)}
            className="h-11 min-w-[220px] rounded-[12px] bg-panel px-4 text-sm text-textMain outline-none"
          >
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>{item.phone || item.username || `账号 ${item.id}`}</option>
            ))}
          </select>
        </div>

        {profileAccount ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[12px] bg-panel p-4">
                <div className="text-[11px] tracking-[0.2em] text-textMuted">当前状态</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatAccountStatus(profileAccount.status)}</div>
              </div>
              <div className="rounded-[12px] bg-panel p-4">
                <div className="text-[11px] tracking-[0.2em] text-textMuted">资料来源</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatProfileSource(profileAccount.profileSource)}</div>
              </div>
              <div className="rounded-[12px] bg-panel p-4">
                <div className="text-[11px] tracking-[0.2em] text-textMuted">最后检测</div>
                <div className="mt-2 text-sm font-medium text-white">{formatDateTime(profileAccount.lastCheckTime)}</div>
              </div>
              <div className="rounded-[12px] bg-panel p-4">
                <div className="text-[11px] tracking-[0.2em] text-textMuted">最近在线</div>
                <div className="mt-2 text-sm font-medium text-white">{formatDateTime(profileAccount.lastOnlineTime)}</div>
              </div>
            </div>

            <div className="rounded-[14px] bg-panel p-4">
              <div className="mb-3 text-sm font-medium text-white">profile_json</div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-[12px] bg-card p-4 text-xs leading-6 text-textMuted">
                {JSON.stringify(profileAccount.profile ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[12px] bg-panel px-4 py-10 text-center text-sm text-textMuted">暂无账号数据可预览。</div>
        )}
      </GlassPanel>
    </div>
  )
})

export function AccountsView() {
  const init = useAccountStore((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="space-y-5 contain-layout">
      <AccountsSummary />
      <DropImportPanel />
      <CheckPanels />
      <AccountTable />
    </div>
  )
}

export default memo(AccountsView)
