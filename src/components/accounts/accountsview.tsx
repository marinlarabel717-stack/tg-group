import { memo, useEffect, useMemo, useState } from 'react'
import { Database, FolderArchive, ShieldCheck, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { formatCheckLogLevel, formatDateTime } from '../../lib/ui-text'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const { totalCount, aliveCount, riskCount, pendingCount } = useMemo(() => {
    let alive = 0
    let risk = 0
    let pending = 0

    for (const item of accounts) {
      if (item.status === 'alive') alive += 1
      if (['banned', 'limited', 'temporary_limited', 'session_expired', 'not_logged_in', 'multi_ip', 'timeout'].includes(item.status)) risk += 1
      if (['checking', 'unknown'].includes(item.status)) pending += 1
    }

    return {
      totalCount: accounts.length,
      aliveCount: alive,
      riskCount: risk,
      pendingCount: pending
    }
  }, [accounts])

  return (
    <GlassPanel className="bg-card">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs tracking-[0.24em] text-neonSoft">
            <Sparkles size={14} /> 第一阶段 · 本地账号管理系统
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">账号管理模块</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">
            保持已确认的本地账号管理界面，仅补充检查引擎底层联动：Session 登录检查、状态回写、批量任务与中文日志，不主动重做 UI。
          </p>
        </div>

        <div className="grid min-w-[420px] grid-cols-4 gap-3">
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Database size={14} /> 总账号</div>
            <div className="mt-3 text-3xl font-semibold text-white">{totalCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><ShieldCheck size={14} /> 存活</div>
            <div className="mt-3 text-3xl font-semibold text-white">{aliveCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><FolderArchive size={14} /> 风险</div>
            <div className="mt-3 text-3xl font-semibold text-white">{riskCount}</div>
          </div>
          <div className="rounded-[14px] bg-panel p-5">
            <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-textMuted"><Sparkles size={14} /> 待检测</div>
            <div className="mt-3 text-3xl font-semibold text-white">{pendingCount}</div>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
})

const DropImportPanel = memo(function DropImportPanel() {
  const busy = useAccountStore((state) => state.busy)
  const importDroppedPaths = useAccountStore((state) => state.importDroppedPaths)
  const [dragActive, setDragActive] = useState(false)

  return (
    <GlassPanel className={dragActive ? 'border border-cyan-300/40 bg-cyan-400/5' : ''}>
      <div
        onDragEnter={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (event.currentTarget === event.target) setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          const droppedPaths = Array.from(event.dataTransfer.files)
            .map((file) => (file as File & { path?: string }).path)
            .filter((item): item is string => Boolean(item))

          void importDroppedPaths(droppedPaths)
        }}
        className="rounded-[14px] border border-dashed border-white/10 bg-panel/60 px-6 py-8 text-center transition"
      >
        <div className="text-lg font-semibold text-white">拖拽导入 Session / JSON / 文件夹</div>
        <div className="mt-2 text-sm text-textMuted">
          支持单个导入、批量识别、同目录 JSON 自动匹配；缺失 JSON 会自动生成占位模板。
        </div>
        <div className="mt-4 text-xs tracking-[0.2em] text-textMuted">
          {busy ? '处理中…' : '可直接拖入 .session / .json / 文件夹'}
        </div>
      </div>
    </GlassPanel>
  )
})

const CheckStatusPanel = memo(function CheckStatusPanel() {
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const checkState = useAccountStore((state) => state.checkState)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)
  const clearCheckLogs = useAccountStore((state) => state.clearCheckLogs)

  const latestLogs = checkState.logs.slice(0, 3)

  return (
    <GlassPanel>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="text-lg font-semibold text-white">账号检查状态</div>
          <div className="mt-2 text-sm text-textMuted">
            保持原界面结构不变。现在批量检测按钮会触发真实登录检查：加载 Session、连接 Telegram、访问 SpamBot、回写资料与状态。
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-[12px] bg-panel px-4 py-4">
              <div className="text-[11px] tracking-[0.2em] text-textMuted">当前选中</div>
              <div className="mt-2 text-xl font-semibold text-white">{selectedIds.length}</div>
            </div>
            <div className="rounded-[12px] bg-panel px-4 py-4">
              <div className="text-[11px] tracking-[0.2em] text-textMuted">执行中</div>
              <div className="mt-2 text-xl font-semibold text-white">{checkState.activeCount}</div>
            </div>
            <div className="rounded-[12px] bg-panel px-4 py-4">
              <div className="text-[11px] tracking-[0.2em] text-textMuted">排队中</div>
              <div className="mt-2 text-xl font-semibold text-white">{checkState.pendingCount}</div>
            </div>
            <div className="rounded-[12px] bg-panel px-4 py-4">
              <div className="text-[11px] tracking-[0.2em] text-textMuted">已完成</div>
              <div className="mt-2 text-xl font-semibold text-white">{checkState.completedCount}</div>
            </div>
          </div>

          <div className="mt-4 rounded-[14px] bg-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">最近检测日志</div>
              <button
                onClick={() => void clearCheckLogs()}
                className="rounded-[10px] bg-card px-3 py-2 text-xs text-textMain transition hover:bg-hover"
              >
                清空日志
              </button>
            </div>

            <div className="space-y-2">
              {latestLogs.length === 0 ? (
                <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-textMuted">暂无检测日志。</div>
              ) : (
                latestLogs.map((log) => (
                  <div key={log.id} className="rounded-[12px] bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-textMuted">
                      <span>
                        {formatCheckLogLevel(log.level)}
                        {log.accountId ? ` · #${log.accountId}` : ''}
                      </span>
                      <span>{formatDateTime(log.createdAt)}</span>
                    </div>
                    <div className="mt-2 text-sm text-white">{log.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-[14px] bg-panel p-5">
          <div className="text-xs tracking-[0.22em] text-textMuted">状态回显</div>
          <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-white">{lastActionMessage || '暂无最近操作'}</div>
          <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-amber-200">{errorMessage || '当前没有错误。'}</div>
          <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-textMuted">
            当前队列：{checkState.running ? '检测中' : '空闲'}
          </div>
        </div>
      </div>
    </GlassPanel>
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
      <CheckStatusPanel />
      <AccountTable />
    </div>
  )
}

export default memo(AccountsView)
