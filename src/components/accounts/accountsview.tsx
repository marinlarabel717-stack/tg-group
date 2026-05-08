import { memo, useEffect, useMemo, useState } from 'react'
import { Database, FolderArchive, ShieldCheck, Sparkles } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { AccountTable } from './accounttable'
import { useAccountStore } from '../../stores/accountstore'

const AccountsSummary = memo(function AccountsSummary() {
  const accounts = useAccountStore((state) => state.accounts)
  const { totalCount, aliveCount, riskCount, pendingCount } = useMemo(() => {
    let alive = 0
    let risk = 0
    let pending = 0

    for (const item of accounts) {
      if (item.status === 'alive') alive += 1
      if (['frozen', 'banned', 'limited', 'temporary_limited', 'session_expired', 'multi_ip'].includes(item.status)) risk += 1
      if (['timeout_unchecked', 'checking', 'unknown'].includes(item.status)) pending += 1
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
            当前仅覆盖本地 Session 导入、文件夹扫描、JSON 自动补齐、SQLite 入库、批量状态维护与 DataGrid 管理，不碰自动化、代理池、聊天与多窗口。
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

const SpamBotPanel = memo(function SpamBotPanel() {
  const selectedIds = useAccountStore((state) => state.selectedIds)
  const spamReplyDraft = useAccountStore((state) => state.spamReplyDraft)
  const setSpamReplyDraft = useAccountStore((state) => state.setSpamReplyDraft)
  const applySpamReplyToSelected = useAccountStore((state) => state.applySpamReplyToSelected)
  const busy = useAccountStore((state) => state.busy)
  const lastActionMessage = useAccountStore((state) => state.lastActionMessage)
  const errorMessage = useAccountStore((state) => state.errorMessage)

  return (
    <GlassPanel>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="text-lg font-semibold text-white">SpamBot 状态解析</div>
          <div className="mt-2 text-sm text-textMuted">
            这里先做第一阶段可落地方案：把 SpamBot 回复文本贴进来，批量解析并更新所选账号状态。等你给 JSON 标准模版后，我再把自动生成部分替换成正式字段。
          </div>
          <textarea
            value={spamReplyDraft}
            onChange={(event) => setSpamReplyDraft(event.target.value)}
            placeholder="把 SpamBot 回复原文贴到这里，例如：Good news, no limits are currently applied..."
            className="mt-4 min-h-[140px] w-full rounded-[14px] bg-panel px-4 py-4 text-sm text-textMain outline-none transition focus:bg-hover"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void applySpamReplyToSelected()}
              disabled={busy || selectedIds.length === 0}
              className="flex h-11 items-center rounded-[12px] bg-neon/10 px-5 text-sm font-medium text-neonSoft transition hover:bg-neon/14 disabled:cursor-not-allowed disabled:opacity-40"
            >
              解析并更新所选账号
            </button>
            <div className="text-sm text-textMuted">当前选中：{selectedIds.length} 个账号</div>
          </div>
        </div>

        <div className="space-y-3 rounded-[14px] bg-panel p-5">
          <div className="text-xs tracking-[0.22em] text-textMuted">状态回显</div>
          <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-white">{lastActionMessage || '暂无最近操作'}</div>
          <div className="rounded-[12px] bg-card px-4 py-4 text-sm text-amber-200">{errorMessage || '当前没有错误。'}</div>
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
      <SpamBotPanel />
      <AccountTable />
    </div>
  )
}

export default memo(AccountsView)
