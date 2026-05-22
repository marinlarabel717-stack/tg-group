import { memo, useEffect, useMemo, useState } from 'react'
import { FileClock, KeyRound, MessageCircleMore, Radio, RefreshCcw, ShieldCheck, UserPlus2, UserRoundPen } from 'lucide-react'
import type { ModuleKey, ReauthorizeProgressOverview } from '../../types'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { useBroadcastStore, type BroadcastTabKey } from '../../stores/broadcaststore'
import { useDirectMessageStore, type DirectMessageTabKey } from '../../stores/directmessagestore'
import { useAutoJoinStore, type AutoJoinTabKey } from '../../stores/autojoinstore'
import { useGroupInviteStore } from '../../stores/groupinvitestore'
import { useBatchCreateStore } from '../../stores/batchcreatestore'
import { useOtherToolsStore } from '../../stores/othertoolsstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useUIStore, type LogsContext, type ReauthorizeTab } from '../../stores/uistore'

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
  logsContext?: LogsContext
  reauthorizeTab?: ReauthorizeTab
  groupInviteTabKey?: 'settings' | 'logs'
  icon: typeof FileClock
}

export function DashboardView() {
  const setActiveModule = useUIStore((state) => state.setActiveModule)
  const setLogsContext = useUIStore((state) => state.setLogsContext)
  const setReauthorizeTab = useUIStore((state) => state.setReauthorizeTab)

  const initAccounts = useAccountStore((state) => state.init)
  const accountCheckRunning = useAccountStore((state) => state.checkState.running)
  const accountCheckCompletedCount = useAccountStore((state) => state.checkState.completedCount)
  const accountCheckTotalCount = useAccountStore((state) => state.checkState.totalCount)
  const accountCheckLatestMessage = useAccountStore((state) => state.checkLogs[state.checkLogs.length - 1]?.message || '账号检测任务进行中')
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)
  const importProgress = useAccountStore((state) => state.importProgress)

  const broadcastTasks = useBroadcastStore((state) => state.tasks)
  const broadcastPreviewItems = useBroadcastStore((state) => state.previewItems)
  const broadcastSelectedTaskId = useBroadcastStore((state) => state.selectedTaskId)
  const broadcastLastActionMessage = useBroadcastStore((state) => state.lastActionMessage)
  const broadcastSyncing = useBroadcastStore((state) => state.syncing)
  const broadcastStopping = useBroadcastStore((state) => state.stopping)
  const setBroadcastTab = useBroadcastStore((state) => state.setActiveTab)

  const directPreviewItems = useDirectMessageStore((state) => state.previewItems)
  const directLastActionMessage = useDirectMessageStore((state) => state.lastActionMessage)
  const directSending = useDirectMessageStore((state) => state.sending)
  const directStopping = useDirectMessageStore((state) => state.stopping)
  const setDirectTab = useDirectMessageStore((state) => state.setActiveTab)

  const initAutoJoin = useAutoJoinStore((state) => state.init)
  const autoJoinTasks = useAutoJoinStore((state) => state.tasks)
  const autoJoinLastActionMessage = useAutoJoinStore((state) => state.lastActionMessage)
  const autoJoinRunning = useAutoJoinStore((state) => state.running)
  const autoJoinStopping = useAutoJoinStore((state) => state.stopping)
  const setAutoJoinTab = useAutoJoinStore((state) => state.setActiveTab)

  const initGroupInvite = useGroupInviteStore((state) => state.init)
  const groupInviteProgressState = useGroupInviteStore((state) => state.progressState)
  const groupInviteRunning = useGroupInviteStore((state) => state.running)
  const groupInviteStopping = useGroupInviteStore((state) => state.stopping)
  const groupInviteLastActionMessage = useGroupInviteStore((state) => state.lastActionMessage)
  const setGroupInviteTab = useGroupInviteStore((state) => state.setActiveTab)

  const initBatchCreate = useBatchCreateStore((state) => state.init)
  const batchCreateTasks = useBatchCreateStore((state) => state.tasks)
  const batchCreateCurrentTaskId = useBatchCreateStore((state) => state.currentTaskId)
  const batchCreateLastActionMessage = useBatchCreateStore((state) => state.lastActionMessage)
  const batchCreateRunning = useBatchCreateStore((state) => state.running)
  const batchCreateStopping = useBatchCreateStore((state) => state.stopping)

  const initOtherTools = useOtherToolsStore((state) => state.init)
  const otherToolsManualRunning = useOtherToolsStore((state) => state.manualRunning)
  const otherToolsManualMessage = useOtherToolsStore((state) => state.manualMessage)
  const sniperListenerState = useOtherToolsStore((state) => state.listenerState)

  const initProxyPool = useProxyPoolStore((state) => state.init)
  const proxyPoolState = useProxyPoolStore((state) => state.state)
  const proxyPoolLastActionMessage = useProxyPoolStore((state) => state.lastActionMessage)

  const [reauthorizeState, setReauthorizeState] = useState<ReauthorizeProgressOverview | null>(null)

  useEffect(() => {
    void initAccounts()
    initAutoJoin()
    initGroupInvite()
    initBatchCreate()
    initOtherTools()
    void initProxyPool()
  }, [initAccounts, initAutoJoin, initGroupInvite, initBatchCreate, initOtherTools, initProxyPool])

  useEffect(() => {
    const api = window.desktopAccounts
    if (!api?.getReauthorizeState || !api?.onReauthorizeProgress) return

    let cancelled = false
    void api.getReauthorizeState()
      .then((state) => {
        if (!cancelled) {
          setReauthorizeState(state)
        }
      })
      .catch(() => undefined)

    const unsubscribe = api.onReauthorizeProgress((state) => {
      if (!cancelled) {
        setReauthorizeState(state)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const activeTasks = useMemo(() => {
    const items: DashboardTaskCard[] = []

    if (accountCheckRunning) {
      items.push({
        id: 'accounts-check',
        title: '账号检测',
        subtitle: accountCheckLatestMessage,
        progress: `${accountCheckCompletedCount} / ${accountCheckTotalCount}`,
        accentClass: 'border-violet-300/18 bg-violet-400/8 text-violet-200',
        moduleKey: 'logs',
        logsContext: 'accounts',
        icon: FileClock
      })
    }

    if (twoFactorState.running || twoFactorState.stopRequested) {
      items.push({
        id: 'accounts-two-factor',
        title: twoFactorState.stopRequested ? '2FA 收尾中' : '2FA 任务',
        subtitle: twoFactorState.logs[twoFactorState.logs.length - 1]?.message || (twoFactorState.stopRequested ? '正在收尾当前 2FA 任务' : '2FA 任务进行中'),
        progress: `${twoFactorState.completed} / ${twoFactorState.total}`,
        accentClass: 'border-fuchsia-300/18 bg-fuchsia-400/8 text-fuchsia-200',
        moduleKey: 'logs',
        logsContext: 'accounts-two-factor',
        icon: KeyRound
      })
    }

    if (profileOperationState.running || profileOperationState.stopRequested) {
      items.push({
        id: 'accounts-profile',
        title: profileOperationState.stopRequested ? '资料收尾中' : '资料任务',
        subtitle: profileOperationState.logs[profileOperationState.logs.length - 1]?.message || (profileOperationState.stopRequested ? '正在收尾当前资料任务' : '资料任务进行中'),
        progress: `${profileOperationState.completed} / ${profileOperationState.total}`,
        accentClass: 'border-cyan-300/18 bg-cyan-400/8 text-cyan-100',
        moduleKey: 'logs',
        logsContext: 'accounts-profile',
        icon: UserRoundPen
      })
    }

    if (importProgress && importProgress.phase !== 'completed') {
      const title = importProgress.mode === 'export'
        ? '账号导出'
        : importProgress.mode === 'delete'
          ? '账号删除'
          : '账号导入'

      items.push({
        id: `accounts-${importProgress.mode}`,
        title,
        subtitle: importProgress.message || `${title}任务进行中`,
        progress: `${importProgress.current} / ${importProgress.total}`,
        accentClass: importProgress.mode === 'delete'
          ? 'border-rose-300/18 bg-rose-400/8 text-rose-100'
          : importProgress.mode === 'export'
            ? 'border-sky-300/18 bg-sky-400/8 text-sky-100'
            : 'border-violet-300/18 bg-violet-400/8 text-violet-200',
        moduleKey: 'accounts',
        icon: FileClock
      })
    }

    if (reauthorizeState?.running) {
      const latestLogMessage = reauthorizeState.lastLog?.message || '重新授权任务进行中'
      items.push({
        id: 'reauthorize',
        title: '重新授权',
        subtitle: latestLogMessage,
        progress: `${reauthorizeState.completed} / ${reauthorizeState.total}`,
        accentClass: 'border-violet-300/18 bg-violet-400/8 text-violet-200',
        moduleKey: 'reauthorize',
        reauthorizeTab: 'logs',
        icon: RefreshCcw
      })
    }

    if (broadcastSyncing || broadcastStopping) {
      const activeBroadcastTask = broadcastTasks.find((task) => task.id === broadcastSelectedTaskId) ?? broadcastTasks[0] ?? null
      const taskItems = activeBroadcastTask
        ? broadcastPreviewItems.filter((item) => item.taskId === activeBroadcastTask.id)
        : broadcastPreviewItems
      const completedCount = taskItems.filter((item) => item.status === 'scheduled' || item.status === 'failed').length
      items.push({
        id: 'broadcast-sync',
        title: broadcastStopping ? '定时群发收尾中' : '定时群发',
        subtitle: broadcastLastActionMessage || (broadcastStopping ? '正在收尾当前定时群发任务' : '正在把定时群发写入 Telegram'),
        progress: `${completedCount} / ${taskItems.length || 0}`,
        accentClass: 'border-emerald-300/18 bg-emerald-400/8 text-emerald-200',
        moduleKey: 'automation',
        broadcastTabKey: 'calendar',
        icon: Radio
      })
    }

    if (directSending || directStopping) {
      const completedCount = directPreviewItems.filter((item) => item.status === 'sent' || item.status === 'failed').length
      items.push({
        id: 'direct-message-send',
        title: directStopping ? '私信群发收尾中' : '私信群发',
        subtitle: directLastActionMessage || (directStopping ? '正在收尾当前私信任务' : '私信发送进行中'),
        progress: `${completedCount} / ${directPreviewItems.length || 0}`,
        accentClass: 'border-sky-300/18 bg-sky-400/8 text-sky-100',
        moduleKey: 'direct-message',
        directMessageTabKey: 'logs',
        icon: MessageCircleMore
      })
    }

    if (autoJoinRunning || autoJoinStopping) {
      const activeAutoJoinTask = autoJoinTasks[0] ?? null
      items.push({
        id: 'auto-join',
        title: autoJoinStopping ? '自动加群收尾中' : '自动加群',
        subtitle: autoJoinLastActionMessage || (autoJoinStopping ? '正在收尾当前自动加群任务' : '自动加群任务进行中'),
        progress: activeAutoJoinTask ? `${activeAutoJoinTask.completed} / ${activeAutoJoinTask.total}` : '运行中',
        accentClass: 'border-amber-300/18 bg-amber-300/8 text-amber-100',
        moduleKey: 'auto-join',
        autoJoinTabKey: 'logs',
        icon: UserPlus2
      })
    }

    if (groupInviteRunning || groupInviteStopping) {
      items.push({
        id: 'group-invite',
        title: groupInviteStopping ? '邀请任务收尾中' : '群组成员邀请',
        subtitle: groupInviteLastActionMessage || groupInviteProgressState?.logs[groupInviteProgressState.logs.length - 1]?.message || '邀请任务进行中',
        progress: groupInviteProgressState ? `${groupInviteProgressState.completed} / ${groupInviteProgressState.total}` : '运行中',
        accentClass: 'border-fuchsia-300/18 bg-fuchsia-400/8 text-fuchsia-200',
        moduleKey: 'group-invite',
        groupInviteTabKey: 'logs',
        icon: UserPlus2
      })
    }

    if (batchCreateRunning || batchCreateStopping) {
      const activeBatchCreateTask = batchCreateTasks.find((task) => task.id === batchCreateCurrentTaskId) ?? batchCreateTasks[0] ?? null
      items.push({
        id: 'batch-create',
        title: batchCreateStopping ? '批量创建收尾中' : '批量创建',
        subtitle: batchCreateLastActionMessage || activeBatchCreateTask?.lastMessage || (batchCreateStopping ? '正在收尾当前批量创建任务' : '批量创建任务进行中'),
        progress: activeBatchCreateTask ? `${activeBatchCreateTask.completed} / ${activeBatchCreateTask.total}` : '运行中',
        accentClass: 'border-cyan-300/18 bg-cyan-400/8 text-cyan-100',
        moduleKey: 'logs',
        logsContext: 'batch-create',
        icon: FileClock
      })
    }

    if (proxyPoolState.checkState.running) {
      items.push({
        id: 'proxy-pool-check',
        title: '代理检查',
        subtitle: proxyPoolLastActionMessage || proxyPoolState.checkState.logs[proxyPoolState.checkState.logs.length - 1]?.message || '代理检查进行中',
        progress: `${proxyPoolState.checkState.checkedCount} / ${proxyPoolState.checkState.totalCount}`,
        accentClass: 'border-emerald-300/18 bg-emerald-400/8 text-emerald-200',
        moduleKey: 'logs',
        logsContext: 'proxy-pool',
        icon: ShieldCheck
      })
    }

    if (sniperListenerState?.running) {
      items.push({
        id: 'sniper-listener',
        title: '抢注监听',
        subtitle: sniperListenerState.message || '抢注监听任务进行中',
        progress: `${sniperListenerState.claimedCount} / ${sniperListenerState.candidateCount}`,
        accentClass: 'border-rose-300/18 bg-rose-400/8 text-rose-100',
        moduleKey: 'logs',
        logsContext: 'other-tools-sniper',
        icon: Radio
      })
    }

    if (otherToolsManualRunning) {
      items.push({
        id: 'sniper-manual',
        title: '抢注巡检',
        subtitle: otherToolsManualMessage || '抢注巡检进行中',
        progress: '运行中',
        accentClass: 'border-pink-300/18 bg-pink-400/8 text-pink-100',
        moduleKey: 'logs',
        logsContext: 'other-tools-sniper',
        icon: FileClock
      })
    }

    return items
  }, [
    accountCheckCompletedCount,
    accountCheckLatestMessage,
    accountCheckRunning,
    accountCheckTotalCount,
    autoJoinLastActionMessage,
    autoJoinRunning,
    autoJoinStopping,
    autoJoinTasks,
    batchCreateCurrentTaskId,
    batchCreateLastActionMessage,
    batchCreateRunning,
    groupInviteLastActionMessage,
    groupInviteProgressState,
    groupInviteRunning,
    groupInviteStopping,
    batchCreateStopping,
    batchCreateTasks,
    broadcastLastActionMessage,
    broadcastPreviewItems,
    broadcastSelectedTaskId,
    broadcastStopping,
    broadcastSyncing,
    broadcastTasks,
    directLastActionMessage,
    directPreviewItems,
    directSending,
    directStopping,
    importProgress,
    otherToolsManualMessage,
    otherToolsManualRunning,
    profileOperationState,
    proxyPoolLastActionMessage,
    proxyPoolState.checkState,
    reauthorizeState,
    sniperListenerState,
    twoFactorState
  ])

  const openTask = (task: DashboardTaskCard) => {
    if (task.logsContext) {
      setLogsContext(task.logsContext)
    }

    if (task.reauthorizeTab) {
      setReauthorizeTab(task.reauthorizeTab)
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
    if (task.groupInviteTabKey) {
      setGroupInviteTab(task.groupInviteTabKey)
    }

    setActiveModule(task.moduleKey)
  }

  return (
    <GlassPanel className="bg-card min-h-[720px]">
      <div>
        <div className="text-lg font-semibold text-white">任务进度</div>
        <div className="mt-1 text-sm text-textMuted">这里只看正在跑的任务，点一下就直接跳到对应查看页。</div>
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
                  <div className="mt-2 break-all text-sm text-textMuted">{task.subtitle}</div>
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
