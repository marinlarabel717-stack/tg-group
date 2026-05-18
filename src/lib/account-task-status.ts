import { useMemo } from 'react'
import type { CheckQueueState } from '../types'
import { useAccountStore } from '../stores/accountstore'
import { useAutoJoinStore } from '../stores/autojoinstore'
import { useBatchCreateStore } from '../stores/batchcreatestore'
import { useBroadcastStore } from '../stores/broadcaststore'
import { useDirectMessageStore } from '../stores/directmessagestore'
import { useOtherToolsStore } from '../stores/othertoolsstore'

export type AccountTaskKind = 'idle' | 'checking' | 'direct-message' | 'broadcast' | 'auto-join' | 'batch-create' | 'sniper' | 'two-factor' | 'profile'

export interface AccountTaskMeta {
  kind: AccountTaskKind
  label: string
  tone: string
  occupied: boolean
}

const ACCOUNT_TASK_META: Record<AccountTaskKind, AccountTaskMeta> = {
  idle: {
    kind: 'idle',
    label: '空闲',
    tone: 'border-white/[0.06] bg-white/[0.04] text-slate-300',
    occupied: false
  },
  checking: {
    kind: 'checking',
    label: '检测中',
    tone: 'border-sky-400/18 bg-sky-400/12 text-sky-300',
    occupied: true
  },
  'direct-message': {
    kind: 'direct-message',
    label: '私信中',
    tone: 'border-fuchsia-400/18 bg-fuchsia-400/12 text-fuchsia-200',
    occupied: true
  },
  broadcast: {
    kind: 'broadcast',
    label: '群发中',
    tone: 'border-amber-400/18 bg-amber-400/12 text-amber-200',
    occupied: true
  },
  'auto-join': {
    kind: 'auto-join',
    label: '加群中',
    tone: 'border-violet-400/18 bg-violet-400/12 text-violet-200',
    occupied: true
  },
  'batch-create': {
    kind: 'batch-create',
    label: '创建中',
    tone: 'border-cyan-400/18 bg-cyan-400/12 text-cyan-200',
    occupied: true
  },
  sniper: {
    kind: 'sniper',
    label: '抢注中',
    tone: 'border-rose-400/18 bg-rose-400/12 text-rose-200',
    occupied: true
  },
  'two-factor': {
    kind: 'two-factor',
    label: '2FA 中',
    tone: 'border-fuchsia-400/18 bg-fuchsia-400/12 text-fuchsia-200',
    occupied: true
  },
  profile: {
    kind: 'profile',
    label: '资料中',
    tone: 'border-cyan-400/18 bg-cyan-400/12 text-cyan-200',
    occupied: true
  }
}

function assignTask(map: Map<number, AccountTaskKind>, accountIds: number[], kind: AccountTaskKind) {
  for (const accountId of accountIds) {
    if (!Number.isFinite(accountId)) continue
    if (!map.has(accountId)) {
      map.set(accountId, kind)
    }
  }
}

export function buildAccountTaskStatusMap(input: {
  checkState: Pick<CheckQueueState, 'running' | 'queuedAccountIds' | 'activeAccountIds'>
  directMessage: { sending: boolean; stopping: boolean; runningAccountIds: number[] }
  broadcast: { syncing: boolean; stopping: boolean; syncingAccountIds: number[] }
  autoJoin: { running: boolean; stopping: boolean; runningAccountIds: number[] }
  batchCreate: { running: boolean; stopping: boolean; runningAccountIds: number[] }
  sniper: { running: boolean; stopping: boolean; runningAccountIds: number[] }
  twoFactor: { running: boolean; stopping: boolean; runningAccountIds: number[] }
  profile: { running: boolean; stopping: boolean; runningAccountIds: number[] }
}) {
  const map = new Map<number, AccountTaskKind>()

  if (input.checkState.running) {
    assignTask(map, [...input.checkState.activeAccountIds, ...input.checkState.queuedAccountIds], 'checking')
  }

  if (input.directMessage.sending || input.directMessage.stopping) {
    assignTask(map, input.directMessage.runningAccountIds, 'direct-message')
  }

  if (input.broadcast.syncing || input.broadcast.stopping) {
    assignTask(map, input.broadcast.syncingAccountIds, 'broadcast')
  }

  if (input.autoJoin.running || input.autoJoin.stopping) {
    assignTask(map, input.autoJoin.runningAccountIds, 'auto-join')
  }

  if (input.batchCreate.running || input.batchCreate.stopping) {
    assignTask(map, input.batchCreate.runningAccountIds, 'batch-create')
  }

  if (input.sniper.running || input.sniper.stopping) {
    assignTask(map, input.sniper.runningAccountIds, 'sniper')
  }

  if (input.twoFactor.running || input.twoFactor.stopping) {
    assignTask(map, input.twoFactor.runningAccountIds, 'two-factor')
  }

  if (input.profile.running || input.profile.stopping) {
    assignTask(map, input.profile.runningAccountIds, 'profile')
  }

  return map
}

