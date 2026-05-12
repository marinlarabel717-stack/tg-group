import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, CopyPlus, LayoutTemplate, ListChecks, MessageSquareText, Play, Plus, RefreshCw, Send, Users, X } from 'lucide-react'
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

function readAccountNickname(account: { username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return '未命名账号'
}

function readCreativeTitle(creative: { title?: string; text?: string; buttonText?: string; sourceLink?: string; note?: string } | null | undefined) {
  const text = typeof creative?.text === 'string' ? creative.text.trim() : ''
  if (text) return text.length > 12 ? `${text.slice(0, 12)}...` : text
  const sourceLink = typeof creative?.sourceLink === 'string' ? creative.sourceLink.trim() : ''
  if (sourceLink) return sourceLink.length > 24 ? `转发：${sourceLink.slice(0, 24)}...` : `转发：${sourceLink}`
  const button = typeof creative?.buttonText === 'string' ? creative.buttonText.trim() : ''
  if (button) return button
  const legacyButton = typeof creative?.note === 'string' ? creative.note.trim() : ''
  if (legacyButton) return legacyButton
  const title = typeof creative?.title === 'string' ? creative.title.trim() : ''
  return title || '未填写文案'
}

function readCreativeKindLabel(kind?: string) {
  if (kind === 'image') return '图片'
  if (kind === 'image_text') return '图文'
  if (kind === 'image_button') return '图文+按钮'
  if (kind === 'channel_forward') return '频道转发'
  return '文字'
}

function formatPreviewSummaryTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function readRepeatLabel(repeatPeriodSeconds?: number | null) {
  if ((repeatPeriodSeconds ?? 0) === 24 * 60 * 60) return '每天'
  return '绝不'
}

function explainPreviewError(errorMessage: string) {
  const normalized = errorMessage.trim()
  if (!normalized) return '这条目前没有报错。'
  if (normalized.includes('排程时间太近') || normalized.includes('已过期') || /SCHEDULE_DATE_INVALID|MSG_ID_INVALID/i.test(normalized)) {
    return '这条时间已经过了，或者时间不合法。先重新点一次“预览发送”，再马上点“开始发送”。'
  }
  if (normalized.includes('目标群内没有已加入且可发送的账号')) {
    return '这个群还没绑到可发送账号。先把群重新绑定到左边当前账号。'
  }
  if (normalized.includes('缺少可用的 @username') || normalized.includes('缺少可用的 @username、私密链接或群链接') || normalized.includes('无法识别这个群') || /CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID|USERNAME_INVALID|USERNAME_NOT_OCCUPIED/i.test(normalized)) {
    return '这个群引用不对。请检查 @username、公开链接或私密链接。'
  }
  if (normalized.includes('这个群不允许发纯文字') || /CHAT_SEND_PLAIN_FORBIDDEN/i.test(normalized)) {
    return '这个群不允许发纯文字。请改成图文或图片发送。'
  }
  if (normalized.includes('这个群不允许发图片或媒体') || /CHAT_SEND_MEDIA_FORBIDDEN/i.test(normalized)) {
    return '这个群不让发图片或媒体。先改成纯文字，或者去 Telegram 里确认群权限。'
  }
  if (normalized.includes('当前账号在这个群不能发消息') || normalized.includes('当前账号在这个群被限制发言') || /CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED/i.test(normalized)) {
    return '这个账号在群里发不了消息，可能被禁言了，先去 Telegram 里确认权限。'
  }
  if (normalized.includes('当前账号在这个群没有发送或定时发送权限') || /CHAT_ADMIN_REQUIRED/i.test(normalized)) {
    return '这个账号在群里没有发送或定时发送权限。'
  }
  if (normalized.includes('当前账号还没加入这个群') || /USER_NOT_PARTICIPANT/i.test(normalized)) {
    return '这个账号还没进群，或者当前私密链接没有权限。'
  }
  if (normalized.includes('图片有问题') || /PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(normalized)) {
    return '图片有问题，可能格式不对、图片坏了，或者 Telegram 不认这张图。'
  }
  if (normalized.includes('频道消息链接不对') || /SOURCE_MESSAGE_LINK_INVALID|MESSAGE_ID_INVALID/i.test(normalized)) {
    return '频道消息链接不对，或者这条频道消息不存在。请重新复制一条正确的频道消息链接。'
  }
  if (normalized.includes('这个频道消息不允许转发') || /CHAT_FORWARDS_RESTRICTED/i.test(normalized)) {
    return '这个频道消息不允许转发，可能频道开了禁止转发。'
  }
  if (normalized.includes('频道链接转发暂不支持 Telegram 官方重复')) {
    return '频道链接转发暂时不能配“每天重复”，先关掉重复再发。'
  }
  if (normalized.includes('按钮链接格式不对') || /BUTTON_URL_INVALID/i.test(normalized)) {
    return '按钮链接格式不对，请填完整的 https:// 链接。'
  }
  if (normalized.includes('文案太长了') || /MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(normalized)) {
    return '文案太长了，缩短一点再试。'
  }
  if (normalized.includes('这个群的官方定时消息已经堆满了') || /SCHEDULE_TOO_MUCH/i.test(normalized)) {
    return '这个群的定时消息已经满了，先去 Telegram 里删掉一些再发。'
  }
  if (normalized.includes('触发 Telegram 限流') || /FLOOD_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/(\d+)/)
    return matched ? `当前账号被 Telegram 限流了，请 ${matched[1]} 秒后再试。` : '当前账号被 Telegram 限流了，请稍后再试。'
  }
  if (normalized.includes('这个群开了慢速模式') || /SLOWMODE_WAIT_(\d+)/i.test(normalized)) {
    const matched = normalized.match(/(\d+)/)
    return matched ? `这个群开了慢速模式，请 ${matched[1]} 秒后再发。` : '这个群开了慢速模式，请稍后再发。'
  }
  if (normalized.includes('登录状态失效') || /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) {
    return '这个账号掉线了，需要重新登录。'
  }
  if (normalized.includes('私密链接失效') || /INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) {
    return '私密链接失效了、过期了，或者这个账号用不了这个链接。'
  }
  return normalized.startsWith('发送失败：') ? normalized : `发送失败：${normalized}`
}

