import { memo, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, CopyPlus, LayoutTemplate, ListChecks, MessageSquareText, Play, Plus, Radio, RefreshCw, Send, Users } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useBroadcastStore, type BroadcastPreviewItem, type BroadcastTabKey } from '../../stores/broadcaststore'
import { useAccountStore } from '../../stores/accountstore'
import { formatAccountStatus, formatDateTimeFull } from '../../lib/ui-text'

const tabs: Array<{ key: BroadcastTabKey; label: string; icon: typeof ListChecks }> = [
  { key: 'tasks', label: '任务', icon: ListChecks },
  { key: 'creatives', label: '文案库', icon: MessageSquareText },
  { key: 'targets', label: '账号 / 群', icon: Users },
  { key: 'calendar', label: '排程日历', icon: CalendarClock }
]

function getPreviewTone(status: BroadcastPreviewItem['status']) {
  if (status === 'scheduled') return 'text-emerald-300 bg-emerald-400/10'
  if (status === 'failed') return 'text-rose-300 bg-rose-400/10'
  return 'text-sky-300 bg-sky-400/10'
}

function getTaskStatusTone(status: 'draft' | 'active' | 'paused') {
  if (status === 'active') return 'text-emerald-300 bg-emerald-400/10'
  if (status === 'paused') return 'text-amber-200 bg-amber-300/10'
  return 'text-slate-300 bg-white/5'
}

const BroadcastSummary = memo(function BroadcastSummary() {
  const tasks = useBroadcastStore((state) => state.tasks)
  const previewItems = useBroadcastStore((state) => state.previewItems)
  const groups = useBroadcastStore((state) => state.groups)
  const accounts = useAccountStore((state) => state.accounts)

  const summary = useMemo(() => {
    const running = tasks.filter((item) => item.status === 'active' && item.enabled).length
    const scheduled = previewItems.filter((item) => item.status === 'scheduled').length
    const errors = previewItems.filter((item) => item.status === 'failed').length
    return {
      running,
      scheduled,
      groups: groups.filter((item) => item.enabled).length,
      accounts: accounts.length,
      errors
    }
  }, [accounts.length, groups, previewItems, tasks])

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <GlassPanel className="bg-card">
        <div className="text-xs tracking-[0.18em] text-textMuted">运行任务</div>
        <div className="mt-2 text-3xl font-semibold text-white">{summary.running}</div>
      </GlassPanel>
      <GlassPanel className="bg-card">
        <div className="text-xs tracking-[0.18em] text-textMuted">今日已排程</div>
        <div className="mt-2 text-3xl font-semibold text-white">{summary.scheduled}</div>
      </GlassPanel>
      <GlassPanel className="bg-card">
        <div className="text-xs tracking-[0.18em] text-textMuted">目标群</div>
        <div className="mt-2 text-3xl font-semibold text-white">{summary.groups}</div>
      </GlassPanel>
      <GlassPanel className="bg-card">
        <div className="text-xs tracking-[0.18em] text-textMuted">登录账号</div>
        <div className="mt-2 text-3xl font-semibold text-white">{summary.accounts}</div>
      </GlassPanel>
      <GlassPanel className="bg-card">
        <div className="text-xs tracking-[0.18em] text-textMuted">异常项</div>
        <div className="mt-2 text-3xl font-semibold text-white">{summary.errors}</div>
      </GlassPanel>
    </div>
  )
})