export function getAccountTaskMeta(taskMap: Map<number, AccountTaskKind>, accountId: number): AccountTaskMeta {
  return ACCOUNT_TASK_META[taskMap.get(accountId) ?? 'idle']
}

export function isAccountOccupied(taskMap: Map<number, AccountTaskKind>, accountId: number) {
  return getAccountTaskMeta(taskMap, accountId).occupied
}

export function useAccountTaskStatusMap() {
  const checkTaskAccountIds = useAccountStore((state) => state.checkTaskAccountIds)
  const checkActiveAccountIds = useAccountStore((state) => state.checkState.activeAccountIds)
  const directMessageSending = useDirectMessageStore((state) => state.sending)
  const directMessageStopping = useDirectMessageStore((state) => state.stopping)
  const directMessageRunningAccountIds = useDirectMessageStore((state) => state.runningAccountIds)
  const broadcastSyncing = useBroadcastStore((state) => state.syncing)
  const broadcastStopping = useBroadcastStore((state) => state.stopping)
  const broadcastSyncingAccountIds = useBroadcastStore((state) => state.syncingAccountIds)
  const autoJoinRunning = useAutoJoinStore((state) => state.running)
  const autoJoinStopping = useAutoJoinStore((state) => state.stopping)
  const autoJoinRunningAccountIds = useAutoJoinStore((state) => state.runningAccountIds)
  const batchCreateRunning = useBatchCreateStore((state) => state.running)
  const batchCreateStopping = useBatchCreateStore((state) => state.stopping)
  const batchCreateRunningAccountIds = useBatchCreateStore((state) => state.runningAccountIds)
  const sniperListenerState = useOtherToolsStore((state) => state.listenerState)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)

  return useMemo(() => buildAccountTaskStatusMap({
    checkState: {
      running: checkTaskAccountIds.length > 0 || checkActiveAccountIds.length > 0,
      queuedAccountIds: checkTaskAccountIds,
      activeAccountIds: checkActiveAccountIds
    },
    directMessage: {
      sending: directMessageSending,
      stopping: directMessageStopping,
      runningAccountIds: directMessageRunningAccountIds
    },
    broadcast: {
      syncing: broadcastSyncing,
      stopping: broadcastStopping,
      syncingAccountIds: broadcastSyncingAccountIds
    },
    autoJoin: {
      running: autoJoinRunning,
      stopping: autoJoinStopping,
      runningAccountIds: autoJoinRunningAccountIds
    },
    batchCreate: {
      running: batchCreateRunning,
      stopping: batchCreateStopping,
      runningAccountIds: batchCreateRunningAccountIds
    },
    sniper: {
      running: Boolean(sniperListenerState?.taskAccountIds?.length),
      stopping: false,
      runningAccountIds: sniperListenerState?.taskAccountIds ?? []
    },
    twoFactor: {
      running: twoFactorState.running,
      stopping: twoFactorState.stopRequested,
      runningAccountIds: twoFactorState.currentAccountId ? [twoFactorState.currentAccountId] : []
    },
    profile: {
      running: profileOperationState.running,
      stopping: profileOperationState.stopRequested,
      runningAccountIds: profileOperationState.currentAccountId ? [profileOperationState.currentAccountId] : []
    }
  }), [
    autoJoinRunning,
    autoJoinRunningAccountIds,
    autoJoinStopping,
    batchCreateRunning,
    batchCreateRunningAccountIds,
    batchCreateStopping,
    broadcastSyncing,
    broadcastSyncingAccountIds,
    broadcastStopping,
    checkActiveAccountIds,
    checkTaskAccountIds,
    directMessageRunningAccountIds,
    directMessageSending,
    directMessageStopping,
    profileOperationState,
    sniperListenerState,
    twoFactorState
  ])
}