function normalizeGroupRefValue(value: string) {
  return value.trim().toLowerCase()
}

function normalizeGroupUsername(value: string) {
  const trimmed = value.trim()
  return trimmed ? `@${trimmed.replace(/^@+/, '').toLowerCase()}` : ''
}

function isSameGroupRef(left: { title?: string; username?: string; targetRef?: string }, right: { title?: string; username?: string; targetRef?: string }) {
  const leftTargetRef = normalizeGroupRefValue(left.targetRef || '')
  const rightTargetRef = normalizeGroupRefValue(right.targetRef || '')
  if (leftTargetRef || rightTargetRef) {
    return Boolean(leftTargetRef && rightTargetRef && leftTargetRef === rightTargetRef)
  }

  const leftUsername = normalizeGroupUsername(left.username || '')
  const rightUsername = normalizeGroupUsername(right.username || '')
  if (leftUsername || rightUsername) {
    return Boolean(leftUsername && rightUsername && leftUsername === rightUsername)
  }

  return String(left.title || '').trim() !== '' && String(left.title || '').trim() === String(right.title || '').trim()
}

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
                  <div>文案：{creative ? readCreativeTitle(creative) : '未匹配文案'}</div>
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
            {creative.imageUrl ? <img src={creative.imageUrl} alt={readCreativeTitle(creative)} className="h-40 w-full object-cover" /> : <div className="flex h-40 w-full items-center justify-center bg-panel text-sm text-textMuted">还没设置图片</div>}
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{readCreativeTitle(creative)}</div>
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
              {selectedCreative.imageUrl ? <img src={selectedCreative.imageUrl} alt={readCreativeTitle(selectedCreative)} className="h-40 w-full rounded-[12px] object-cover" /> : <div className="flex h-40 w-full items-center justify-center rounded-[12px] bg-card text-sm text-textMuted">还没设置图片</div>}
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
                    const incomingTargetRef = (group.targetRef || group.username || group.peerId || '').trim()
                    const exists = groups.some((item) => isSameGroupRef(item, { title: group.title, username: group.username, targetRef: incomingTargetRef }))
                    return (
                      <div key={`${group.peerId}:${group.username || group.title}`} className={`rounded-[20px] border p-4 transition ${exists ? 'border-emerald-400/25 bg-emerald-400/8' : 'border-white/8 bg-panel'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-white">{group.title}</div>
                            <div className="mt-1 text-xs text-textMuted">{group.username || group.targetRef || '私密群 / 无公开用户名'}{group.memberCount ? ` · ${group.memberCount} 人` : ''}</div>
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
                      <div className="mt-1 text-xs text-textMuted">{group.username || group.targetRef || '私密群 / 无公开用户名'}{group.memberCount ? ` · ${group.memberCount} 人` : ''}</div>
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
                <label className="block space-y-2 text-sm"><span className="text-textMuted">群目标引用</span><input value={groupUsername} onChange={(event) => setGroupUsername(event.target.value)} placeholder="@username / t.me/... / 私密邀请链接" className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                <label className="block space-y-2 text-sm"><span className="text-textMuted">成员数</span><input type="number" value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                <button type="button" onClick={() => { createGroup({ title: groupTitle, username: groupUsername, targetRef: groupUsername, memberCount: Number(groupMembers) || 0 }); setGroupTitle(''); setGroupUsername(''); setGroupMembers('0') }} className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.1]">
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

const BroadcastConsole = memo(function BroadcastConsole() {
  const accounts = useAccountStore((state) => state.accounts)
  const tasks = useBroadcastStore((state) => state.tasks)
  const groups = useBroadcastStore((state) => state.groups)
  const creatives = useBroadcastStore((state) => state.creatives)
  const previewItems = useBroadcastStore((state) => state.previewItems)
  const selectedTaskId = useBroadcastStore((state) => state.selectedTaskId)
  const selectedTargetAccountId = useBroadcastStore((state) => state.selectedTargetAccountId)
  const joinedGroups = useBroadcastStore((state) => state.joinedGroups)
  const loadingJoinedGroups = useBroadcastStore((state) => state.loadingJoinedGroups)
  const syncing = useBroadcastStore((state) => state.syncing)
  const errorMessage = useBroadcastStore((state) => state.errorMessage)
  const lastActionMessage = useBroadcastStore((state) => state.lastActionMessage)
  const selectTask = useBroadcastStore((state) => state.selectTask)
  const updateTask = useBroadcastStore((state) => state.updateTask)
  const setSelectedTargetAccountId = useBroadcastStore((state) => state.setSelectedTargetAccountId)
  const loadJoinedGroupsForAccount = useBroadcastStore((state) => state.loadJoinedGroupsForAccount)
  const attachJoinedGroupToAccount = useBroadcastStore((state) => state.attachJoinedGroupToAccount)
  const generatePreview = useBroadcastStore((state) => state.generatePreview)
  const pushScheduleToTelegram = useBroadcastStore((state) => state.pushScheduleToTelegram)
  const clearPreview = useBroadcastStore((state) => state.clearPreview)
  const createCreative = useBroadcastStore((state) => state.createCreative)
  const updateCreative = useBroadcastStore((state) => state.updateCreative)
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [draftAccountIds, setDraftAccountIds] = useState<number[]>([])
  const [accountSearch, setAccountSearch] = useState('')

  const selectedTask = useMemo(() => tasks.find((item) => item.id === selectedTaskId) ?? tasks[0] ?? null, [selectedTaskId, tasks])

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      selectTask(tasks[0].id)
    }
  }, [selectedTaskId, selectTask, tasks])

  const selectedAccountIds = selectedTask?.accountIds ?? []
  const selectedAccounts = useMemo(() => accounts.filter((item) => selectedAccountIds.includes(item.id)), [accounts, selectedAccountIds])
  const selectedAccountId = selectedTargetAccountId ?? selectedTask?.accountIds[0] ?? null
  const selectedAccount = useMemo(() => accounts.find((item) => item.id === selectedAccountId) ?? null, [accounts, selectedAccountId])
  const currentAccountIsPremium = Boolean(selectedAccount?.profile?.is_premium)
  const selectedPreview = useMemo(() => previewItems.filter((item) => item.taskId === selectedTask?.id), [previewItems, selectedTask])
  const previewSummary = useMemo(() => {
    const successCount = selectedPreview.filter((item) => item.status === 'scheduled').length
    const failedItems = selectedPreview.filter((item) => item.status === 'failed')
    const pendingCount = selectedPreview.length - successCount - failedItems.length
    const expiredCount = failedItems.filter((item) => item.errorMessage.includes('排程时间太近') || item.errorMessage.includes('已过期')).length
    const unboundGroupNames = Array.from(new Set(failedItems
      .filter((item) => item.errorMessage.includes('目标群内没有已加入且可发送的账号'))
      .map((item) => groups.find((entry) => entry.id === item.groupId)?.title || '未命名群组')))
    const invalidRefGroupNames = Array.from(new Set(failedItems
      .filter((item) => item.errorMessage.includes('缺少可用的 @username') || item.errorMessage.includes('缺少可用的 @username、私密链接或群链接') || item.errorMessage.includes('无法识别这个群'))
      .map((item) => groups.find((entry) => entry.id === item.groupId)?.title || '未命名群组')))
    const firstItem = selectedPreview[0] ?? null
    const lastItem = selectedPreview[selectedPreview.length - 1] ?? null
    return {
      total: selectedPreview.length,
      successCount,
      failedCount: failedItems.length,
      pendingCount,
      expiredCount,
      unboundGroupNames,
      invalidRefGroupNames,
      firstScheduledAt: firstItem?.scheduledAt ?? '',
      lastScheduledAt: lastItem?.scheduledAt ?? ''
    }
  }, [groups, selectedPreview])
  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((account) => {
      const nickname = readAccountNickname(account).toLowerCase()
      return nickname.includes(keyword)
        || String(account.phone || '').toLowerCase().includes(keyword)
        || String(account.username || '').toLowerCase().includes(keyword)
        || String(account.userId || '').toLowerCase().includes(keyword)
    })
  }, [accountSearch, accounts])

  useEffect(() => {
    if (selectedTask?.accountIds[0] && selectedTargetAccountId == null) {
      setSelectedTargetAccountId(selectedTask.accountIds[0])
    }
  }, [selectedTargetAccountId, selectedTask, setSelectedTargetAccountId])

  const syncTaskGroupsForAccount = (accountId: number | null) => {
    if (!selectedTask) return
    const nextGroupIds = accountId == null
      ? []
      : selectedTask.groupIds.filter((groupId) => groups.some((group) => group.id === groupId && group.accountIds.includes(accountId)))

    if (nextGroupIds.length !== selectedTask.groupIds.length) {
      updateTask(selectedTask.id, { groupIds: nextGroupIds })
    }
  }

  const handleSwitchAccount = async (accountId: number) => {
    setSelectedTargetAccountId(accountId)
    syncTaskGroupsForAccount(accountId)
    clearPreview()
    await loadJoinedGroupsForAccount(accountId)
  }

  const openAccountPicker = () => {
    setDraftAccountIds(selectedTask?.accountIds ?? [])
    setAccountSearch('')
    setAccountPickerOpen(true)
  }

  const applyAccountSelection = async () => {
    if (!selectedTask) {
      setAccountPickerOpen(false)
      return
    }

    const nextActive = draftAccountIds.includes(selectedAccountId ?? -1) ? selectedAccountId : (draftAccountIds[0] ?? null)
    const nextGroupIds = nextActive == null
      ? []
      : selectedTask.groupIds.filter((groupId) => groups.some((group) => group.id === groupId && group.accountIds.includes(nextActive)))

    updateTask(selectedTask.id, { accountIds: draftAccountIds, groupIds: nextGroupIds })
    setSelectedTargetAccountId(nextActive ?? null)
    setAccountPickerOpen(false)
    clearPreview()

    if (nextActive) {
      await loadJoinedGroupsForAccount(nextActive)
    }
  }

  const toggleCreative = (creativeId: string) => {
    if (!selectedTask) return
    const next = selectedTask.creativeIds.includes(creativeId)
      ? selectedTask.creativeIds.filter((item) => item !== creativeId)
      : [...selectedTask.creativeIds, creativeId]
    updateTask(selectedTask.id, { creativeIds: next })
  }

  const toggleJoinedGroupSelection = (group: typeof joinedGroups[number]) => {
    if (!selectedTask || !selectedAccount) return

    const incomingTargetRef = (group.targetRef || group.username || group.peerId || '').trim()
    let matchedGroup = groups.find((item) => isSameGroupRef(item, { title: group.title, username: group.username, targetRef: incomingTargetRef }))

    if (!matchedGroup || !matchedGroup.accountIds.includes(selectedAccount.id)) {
      attachJoinedGroupToAccount(selectedAccount.id, group)
      matchedGroup = useBroadcastStore.getState().groups.find((item) => isSameGroupRef(item, { title: group.title, username: group.username, targetRef: incomingTargetRef }))
    }

    if (!matchedGroup) return

    const nextGroupIds = selectedTask.groupIds.includes(matchedGroup.id)
      ? selectedTask.groupIds.filter((item) => item !== matchedGroup.id)
      : [...selectedTask.groupIds, matchedGroup.id]

    updateTask(selectedTask.id, { groupIds: nextGroupIds })
    clearPreview()
  }

  const handleCreativeImageUpload = (creativeId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateCreative(creativeId, { imageUrl: typeof reader.result === 'string' ? reader.result : '' })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleCreativeKindChange = (creativeId: string, kind: 'text' | 'image' | 'image_text' | 'image_button' | 'channel_forward') => {
    if (kind === 'text') {
      updateCreative(creativeId, { kind, imageUrl: '', buttonText: '', buttonUrl: '', sourceLink: '', note: '' })
      return
    }
    if (kind === 'image') {
      updateCreative(creativeId, { kind, buttonText: '', buttonUrl: '', sourceLink: '', note: '' })
      return
    }
    if (kind === 'image_text') {
      updateCreative(creativeId, { kind, buttonText: '', buttonUrl: '', sourceLink: '', note: '' })
      return
    }
    if (kind === 'channel_forward') {
      updateCreative(creativeId, { kind, text: '', imageUrl: '', buttonText: '', buttonUrl: '', note: '' })
      return
    }
    updateCreative(creativeId, { kind, sourceLink: '' })
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(560px,1fr)_360px]">
        <GlassPanel className="bg-card">
          <div>
            <div className="text-lg font-semibold text-white">第 1 步：选择账号</div>
            <div className="mt-1 text-sm text-textMuted">先选发送账号，再去读这个账号已经加入的群。</div>
          </div>

          <div className="mt-4 space-y-4">
            <button type="button" onClick={openAccountPicker} className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
              <Users size={16} /> 选择账号
            </button>

            <button
              type="button"
              disabled={!selectedAccountId || loadingJoinedGroups}
              onClick={() => {
                if (!selectedAccountId) return
                syncTaskGroupsForAccount(selectedAccountId)
                clearPreview()
                void loadJoinedGroupsForAccount(selectedAccountId)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-white/[0.06] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={loadingJoinedGroups ? 'animate-spin' : ''} />
              {loadingJoinedGroups ? '正在读取群...' : '重新读取当前账号群'}
            </button>

            <div className="rounded-[18px] bg-panel p-4">
              <div className="text-xs tracking-[0.18em] text-textMuted">当前操作账号</div>
              <div className="mt-2 text-base font-semibold text-white">{selectedAccount ? (selectedAccount.username || selectedAccount.phone || `账号#${selectedAccount.id}`) : '还没选择账号'}</div>
              <div className="mt-2 text-sm text-textMuted">{selectedAccount ? `${selectedAccount.phone || selectedAccount.userId || '未识别'} · ${formatAccountStatus(selectedAccount.status)}` : '先点上面的“选择账号”。'}</div>
            </div>

            <div className="rounded-[18px] bg-panel p-4">
              <div className="text-sm font-semibold text-white">已选账号</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAccounts.length === 0 ? (
                  <div className="text-sm text-textMuted">还没选择发送账号。</div>
                ) : selectedAccounts.map((account) => {
                  const active = account.id === selectedAccountId
                  return (
                    <button key={account.id} type="button" onClick={() => void handleSwitchAccount(account.id)} className={`rounded-full px-3 py-2 text-sm transition ${active ? 'bg-violet-400/14 text-violet-300' : 'bg-white/[0.05] text-textMuted hover:bg-white/[0.1] hover:text-white'}`}>
                      {account.username || account.phone || `账号#${account.id}`}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        </GlassPanel>

        <div className="space-y-5">
          <GlassPanel className="bg-card sticky top-4 z-10">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">第 4 步：定时发送</div>
                <div className="mt-1 text-sm text-textMuted">最后只管预览一下，然后开始发送。</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => generatePreview(accounts)} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                  <RefreshCw size={16} /> 预览发送
                </button>
                <button type="button" disabled={syncing} onClick={() => void pushScheduleToTelegram()} className="flex items-center gap-2 rounded-[12px] bg-emerald-400/14 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60">
                  <Send size={16} /> {syncing ? '正在启动...' : '开始 / 启动发送'}
                </button>
                <button type="button" onClick={clearPreview} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.09]">清空日志</button>
              </div>
            </div>
          </GlassPanel>

          {!selectedTask ? (
            <GlassPanel className="bg-card"><div className="text-sm text-textMuted">当前没有可用发送配置。</div></GlassPanel>
          ) : (
            <>
              <GlassPanel className="bg-card">
                <div className="text-lg font-semibold text-white">第 2 步：读取账号的群</div>
                <div className="mt-1 text-sm text-textMuted">点上面“重新读取当前账号群”，然后把要发的群点进来就行。</div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {joinedGroups.length === 0 ? (
                    <div className="rounded-[18px] bg-panel px-4 py-12 text-center text-sm text-textMuted lg:col-span-2">{selectedAccount ? (loadingJoinedGroups ? '正在读取群...' : '还没有群数据，先读取一下。') : '先选账号。'}</div>
                  ) : joinedGroups.map((group) => {
                    const incomingTargetRef = (group.targetRef || group.username || group.peerId || '').trim()
                    const matchedGroup = groups.find((item) => isSameGroupRef(item, { title: group.title, username: group.username, targetRef: incomingTargetRef }))
                    const checked = Boolean(matchedGroup && selectedTask.groupIds.includes(matchedGroup.id))
                    return (
                      <button key={`${group.peerId}:${group.username || group.title}`} type="button" onClick={() => toggleJoinedGroupSelection(group)} className={`w-full rounded-[18px] border p-4 text-left transition ${checked ? 'border-violet-400/30 bg-violet-400/8' : 'border-white/8 bg-panel hover:bg-white/[0.03]'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{group.title}</div>
                            <div className="mt-1 text-xs text-textMuted">{group.username || group.targetRef || '私密群 / 无公开用户名'}{group.memberCount ? ` · ${group.memberCount} 人` : ''}</div>
                          </div>
                          {checked ? <CheckCircle2 size={18} className="shrink-0 text-emerald-300" /> : null}
                        </div>
                        <div className={`mt-4 inline-flex rounded-[12px] px-3 py-2 text-sm ${checked ? 'bg-violet-400/14 text-violet-300' : 'bg-white/[0.06] text-white'}`}>
                          {checked ? '已勾选发送' : '勾选这个群发送'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </GlassPanel>

              <GlassPanel className="bg-card">
                <div className="text-lg font-semibold text-white">发送时间</div>
                <div className="mt-1 text-sm text-textMuted">默认从今天开始排。只要开始时间、间隔和条数，系统就会自动跨天接着往后排。</div>
                <div className="mt-4 rounded-[16px] bg-panel p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">会员快捷模式</div>
                      <div className="mt-1 text-xs text-textMuted">会员号勾了“每天重复”后，会直接写 Telegram 官方的每天重复；普通号还是自动跨天，单群最多 100 条。</div>
                    </div>
                    <label className={`inline-flex items-center gap-2 text-sm ${currentAccountIsPremium ? 'text-white' : 'text-textMuted'}`}>
                      <input type="checkbox" checked={selectedTask.scheduleMode === 'daily_repeat'} disabled={!currentAccountIsPremium} onChange={(event) => updateTask(selectedTask.id, { scheduleMode: event.target.checked ? 'daily_repeat' : 'date_range' })} />
                      每天重复
                    </label>
                  </div>
                  {!currentAccountIsPremium ? <div className="mt-3 text-xs text-amber-200">当前账号不是会员号：继续走普通自动跨天模式，单群最多 100 条。</div> : null}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="space-y-2 text-sm"><span className="text-textMuted">开始时间</span><input type="time" value={selectedTask.startTime} onChange={(event) => updateTask(selectedTask.id, { startTime: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                  <label className="space-y-2 text-sm"><span className="text-textMuted">发送间隔（分钟）</span><input type="number" min={5} value={selectedTask.intervalMinutes} onChange={(event) => updateTask(selectedTask.id, { intervalMinutes: Number(event.target.value) || 10 })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                  <label className="space-y-2 text-sm"><span className="text-textMuted">单群每日条数</span><input type="number" min={1} max={currentAccountIsPremium ? undefined : 100} value={selectedTask.dailyLimitPerGroup} onChange={(event) => updateTask(selectedTask.id, { dailyLimitPerGroup: currentAccountIsPremium ? (Number(event.target.value) || 1) : Math.min(Number(event.target.value) || 1, 100) })} className="w-full rounded-[12px] border border-white/8 bg-panel px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                </div>
                {previewSummary.total > 0 ? (
                  <div className="mt-4 rounded-[16px] bg-white/[0.04] px-4 py-4 text-sm text-slate-200">
                    <div>• 从今天开始</div>
                    <div className="mt-1">• 首条：{formatPreviewSummaryTime(previewSummary.firstScheduledAt)}</div>
                    <div className="mt-1">• 末条：{formatPreviewSummaryTime(previewSummary.lastScheduledAt)}</div>
                    <div className="mt-1">• 共 {previewSummary.total} 条</div>
                    {currentAccountIsPremium && selectedTask.scheduleMode === 'daily_repeat' ? <div className="mt-1 text-emerald-200">• 当前会按 Telegram 官方“每天重复”写入</div> : null}
                    {!currentAccountIsPremium ? <div className="mt-1 text-amber-200">• 普通号单群最多 100 条，超过会自动压到 100 条</div> : null}
                  </div>
                ) : null}
              </GlassPanel>

              <GlassPanel className="bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">第 3 步：文案设置</div>
                    <div className="mt-1 text-sm text-textMuted">可以直接写文本/图文，也可以贴频道消息链接做转发定时发送。</div>
                  </div>
                  <button type="button" onClick={createCreative} className="flex items-center gap-2 rounded-[12px] bg-violet-400/12 px-4 py-3 text-sm font-medium text-violet-300 transition hover:bg-violet-400/18">
                    <Plus size={16} /> 新建文案
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  {creatives.length === 0 ? <div className="rounded-[18px] border border-dashed border-white/10 bg-panel px-4 py-12 text-center text-sm text-textMuted">这里先保持空白。点右上角“新建文案”，再填你自己的内容。</div> : null}
                  {creatives.map((creative) => {
                    const checked = selectedTask.creativeIds.includes(creative.id)
                    return (
                      <div key={creative.id} className={`rounded-[18px] border p-4 ${checked ? 'border-violet-400/25 bg-violet-400/8' : 'border-white/8 bg-panel'}`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => toggleCreative(creative.id)} className={`rounded-full px-3 py-2 text-sm transition ${checked ? 'bg-violet-400/14 text-violet-300' : 'bg-white/[0.05] text-textMuted hover:bg-white/[0.1] hover:text-white'}`}>
                              {checked ? '已选中' : '选这条'}
                            </button>
                            <label className="flex items-center gap-2 text-sm text-textMuted">
                              启用
                              <input type="checkbox" checked={creative.enabled} onChange={(event) => updateCreative(creative.id, { enabled: event.target.checked })} />
                            </label>
                          </div>
                          <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{readCreativeKindLabel(creative.kind)}</div>
                        </div>
                        <label className="mt-4 block space-y-2 text-sm">
                          <span className="text-textMuted">消息类型</span>
                          <select value={creative.kind || 'text'} onChange={(event) => handleCreativeKindChange(creative.id, event.target.value as 'text' | 'image' | 'image_text' | 'image_button' | 'channel_forward')} className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white outline-none focus:border-violet-400/30">
                            <option value="text">文字</option>
                            <option value="image">图片</option>
                            <option value="image_text">图文</option>
                            <option value="image_button">图文+按钮</option>
                            <option value="channel_forward">频道链接转发</option>
                          </select>
                        </label>
                        {creative.kind === 'channel_forward' ? (
                          <label className="mt-4 block space-y-2 text-sm">
                            <span className="text-textMuted">频道消息链接</span>
                            <input value={creative.sourceLink || ''} onChange={(event) => updateCreative(creative.id, { sourceLink: event.target.value })} placeholder="https://t.me/频道名/123" className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white outline-none focus:border-violet-400/30" />
                            <div className="text-xs text-textMuted">填一条频道消息链接，发送时会按这条消息做 Telegram 官方转发定时发送。</div>
                          </label>
                        ) : null}
                        {creative.kind !== 'image' && creative.kind !== 'channel_forward' ? <label className="mt-4 block space-y-2 text-sm"><span className="text-textMuted">文本</span><textarea rows={5} value={creative.text} onChange={(event) => updateCreative(creative.id, { text: event.target.value })} className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label> : null}
                        {creative.kind !== 'text' && creative.kind !== 'channel_forward' ? (
                          <>
                            <label className="mt-4 block space-y-2 text-sm"><span className="text-textMuted">上传图片</span><input type="file" accept="image/*" onChange={(event) => handleCreativeImageUpload(creative.id, event)} className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white file:mr-3 file:rounded-[8px] file:border-0 file:bg-violet-400/14 file:px-3 file:py-2 file:text-sm file:text-violet-300" /></label>
                            <div className="mt-3 flex items-center justify-between rounded-[12px] bg-card px-4 py-3 text-sm text-textMuted">
                              <span>{creative.imageUrl ? '已上传图片' : '还没上传图片'}</span>
                              {creative.imageUrl ? <button type="button" onClick={() => updateCreative(creative.id, { imageUrl: '' })} className="text-white transition hover:text-rose-200">删除图片</button> : null}
                            </div>
                          </>
                        ) : null}
                        {creative.kind === 'image_button' ? (
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm"><span className="text-textMuted">按钮文字</span><input value={creative.buttonText || ''} onChange={(event) => updateCreative(creative.id, { buttonText: event.target.value, note: event.target.value })} placeholder="比如：立即查看" className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                            <label className="space-y-2 text-sm"><span className="text-textMuted">按钮链接</span><input value={creative.buttonUrl || ''} onChange={(event) => updateCreative(creative.id, { buttonUrl: event.target.value })} placeholder="https://..." className="w-full rounded-[12px] border border-white/8 bg-card px-4 py-3 text-white outline-none focus:border-violet-400/30" /></label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </GlassPanel>
            </>
          )}
        </div>

        <GlassPanel className="bg-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">运行日志</div>
              <div className="mt-1 text-sm text-textMuted">发送预览、写入结果、报错都放右边。</div>
            </div>
            <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-textMuted">{selectedPreview.length} 条</div>
          </div>

          {lastActionMessage ? <div className="mt-4 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastActionMessage}</div> : null}
          {errorMessage ? <div className="mt-3 rounded-[14px] border border-rose-400/15 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}

          {selectedPreview.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[18px] border border-violet-400/15 bg-violet-400/8 p-4">
                <div className="text-sm font-semibold text-white">结果先看这里</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[14px] bg-panel px-4 py-3">
                    <div className="text-xs text-textMuted">已写入</div>
                    <div className="mt-1 text-xl font-semibold text-emerald-300">{previewSummary.successCount} 条</div>
                  </div>
                  <div className="rounded-[14px] bg-panel px-4 py-3">
                    <div className="text-xs text-textMuted">失败</div>
                    <div className="mt-1 text-xl font-semibold text-rose-300">{previewSummary.failedCount} 条</div>
                  </div>
                  <div className="rounded-[14px] bg-panel px-4 py-3">
                    <div className="text-xs text-textMuted">待写入</div>
                    <div className="mt-1 text-xl font-semibold text-slate-200">{previewSummary.pendingCount} 条</div>
                  </div>
                </div>
              </div>

              {previewSummary.failedCount > 0 ? (
                <div className="rounded-[18px] border border-rose-400/15 bg-rose-400/8 p-4">
                  <div className="text-sm font-semibold text-white">先处理这几个问题</div>
                  <div className="mt-3 space-y-2 text-sm text-rose-100">
                    {previewSummary.expiredCount > 0 ? <div>1）有 {previewSummary.expiredCount} 条已经过期：先重新点“预览发送”，再马上点“开始发送”。</div> : null}
                    {previewSummary.unboundGroupNames.length > 0 ? <div>2）这些群还没绑好发送账号：{previewSummary.unboundGroupNames.join('、')}</div> : null}
                    {previewSummary.invalidRefGroupNames.length > 0 ? <div>3）这些群的群链接 / 私密链接还不对：{previewSummary.invalidRefGroupNames.join('、')}</div> : null}
                    {previewSummary.expiredCount === 0 && previewSummary.unboundGroupNames.length === 0 && previewSummary.invalidRefGroupNames.length === 0 ? <div>有失败项，但不是上面这两类常见问题，往下看单条报错就行。</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 max-h-[820px] space-y-3 overflow-y-auto pr-1">
            {selectedPreview.length === 0 ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[18px] bg-panel text-sm text-textMuted">还没有运行日志，先点上面的“预览发送”或“开始 / 启动发送”。</div>
            ) : selectedPreview.map((item) => {
              const creative = creatives.find((entry) => entry.id === item.creativeId)
              const group = groups.find((entry) => entry.id === item.groupId)
              const account = accounts.find((entry) => entry.id === item.accountId)
              return (
                <div key={item.id} className="rounded-[16px] bg-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{formatDateTimeFull(item.scheduledAt)}</div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] ${getPreviewTone(item.status)}`}>{item.status === 'scheduled' ? '已写入' : item.status === 'failed' ? '失败' : '待发送'}</div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-200">
                    <div>群组：{group?.title || '未匹配群组'}</div>
                    <div>账号：{account?.username || account?.phone || '未分配账号'}</div>
                    <div>文案：{creative ? readCreativeTitle(creative) : '未匹配文案'}</div>
                    <div>重复：{readRepeatLabel(item.repeatPeriodSeconds)}</div>
                    {item.remoteMessageId ? <div>消息 ID：{item.remoteMessageId}</div> : null}
                    {item.syncedAt ? <div>写入时间：{formatDateTimeFull(item.syncedAt)}</div> : null}
                  </div>
                  {item.errorMessage ? <div className="mt-3 rounded-[12px] border border-rose-400/15 bg-rose-400/8 px-3 py-2 text-xs text-rose-200">{explainPreviewError(item.errorMessage)}</div> : null}
                </div>
              )
            })}
          </div>
        </GlassPanel>
      </div>

      {accountPickerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-6" onClick={() => setAccountPickerOpen(false)}>
          <div className="mt-2 flex max-h-[calc(100vh-48px)] w-full max-w-[980px] flex-col rounded-[22px] border border-white/10 bg-card shadow-[0_18px_64px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-card px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-white">选择账号</div>
                <div className="mt-1 text-sm text-textMuted">按账号管理的表格方式来选：能搜索、全选、手动勾选。</div>
              </div>
              <button type="button" className="rounded-[10px] p-2 text-textMuted transition hover:bg-white/5 hover:text-white" onClick={() => setAccountPickerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="搜索账号名 / 手机号 / 用户名"
                  className="h-11 w-full rounded-[12px] border border-white/8 bg-panel px-4 text-sm text-white outline-none focus:border-violet-400/30 lg:max-w-[360px]"
                />
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setDraftAccountIds(filteredAccounts.map((item) => item.id))} className="rounded-[12px] bg-violet-400/12 px-4 py-2.5 text-sm text-violet-300 transition hover:bg-violet-400/18">全选当前结果</button>
                  <button type="button" onClick={() => setDraftAccountIds([])} className="rounded-[12px] bg-white/[0.05] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]">清空</button>
                  <div className="rounded-full bg-white/[0.04] px-3 py-2 text-sm text-textMuted">已选 {draftAccountIds.length} / {accounts.length}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[18px] border border-white/8 bg-panel">
                <div className="grid grid-cols-[64px_180px_1.2fr_140px_120px] border-b border-white/8 bg-white/[0.04] px-4 py-3 text-xs tracking-[0.16em] text-textMuted">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={filteredAccounts.length > 0 && filteredAccounts.every((account) => draftAccountIds.includes(account.id))}
                      onChange={(event) => setDraftAccountIds(event.target.checked ? filteredAccounts.map((item) => item.id) : [])}
                    />
                  </div>
                  <div>手机号</div>
                  <div>账号名</div>
                  <div>状态</div>
                  <div>用户 ID</div>
                </div>

                <div className="max-h-[520px] overflow-y-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-textMuted">没有匹配到账号。</div>
                  ) : filteredAccounts.map((account) => {
                    const checked = draftAccountIds.includes(account.id)
                    return (
                      <label key={account.id} className={`grid cursor-pointer grid-cols-[64px_180px_1.2fr_140px_120px] items-center border-b border-white/6 px-4 py-3 text-sm transition ${checked ? 'bg-violet-400/10' : 'hover:bg-white/[0.04]'}`}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDraftAccountIds((current) => current.includes(account.id) ? current.filter((item) => item !== account.id) : [...current, account.id])}
                          />
                        </div>
                        <div className="truncate text-white">{account.phone || '—'}</div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{readAccountNickname(account)}</div>
                          <div className="mt-1 truncate text-xs text-textMuted">@{account.username || '无用户名'}</div>
                        </div>
                        <div>
                          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-slate-200">{formatAccountStatus(account.status)}</span>
                        </div>
                        <div className="truncate text-textMuted">{account.userId || '—'}</div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-white/8 bg-card px-5 py-4">
              <button type="button" onClick={() => setAccountPickerOpen(false)} className="rounded-[12px] bg-white/[0.05] px-4 py-3 text-sm text-white transition hover:bg-white/[0.1]">取消</button>
              <button type="button" onClick={() => void applyAccountSelection()} className="rounded-[12px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-violet-300">确定使用这些账号</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
                      <div className="text-sm font-medium text-white">{creative ? readCreativeTitle(creative) : '未匹配文案'}</div>
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

  useEffect(() => {
    void initAccounts()
  }, [initAccounts])

  return (
    <div className="contain-layout">
      <BroadcastConsole />
    </div>
  )
})
