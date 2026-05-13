import { memo, useMemo } from 'react'
import { FileClock, MessageCircleMore, Radio, UserPlus2 } from 'lucide-react'
import type { ModuleKey } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { useBroadcastStore, type BroadcastTabKey } from '../../stores/broadcaststore'
import { useDirectMessageStore, type DirectMessageTabKey } from '../../stores/directmessagestore'
import { useAutoJoinStore, type AutoJoinTabKey } from '../../stores/autojoinstore'
import { useUIStore } from '../../stores/uistore'

type DashboardTaskCard = {
  id: string
  title: string
  subtitle: string
  progress: string
  accentClass: string
  moduleKey: ModuleKey
  broadcastTabKey?: BroadcastTabKey
  directMessageTabKey?: DirectMessageTabKey
  autoJoinTabKey?: AutoJoinTabKey
  logsContext?: 'accounts' | 'proxy-pool'
  icon: typeof FileClock
}

export function DashboardView() {
  const setActiveModule = useUIStore((state) => state.setActiveModule)
  const setLogsContext = useUIStore((state) => state.setLogsContext)

  const accountCheckState = useAccountStore((state) => state.checkState)

  const broadcastTasks = useBroadcastStore((state) => state.tasks)
  const broadcastPreviewItems = useBroadcastStore((state) => state.previewItems)
  const broadcastSelectedTaskId = useBroadcastStore((state) => state.selectedTaskId)
  const broadcastLastActionMessage = useBroadcastStore((state) => state.lastActionMessage)
  const broadcastSyncing = useBroadcastStore((state) => state.syncing)
  const setBroadcastTab = useBroadcastStore((state) => state.setActiveTab)

  const directPreviewItems = useDirectMessageStore((state) => state.previewItems)
  const directLastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)
  const directSending = useDirectMessageStore((state) => state.sending)
  const setDirectTab = useDirectMessageStore((state) => state.setActiveTab)

  const autoJoinTasks = useAutoJoinStore((state) => state.tasks)
  const autoJoinLastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const autoJoinRunning = useAutoJoinStore((state) => state.running)
  const setAutoJoinTab = useAutoJoinStore((state) => state.setActiveTab)

  const activeTasks = useMemo(() => {
    const items: DashboardTaskCard[] = []

    if (accountCheckState.running) {
      const latestMessage = accountCheckState.logs[accountCheckState.logs.length - 1]?.message || '账号检测任务进行中'
      items.push({
        id: 'accounts-check',
        title: '账号检测',
        subtitle: latestMessage,
        progress: `${accountCheckState.completedCount} / ${accountCheckState.totalCount}`,
        accentClass: 'border-violet-300/18 bg-violet-400/8 text-violet-200',
        moduleKey: 'logs',
        logsContext: 'accounts',
        icon: FileClock
      })
    }

    if (broadcastSyncing) {
      const activeBroadcastTask = broadcastTasks.find((task) => task.id === broadcastSelectedTaskId) ?? broadcastTasks[0] ?? null
      const taskItems = activeBroadcastTask
        ? broadcastPreviewItems.filter((item) => item.taskId === activeBroadcastTask.id)
        : broadcastPreviewItems
      const completedCount = taskItems.filter((item) => item.status === 'scheduled' || item.status === 'failed').length
      items.push({
        id: 'broadcast-sync',
        title: '定时群发',
        subtitle: broadcastLastActionMessage || '正在把定时群发写入 Telegram',
        progress: `${completedCount} / ${taskItems.length || 0}`,
        accentClass: 'border-emerald-300/18 bg-emerald-400/8 text-emerald-200',
        moduleKey: 'automation',
        broadcastTabKey: 'calendar',
        icon: Radio
      })
    }

    if (directSending) {
      const completedCount = directPreviewItems.filter((item) => item.status === 'sent' || item.status === 'failed').length
      items.push({
        id: 'direct-message-send',
        title: '私信群发',
        subtitle: directLastActionMessage || '私信发送进行中',
        progress: `${completedCount} / ${directPreviewItems.length || 0}`,
        accentClass: 'border-sky-300/18 bg-sky-400/8 text-sky-100',
        moduleKey: 'direct-message',
        directMessageTabKey: 'logs',
        icon: MessageCircleMore
      })
    }

    if (autoJoinRunning) {
      const activeAutoJoinTask = autoJoinTasks[0] ?? null
      items.push({
        id: 'auto-join',
        title: '自动加群',
        subtitle: autoJoinLastActionMessage || '自动加群任务进行中',
        progress: activeAutoJoinTask ? `${activeAutoJoinTask.completed} / ${activeAutoJoinTask.total}` : '运行中',
        accentClass: 'border-amber-300/18 bg-amber-300/8 text-amber-100',
        moduleKey: 'auto-join',
        autoJoinTabKey: 'logs',
        icon: UserPlus2
      })
    }

    return items
  }, [
    accountCheckState.completedCount,
    accountCheckState.logs,
    accountCheckState.running,
    accountCheckState.totalCount,
    autoJoinLastActionMessage,
    autoJoinRunning,
    autoJoinTasks,
    broadcastLastActionMessage,
    broadcastPreviewItems,
    broadcastSelectedTaskId,
    broadcastSyncing,
    broadcastTasks,
    directLastActionMessage,
    directPreviewItems,
    directSending
  ])

  const openTask = (task: DashboardTaskCard) => {
    if (task.logsContext) {
      setLogsContext(task.logsContext)
    }

    if (task.broadcastTabKey) {
      setBroadcastTab(task.broadcastTabKey)
    }
    if (task.directMessageTabKey) {
      setDirectTab(task.directMessageTabKey)
    }
    if (task.autoJoinTabKey) {
      setAutoJoinTab(task.autoJoinTabKey)
    }

    setActiveModule(task.moduleKey)
  }

  return (
    <GlassPanel className="bg-card min-h-[720px]">
      <div>
        <div className="text-lg font-semibold text-white">任务进度</div>
        <div className="mt-1 text-sm text-textMuted">这里只看正在跑的任务，点一下就直接跳到对应日志页。</div>
      </div>

      <div className="mt-5 space-y-3">
        {activeTasks.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-[18px] bg-panel text-sm text-textMuted">
            当前没有正在执行中的任务。
          </div>
        ) : activeTasks.map((task) => {
          const Icon = task.icon
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => openTask(task)}
              className="w-full rounded-[18px] bg-panel p-4 text-left transition hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Icon size={16} />
                    {task.title}
                  </div>
                  <div className="mt-2 text-sm text-textMuted break-all">{task.subtitle}</div>
                </div>
                <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${task.accentClass}`}>
                  {task.progress}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </GlassPanel>
  )
}

export default memo(DashboardView)