const TabBar = memo(function TabBar() {
  const activeTab = useBroadcastStore((state) => state.activeTab)
  const setActiveTab = useBroadcastStore((state) => state.setActiveTab)

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm transition ${active ? 'bg-violet-400/12 text-violet-300' : 'bg-white/[0.03] text-textMuted hover:bg-white/[0.06] hover:text-white'}`}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
})

const TasksWorkbench = memo(function TasksWorkbench() {
  const accounts = useAccountStore((state) => state.accounts)
  const tasks = useBroadcastStore((state) => state.tasks)
  const creatives = useBroadcastStore((state) => state.creatives)
  const groups = useBroadcastStore((state) => state.groups)
  const previewItems = useBroadcastStore((state) => state.previewItems)
  const selectedTaskId = useBroadcastStore((state) => state.selectedTaskId)
  const createTask = useBroadcastStore((state) => state.createTask)
  const duplicateTask = useBroadcastStore((state) => state.duplicateTask)
  const selectTask = useBroadcastStore((state) => state.selectTask)
  const updateTask = useBroadcastStore((state) => state.updateTask)
  const toggleTaskAccount = useBroadcastStore((state) => state.toggleTaskAccount)
  const toggleTaskGroup = useBroadcastStore((state) => state.toggleTaskGroup)
  const toggleTaskCreative = useBroadcastStore((state) => state.toggleTaskCreative)
  const generatePreview = useBroadcastStore((state) => state.generatePreview)
  const clearPreview = useBroadcastStore((state) => state.clearPreview)
  const pushScheduleToTelegram = useBroadcastStore((state) => state.pushScheduleToTelegram)
  const syncing = useBroadcastStore((state) => state.syncing)
  const errorMessage = useBroadcastStore((state) => state.errorMessage)

  const selectedTask = useMemo(() => tasks.find((item) => item.id === selectedTaskId) ?? null, [selectedTaskId, tasks])
  const selectedPreview = useMemo(() => previewItems.filter((item) => item.taskId === selectedTaskId), [previewItems, selectedTaskId])
  const taskDiagnostics = useMemo(() => {
    if (!selectedTask) return [] as string[]
    const problems: string[] = []
    if (selectedTask.accountIds.length === 0) problems.push('还没勾发送账号')
    if (selectedTask.groupIds.length === 0) problems.push('还没勾目标群')
    if (selectedTask.creativeIds.length === 0) problems.push('还没勾文案')
    if (selectedTask.startTime === selectedTask.endTime) problems.push('开始时间和结束时间一样，建议拉开时间窗')
    return problems
  }, [selectedTask])

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(560px,1fr)_360px]">
      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">任务列表</div>
            <div className="mt-1 text-xs text-textMuted">先选任务，再配置账号、群组和图文频率。</div>
          </div>
          <button type="button" onClick={createTask} className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-violet-400/12 text-violet-300 transition hover:bg-violet-400/18">
            <Plus size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {tasks.map((task) => {
            const previewCount = previewItems.filter((item) => item.taskId === task.id).length
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => selectTask(task.id)}
                className={`w-full rounded-[16px] border px-4 py-4 text-left transition ${selectedTaskId === task.id ? 'border-violet-400/30 bg-violet-400/10' : 'border-white/5 bg-panel hover:border-white/10 hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{task.name}</div>
                  <div className={`rounded-full px-2.5 py-1 text-[11px] ${getTaskStatusTone(task.status)}`}>{task.status === 'active' ? '运行中' : task.status === 'paused' ? '已暂停' : '草稿'}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-textMuted">
                  <div>账号 {task.accountIds.length}</div>
                  <div>群组 {task.groupIds.length}</div>
                  <div>文案 {task.creativeIds.length}</div>
                  <div>预览 {previewCount}</div>
                </div>
              </button>
            )
          })}
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        {!selectedTask ? (
          <div className="flex min-h-[520px] items-center justify-center text-sm text-textMuted">先从左侧选择一个任务</div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">{selectedTask.name}</div>
                <div className="mt-1 text-sm text-textMuted">第一版先把任务配置、预览、写入链路跑顺。</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => duplicateTask(selectedTask.id)} className="flex items-center gap-2 rounded-[12px] bg-white/[0.04] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]">
                  <CopyPlus size={16} /> 复制
                </button>
                <button type="button" onClick={() => updateTask(selectedTask.id, { status: selectedTask.status === 'paused' ? 'draft' : 'paused' })} className="rounded-[12px] bg-amber-300/10 px-3 py-2 text-sm text-amber-200 transition hover:bg-amber-300/16">
                  {selectedTask.status === 'paused' ? '恢复' : '暂停'}
                </button>
              </div>
            </div>

            {taskDiagnostics.length > 0 ? (
              <div className="rounded-[16px] border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
                当前任务还有这些缺口：{taskDiagnostics.join('、')}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">任务名称</span>
                <input value={selectedTask.name} onChange={(event) => updateTask(selectedTask.id, { name: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none transition focus:border-violet-400/30" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-textMuted">启用状态</span>
                <select value={selectedTask.enabled ? 'enabled' : 'disabled'} onChange={(event) => updateTask(selectedTask.id, { enabled: event.target.value === 'enabled' })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none transition focus:border-violet-400/30">
                  <option value="enabled">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm">
              <span className="text-textMuted">任务备注</span>
              <textarea value={selectedTask.note} onChange={(event) => updateTask(selectedTask.id, { note: event.target.value })} rows={3} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none transition focus:border-violet-400/30" />
            </label>

            <div className="grid gap-4 md:grid-cols-5">
              <label className="space-y-2 text-sm"><span className="text-textMuted">开始时间</span><input type="time" value={selectedTask.startTime} onChange={(event) => updateTask(selectedTask.id, { startTime: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">结束时间</span><input type="time" value={selectedTask.endTime} onChange={(event) => updateTask(selectedTask.id, { endTime: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">间隔（分钟）</span><input type="number" min={5} value={selectedTask.intervalMinutes} onChange={(event) => updateTask(selectedTask.id, { intervalMinutes: Number(event.target.value) || 10 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">随机抖动（分钟）</span><input type="number" min={0} max={30} value={selectedTask.jitterMinutes} onChange={(event) => updateTask(selectedTask.id, { jitterMinutes: Number(event.target.value) || 0 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">单群每日条数</span><input type="number" min={1} value={selectedTask.dailyLimitPerGroup} onChange={(event) => updateTask(selectedTask.id, { dailyLimitPerGroup: Number(event.target.value) || 1 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
            </div>

            {selectedTask.lastSyncedAt ? <div className="text-xs text-textMuted">最近一次写入 Telegram：{formatDateTimeFull(selectedTask.lastSyncedAt)}</div> : null}

            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <div className="mb-3 text-sm font-semibold text-white">发送账号</div>
                <div className="space-y-2 rounded-[16px] bg-panel p-3">
                  {accounts.length === 0 ? <div className="text-sm text-textMuted">还没有导入账号，先去账号管理登录或导入。</div> : accounts.map((account) => {
                    const checked = selectedTask.accountIds.includes(account.id)
                    return (
                      <label key={account.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] px-3 py-2 hover:bg-white/[0.04]">
                        <div>
                          <div className="text-sm text-white">{account.username || account.phone || `账号#${account.id}`}</div>
                          <div className="text-xs text-textMuted">{formatAccountStatus(account.status)} · {account.phone || account.userId || '未识别'}</div>
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleTaskAccount(selectedTask.id, account.id)} />
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-white">目标群组</div>
                <div className="space-y-2 rounded-[16px] bg-panel p-3">
                  {groups.map((group) => {
                    const checked = selectedTask.groupIds.includes(group.id)
                    return (
                      <label key={group.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] px-3 py-2 hover:bg-white/[0.04]">
                        <div>
                          <div className="text-sm text-white">{group.title}</div>
                          <div className="text-xs text-textMuted">{group.username || '未填写 @username'} · 已入群账号 {group.accountIds.length}</div>
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleTaskGroup(selectedTask.id, group.id)} />
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-white">文案池</div>
                <div className="space-y-2 rounded-[16px] bg-panel p-3">
                  {creatives.map((creative) => {
                    const checked = selectedTask.creativeIds.includes(creative.id)
                    return (
                      <label key={creative.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] px-3 py-2 hover:bg-white/[0.04]">
                        <div>
                          <div className="text-sm text-white">{creative.title}</div>
                          <div className="text-xs text-textMuted">每日 {creative.dailyQuota} 条 · 权重 {creative.weight}</div>
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleTaskCreative(selectedTask.id, creative.id)} />
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => generatePreview(accounts)} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                <RefreshCw size={16} /> 预览今日计划
              </button>
              <button type="button" disabled={syncing} onClick={() => void pushScheduleToTelegram()} className="flex items-center gap-2 rounded-[12px] bg-emerald-400/12 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-60">
                <Send size={16} /> {syncing ? '正在写入…' : '写入 Telegram 定时消息'}
              </button>
              <button type="button" onClick={clearPreview} className="rounded-[12px] bg-white/[0.04] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">清空当前预览</button>
            </div>
            {errorMessage ? <div className="rounded-[14px] border border-rose-400/15 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">今日排程预览</div>
            <div className="mt-1 text-xs text-textMuted">先预览，再写入 Telegram 官方定时消息队列。</div>
          </div>
          <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{selectedPreview.length} 条</div>
        </div>

        <div className="mt-4 max-h-[780px] space-y-3 overflow-y-auto pr-1">
          {selectedPreview.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-[16px] bg-panel text-sm text-textMuted">当前还没有预览结果</div>
          ) : selectedPreview.map((item) => {
            const creative = creatives.find((entry) => entry.id === item.creativeId)
            const group = groups.find((entry) => entry.id === item.groupId)
            const account = accounts.find((entry) => entry.id === item.accountId)
            return (
              <div key={item.id} className="rounded-[16px] bg-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{formatDateTimeFull(item.scheduledAt)}</div>
                  <div className={`rounded-full px-2.5 py-1 text-[11px] ${getPreviewTone(item.status)}`}>{item.status === 'scheduled' ? '已写入' : item.status === 'failed' ? '失败' : '待写入'}</div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-200">
                  <div>群组：{group?.title || '未匹配群组'}</div>
                  <div>账号：{account?.username || account?.phone || '未分配账号'}</div>
                  <div>文案：{creative?.title || '未匹配文案'}</div>
                  {item.remoteMessageId ? <div>官方消息 ID：{item.remoteMessageId}</div> : null}
                  {item.syncedAt ? <div>写入时间：{formatDateTimeFull(item.syncedAt)}</div> : null}
                </div>
                {item.errorMessage ? <div className="mt-3 rounded-[12px] border border-rose-400/15 bg-rose-400/8 px-3 py-2 text-xs text-rose-200">{item.errorMessage}</div> : null}
              </div>
            )
          })}
        </div>
      </GlassPanel>
    </div>
  )
})

const CreativesWorkbench = memo(function CreativesWorkbench() {
  const creatives = useBroadcastStore((state) => state.creatives)
  const selectedCreativeId = useBroadcastStore((state) => state.selectedCreativeId)
  const selectCreative = useBroadcastStore((state) => state.selectCreative)
  const createCreative = useBroadcastStore((state) => state.createCreative)
  const updateCreative = useBroadcastStore((state) => state.updateCreative)
  const selectedCreative = useMemo(() => creatives.find((item) => item.id === selectedCreativeId) ?? null, [creatives, selectedCreativeId])

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_420px]">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {creatives.map((creative) => (
          <button key={creative.id} type="button" onClick={() => selectCreative(creative.id)} className={`overflow-hidden rounded-[18px] border text-left transition ${selectedCreativeId === creative.id ? 'border-violet-400/30 bg-violet-400/10' : 'border-white/5 bg-card hover:border-white/10'}`}>
            <img src={creative.imageUrl} alt={creative.title} className="h-40 w-full object-cover" />
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{creative.title}</div>
                <div className={`rounded-full px-2 py-1 text-[11px] ${creative.enabled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.05] text-textMuted'}`}>{creative.enabled ? '启用中' : '已停用'}</div>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-textMuted">{creative.text || '这条文案还没填正文。'}</div>
              <div className="mt-3 flex items-center justify-between text-xs text-textMuted">
                <span>每日 {creative.dailyQuota} 条</span>
                <span>权重 {creative.weight}</span>
              </div>
            </div>
          </button>
        ))}

        <button type="button" onClick={createCreative} className="flex min-h-[260px] items-center justify-center rounded-[18px] border border-dashed border-violet-400/30 bg-violet-400/6 text-violet-300 transition hover:bg-violet-400/10">
          <span className="flex items-center gap-2 text-sm font-medium"><Plus size={18} /> 新建图文文案</span>
        </button>
      </div>

      <GlassPanel className="bg-card">
        {!selectedCreative ? (
          <div className="flex min-h-[520px] items-center justify-center text-sm text-textMuted">先选一条文案卡片</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold text-white">文案编辑器</div>
              <div className="mt-1 text-sm text-textMuted">第一版先把图、文、每日条数这些核心信息管起来。</div>
            </div>
            <label className="block space-y-2 text-sm"><span className="text-textMuted">标题</span><input value={selectedCreative.title} onChange={(event) => updateCreative(selectedCreative.id, { title: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
            <label className="block space-y-2 text-sm"><span className="text-textMuted">图片 URL</span><input value={selectedCreative.imageUrl} onChange={(event) => updateCreative(selectedCreative.id, { imageUrl: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
            <label className="block space-y-2 text-sm"><span className="text-textMuted">正文</span><textarea value={selectedCreative.text} rows={8} onChange={(event) => updateCreative(selectedCreative.id, { text: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm"><span className="text-textMuted">每日条数</span><input type="number" min={1} value={selectedCreative.dailyQuota} onChange={(event) => updateCreative(selectedCreative.id, { dailyQuota: Number(event.target.value) || 1 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">权重</span><input type="number" min={1} value={selectedCreative.weight} onChange={(event) => updateCreative(selectedCreative.id, { weight: Number(event.target.value) || 1 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
              <label className="space-y-2 text-sm"><span className="text-textMuted">状态</span><select value={selectedCreative.enabled ? 'enabled' : 'disabled'} onChange={(event) => updateCreative(selectedCreative.id, { enabled: event.target.value === 'enabled' })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30"><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
            </div>
            <label className="block space-y-2 text-sm"><span className="text-textMuted">备注</span><textarea value={selectedCreative.note} rows={3} onChange={(event) => updateCreative(selectedCreative.id, { note: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
            <div className="rounded-[16px] bg-panel p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><LayoutTemplate size={16} /> Telegram 预览</div>
              <img src={selectedCreative.imageUrl} alt={selectedCreative.title} className="h-40 w-full rounded-[12px] object-cover" />
              <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{selectedCreative.text || '文案正文为空，后面这里会直接按 Telegram 图文样式预览。'}</div>
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  )
})

const TargetsWorkbench = memo(function TargetsWorkbench() {
  const accounts = useAccountStore((state) => state.accounts)
  const groups = useBroadcastStore((state) => state.groups)
  const createGroup = useBroadcastStore((state) => state.createGroup)
  const updateGroup = useBroadcastStore((state) => state.updateGroup)
  const selectedTargetAccountId = useBroadcastStore((state) => state.selectedTargetAccountId)
  const joinedGroups = useBroadcastStore((state) => state.joinedGroups)
  const loadingJoinedGroups = useBroadcastStore((state) => state.loadingJoinedGroups)
  const errorMessage = useBroadcastStore((state) => state.errorMessage)
  const setSelectedTargetAccountId = useBroadcastStore((state) => state.setSelectedTargetAccountId)
  const loadJoinedGroupsForAccount = useBroadcastStore((state) => state.loadJoinedGroupsForAccount)
  const attachJoinedGroupToAccount = useBroadcastStore((state) => state.attachJoinedGroupToAccount)
  const [groupTitle, setGroupTitle] = useState('')
  const [groupUsername, setGroupUsername] = useState('')
  const [groupMembers, setGroupMembers] = useState('0')

  const selectedAccount = useMemo(() => accounts.find((item) => item.id === selectedTargetAccountId) ?? null, [accounts, selectedTargetAccountId])
  const selectedAccountGroups = useMemo(() => {
    if (!selectedAccount) return groups
    return groups.filter((group) => group.accountIds.includes(selectedAccount.id))
  }, [groups, selectedAccount])

  return (
    <div className="space-y-5">
      <GlassPanel className="bg-card">
        <div className="rounded-[24px] border border-violet-400/20 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/8 to-sky-500/10 p-5">
          <div className="text-xs tracking-[0.2em] text-violet-300">简单模式</div>
          <div className="mt-2 text-2xl font-semibold text-white">账号 / 群配置</div>
          <div className="mt-2 text-sm text-slate-300">别再手工维护“哪个账号勾哪个群”了。现在就按 3 步走：先选账号，再读取它已加入的群，最后点一下加入目标群。</div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ['1', '先选一个账号', '点左边账号卡片'],
              ['2', '读取已加入的群', '系统自动拉这个账号的群列表'],
              ['3', '点一下加入目标群', '后面任务页直接勾选使用']
            ].map(([index, title, desc]) => (
              <div key={index} className="rounded-[18px] bg-black/20 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-400/16 text-sm font-semibold text-violet-200">{index}</div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                </div>
                <div className="mt-2 text-xs leading-6 text-textMuted">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </GlassPanel>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <GlassPanel className="bg-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">1）选择账号</div>
              <div className="mt-1 text-sm text-textMuted">先点一个你要发群的账号。</div>
            </div>
            <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{accounts.length} 个账号</div>
          </div>

          <div className="mt-4 space-y-3">
            {accounts.length === 0 ? (
              <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">还没有可用账号，先去账号管理导入或登录。</div>
            ) : accounts.map((account) => {
              const active = selectedTargetAccountId === account.id
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedTargetAccountId(account.id)}
                  className={`w-full rounded-[20px] border px-4 py-4 text-left transition ${active ? 'border-violet-400/40 bg-violet-400/10 shadow-[0_0_0_1px_rgba(167,139,250,0.15)]' : 'border-white/6 bg-panel hover:border-white/12 hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-white">{account.username || account.phone || `账号#${account.id}`}</div>
                      <div className="mt-1 text-xs text-textMuted">{account.phone || account.userId || '未识别账号'}</div>
                    </div>
                    {active ? <CheckCircle2 size={18} className="shrink-0 text-violet-300" /> : null}
                  </div>
                  <div className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] text-white/90 bg-white/[0.05]">{account.status === 'alive' ? '状态：可发' : `状态：${formatAccountStatus(account.status)}`}</div>
                </button>
              )
            })}
          </div>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">2）读取这个账号已加入的群</div>
                <div className="mt-1 text-sm text-textMuted">选完账号后，直接点下面这个按钮。</div>
              </div>
              <button
                type="button"
                disabled={!selectedTargetAccountId || loadingJoinedGroups}
                onClick={() => selectedTargetAccountId ? void loadJoinedGroupsForAccount(selectedTargetAccountId) : undefined}
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-violet-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-violet-400/40 disabled:text-white/70"
              >
                <RefreshCw size={16} className={loadingJoinedGroups ? 'animate-spin' : ''} />
                {loadingJoinedGroups ? '正在读取群...' : '读取已加入的群'}
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="mt-4 rounded-[18px] bg-panel p-4">
              {!selectedAccount ? (
                <div className="text-sm text-textMuted">先在左边选一个账号。</div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full bg-violet-400/12 px-3 py-1.5 text-sm text-violet-200">当前账号：{selectedAccount.username || selectedAccount.phone || `账号#${selectedAccount.id}`}</div>
                  <div className="rounded-full bg-white/[0.05] px-3 py-1.5 text-sm text-textMuted">已读到群：{joinedGroups.length} 个</div>
                  <div className="rounded-full bg-white/[0.05] px-3 py-1.5 text-sm text-textMuted">已加入目标群：{selectedAccountGroups.length} 个</div>
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">3）选择要发的群</div>
                <div className="mt-1 text-sm text-textMuted">看到哪个群要发，就点它右边按钮。不要的就别点。</div>
              </div>
              {selectedAccount ? <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">账号：{selectedAccount.username || selectedAccount.phone || `账号#${selectedAccount.id}`}</div> : null}
            </div>

            <div className="mt-4 space-y-3">
              {!selectedAccount ? (
                <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">先选账号，再读群。</div>
              ) : loadingJoinedGroups ? (
                <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">正在读取 {selectedAccount.username || selectedAccount.phone || `账号#${selectedAccount.id}`} 的群...</div>
              ) : joinedGroups.length === 0 ? (
                <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">{errorMessage || '还没读到群，点上面的“读取已加入的群”。'}</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {joinedGroups.map((group) => {
                    const exists = groups.some((item) => (item.username && group.username && item.username.toLowerCase() === group.username.toLowerCase()) || item.title === group.title)
                    return (
                      <div key={`${group.peerId}:${group.username || group.title}`} className={`rounded-[20px] border p-4 transition ${exists ? 'border-emerald-400/25 bg-emerald-400/8' : 'border-white/8 bg-panel'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-white">{group.title}</div>
                            <div className="mt-1 text-xs text-textMuted">{group.username || '没有 @username'}{group.memberCount ? ` · ${group.memberCount} 人` : ''}</div>
                          </div>
                          {exists ? <CheckCircle2 size={18} className="shrink-0 text-emerald-300" /> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => attachJoinedGroupToAccount(selectedAccount.id, group)}
                          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${exists ? 'bg-emerald-400/12 text-emerald-300' : 'bg-violet-400/12 text-violet-300 hover:bg-violet-400/18'}`}
                        >
                          {exists ? '已加入目标群' : '加入这个群'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </GlassPanel>

          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <GlassPanel className="bg-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">已选中的目标群</div>
                  <div className="mt-1 text-sm text-textMuted">这些群后面会直接出现在任务页。</div>
                </div>
                <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{selectedAccountGroups.length} 个</div>
              </div>

              <div className="mt-4 space-y-3">
                {selectedAccountGroups.length === 0 ? (
                  <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted">这个账号还没有选中任何目标群。</div>
                ) : selectedAccountGroups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between gap-3 rounded-[18px] bg-panel px-4 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{group.title}</div>
                      <div className="mt-1 text-xs text-textMuted">{group.username || '没有 @username'}{group.memberCount ? ` · ${group.memberCount} 人` : ''}</div>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-textMuted">
                      启用
                      <input type="checkbox" checked={group.enabled} onChange={(event) => updateGroup(group.id, { enabled: event.target.checked })} />
                    </label>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel className="bg-card">
              <div className="text-lg font-semibold text-white">手动补一个群</div>
              <div className="mt-1 text-sm text-textMuted">如果某个群没读出来，再手动补。</div>
              <div className="mt-4 space-y-3">
                <label className="block space-y-2 text-sm"><span className="text-textMuted">群名称</span><input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                <label className="block space-y-2 text-sm"><span className="text-textMuted">群 @username</span><input value={groupUsername} onChange={(event) => setGroupUsername(event.target.value)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                <label className="block space-y-2 text-sm"><span className="text-textMuted">成员数</span><input type="number" value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                <button type="button" onClick={() => { createGroup({ title: groupTitle, username: groupUsername, memberCount: Number(groupMembers) || 0 }); setGroupTitle(''); setGroupUsername(''); setGroupMembers('0') }} className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.1]">
                  <Plus size={16} /> 手动添加
                </button>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </div>
  )
})

const CalendarWorkbench = memo(function CalendarWorkbench() {
  const previewItems = useBroadcastStore((state) => state.previewItems)
  const creatives = useBroadcastStore((state) => state.creatives)
  const groups = useBroadcastStore((state) => state.groups)
  const accounts = useAccountStore((state) => state.accounts)

  const grouped = useMemo(() => {
    const map = new Map<string, BroadcastPreviewItem[]>()
    for (const item of previewItems) {
      const key = item.scheduledAt.slice(0, 13)
      const current = map.get(key) ?? []
      current.push(item)
      map.set(key, current)
    }
    return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [previewItems])

  return (
    <GlassPanel className="bg-card min-h-[720px]">
      <div>
        <div className="text-lg font-semibold text-white">排程日历</div>
        <div className="mt-1 text-sm text-textMuted">先做成小时级时间轴，后面再接真实已发送 / 已取消状态。</div>
      </div>
      <div className="mt-5 space-y-5">
        {grouped.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-[18px] bg-panel text-sm text-textMuted">还没有预览排程，先在任务页点“预览今日计划”。</div>
        ) : grouped.map(([hourKey, items]) => (
          <div key={hourKey} className="rounded-[18px] bg-panel p-4">
            <div className="text-sm font-semibold text-white">{hourKey.replace('T', ' ')}:00</div>
            <div className="mt-4 space-y-3">
              {items.map((item) => {
                const creative = creatives.find((entry) => entry.id === item.creativeId)
                const group = groups.find((entry) => entry.id === item.groupId)
                const account = accounts.find((entry) => entry.id === item.accountId)
                return (
                  <div key={item.id} className="grid gap-3 rounded-[14px] bg-card px-4 py-3 lg:grid-cols-[180px_1fr_180px_120px] lg:items-center">
                    <div className="text-sm text-white">{formatDateTimeFull(item.scheduledAt)}</div>
                    <div>
                      <div className="text-sm font-medium text-white">{creative?.title || '未匹配文案'}</div>
                      <div className="mt-1 text-xs text-textMuted">{group?.title || '未匹配群组'} · {account?.username || account?.phone || '未分配账号'}</div>
                    </div>
                    <div className="text-xs text-textMuted">{item.errorMessage || '已进入本地排程队列'}</div>
                    <div className={`inline-flex rounded-full px-3 py-1 text-xs ${getPreviewTone(item.status)}`}>{item.status === 'scheduled' ? '已写入' : item.status === 'failed' ? '失败' : '待写入'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
})

export default memo(function BroadcastView() {
  const initAccounts = useAccountStore((state) => state.init)
  const activeTab = useBroadcastStore((state) => state.activeTab)
  const lastActionMessage = useBroadcastStore((state) => state.lastActionMessage)

  useEffect(() => {
    void initAccounts()
  }, [initAccounts])

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card overflow-hidden">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs tracking-[0.22em] text-violet-300"><Radio size={14} /> 官方定时消息工作台</div>
            <h1 className="mt-3 text-3xl font-semibold text-white">定时群发</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-textMuted">先用登录账号配置图文文案、目标群和发送频率，再批量写入 Telegram 官方 scheduled messages。第一版我先把任务页、文案库、目标群和排程预览都立起来。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => useBroadcastStore.getState().createTask()} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18"><Plus size={16} /> 新建任务</button>
            <button type="button" onClick={() => useBroadcastStore.getState().setActiveTab('tasks')} className="flex items-center gap-2 rounded-[12px] bg-emerald-400/12 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/18"><Play size={16} /> 回到任务台</button>
          </div>
        </div>
      </GlassPanel>

      <BroadcastSummary />

      <GlassPanel className="bg-card py-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <TabBar />
          <div className="text-sm text-textMuted">{lastActionMessage}</div>
        </div>
      </GlassPanel>

      {activeTab === 'tasks' ? <TasksWorkbench /> : null}
      {activeTab === 'creatives' ? <CreativesWorkbench /> : null}
      {activeTab === 'targets' ? <TargetsWorkbench /> : null}
      {activeTab === 'calendar' ? <CalendarWorkbench /> : null}
    </div>
  )
})
