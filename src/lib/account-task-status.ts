import { useMemo } from 'react'
import type { CheckQueueState } from '../types'
import { useAccountStore } from '../stores/accountstore'
import { useAutoJoinStore } from '../stores/autojoinstore'
import { useBroadcastStore } from '../stores/broadcaststore'
import { useDirectMessageStore } from '../stores/directmessagestore'

export type AccountTaskKind = 'idle' | 'checking' | 'direct-message' | 'broadcast' | 'auto-join' | 'two-factor' | 'profile'

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
  const checkState = useAccountStore((state) => state.checkState)
  const directMessageSending = useDirectMessageStore((state) => state.sending)
  const directMessageStopping = useDirectMessageStore((state) => state.stopping)
  const directMessageRunningAccountIds = useDirectMessageStore((state) => state.runningAccountIds)
  const broadcastSyncing = useBroadcastStore((state) => state.syncing)
  const broadcastStopping = useBroadcastStore((state) => state.stopping)
  const broadcastSyncingAccountIds = useBroadcastStore((state) => state.syncingAccountIds)
  const autoJoinRunning = useAutoJoinStore((state) => state.running)
  const autoJoinStopping = useAutoJoinStore((state) => state.stopping)
  const autoJoinRunningAccountIds = useAutoJoinStore((state) => state.runningAccountIds)
  const twoFactorState = useAccountStore((state) => state.twoFactorState)
  const profileOperationState = useAccountStore((state) => state.profileOperationState)

  return useMemo(() => buildAccountTaskStatusMap({
    checkState,
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
    broadcastSyncing,
    broadcastSyncingAccountIds,
    broadcastStopping,
    checkState,
    directMessageRunningAccountIds,
    directMessageSending,
    directMessageStopping,
    profileOperationState,
    twoFactorState
  ])
}
