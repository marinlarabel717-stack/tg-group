import { create } from 'zustand'
import type { BroadcastJoinedGroup, GroupInvitePayload, GroupInviteProgressState, GroupInviteTargetItem, GroupInviteTaskResult } from '../types'

export type GroupInviteTabKey = 'settings' | 'logs'
export type GroupInviteTaskStatus = 'running' | 'completed' | 'stopped'

export interface GroupInviteParsedSummary {
  items: GroupInviteTargetItem[]
  duplicates: string[]
  invalids: string[]
}

export interface GroupInviteTaskRecord {
  id: string
  status: GroupInviteTaskStatus
  total: number
  completed: number
  successCount: number
  failedCount: number
  startedAt: string
  finishedAt: string | null
  lastMessage: string
  groupTitle: string
}

export interface GroupInviteTaskSnapshot {
  taskId: string
  total: number
  completed: number
  successCount: number
  failedCount: number
  items: GroupInviteTaskResult['results']
  message: string
  finishedAt: string
  stopped?: boolean
  groupTitle: string
}

interface GroupInviteState {
  activeTab: GroupInviteTabKey
  selectedAccountIds: number[]
  groupSourceAccountId: number | null
  groups: BroadcastJoinedGroup[]
  groupSearch: string
  selectedGroupRef: string
  selectedGroupTitle: string
  targetInput: string
  inviteIntervalSeconds: number
  accountFrequencySeconds: number
  retryWaitSeconds: number
  perRoundLimit: number
  riskWaitSeconds: number
  running: boolean
  stopping: boolean
  runningAccountIds: number[]
  runtimeReady: boolean
  loadingGroups: boolean
  lastActionMessage: string
  progressState: GroupInviteProgressState | null
  currentTaskId: string | null
  tasks: GroupInviteTaskRecord[]
  taskSnapshots: GroupInviteTaskSnapshot[]
  completionDialogTaskId: string | null
  setActiveTab: (tab: GroupInviteTabKey) => void
  setSelectedAccountIds: (ids: number[]) => void
  setGroupSourceAccountId: (id: number | null) => void
  setGroupSearch: (value: string) => void
  setSelectedGroup: (group: BroadcastJoinedGroup | null) => void
  setTargetInput: (value: string) => void
  setInviteIntervalSeconds: (value: number) => void
  setAccountFrequencySeconds: (value: number) => void
  setRetryWaitSeconds: (value: number) => void
  setPerRoundLimit: (value: number) => void
  setRiskWaitSeconds: (value: number) => void
  refreshGroups: () => Promise<void>
  startTask: () => Promise<void>
  stopTask: () => Promise<void>
  clearLogs: () => void
  closeCompletionDialog: () => void
  openCompletionDialog: (taskId: string) => void
  init: () => void
}

let subscribed = false

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function upsertTask(tasks: GroupInviteTaskRecord[], task: GroupInviteTaskRecord) {
  const next = tasks.filter((item) => item.id !== task.id)
  return [task, ...next].slice(0, 20)
}

function upsertTaskSnapshot(snapshots: GroupInviteTaskSnapshot[], snapshot: GroupInviteTaskSnapshot) {
  const next = snapshots.filter((item) => item.taskId !== snapshot.taskId)
  return [snapshot, ...next].slice(0, 10)
}

function createTaskRecord(taskId: string, total: number, groupTitle: string): GroupInviteTaskRecord {
  return {
    id: taskId,
    status: 'running',
    total,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastMessage: '群组邀请任务已启动。',
    groupTitle
  }
}

function normalizeInviteTarget(input: string) {
  const raw = input.trim()
  if (!raw) return null
  if (/^@?[A-Za-z0-9_]{3,}$/.test(raw)) {
    return {
      kind: 'username' as const,
      normalized: `@${raw.replace(/^@+/, '').toLowerCase()}`
    }
  }

  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+?\d{5,20}$/.test(digits)) {
    const normalized = digits.startsWith('+') ? digits : `+${digits.replace(/^\++/, '')}`
    return {
      kind: 'phone' as const,
      normalized
    }
  }

  return null
}

export function parseGroupInviteTargets(input: string): GroupInviteParsedSummary {
  const tokens = input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const items: GroupInviteTargetItem[] = []
  const duplicates: string[] = []
  const invalids: string[] = []
  const seen = new Set<string>()

  tokens.forEach((token, index) => {
    const parsed = normalizeInviteTarget(token)
    if (!parsed) {
      invalids.push(token)
      return
    }
    if (seen.has(parsed.normalized)) {
      duplicates.push(parsed.normalized)
      return
    }
    seen.add(parsed.normalized)
    items.push({
      id: `group_invite_target_${index}_${Math.random().toString(36).slice(2, 8)}`,
      raw: token,
      normalized: parsed.normalized,
      kind: parsed.kind
    })
  })

  return { items, duplicates, invalids }
}

function readLastMessage(state: GroupInviteProgressState | null) {
  return state?.logs[state.logs.length - 1]?.message || ''
}

function buildPayload(state: GroupInviteState): GroupInvitePayload {
  const summary = parseGroupInviteTargets(state.targetInput)
  return {
    accountIds: state.selectedAccountIds,
    groupRef: state.selectedGroupRef,
    groupTitle: state.selectedGroupTitle,
    items: summary.items,
    inviteIntervalSeconds: state.inviteIntervalSeconds,
    accountFrequencySeconds: state.accountFrequencySeconds,
    retryWaitSeconds: state.retryWaitSeconds,
    perRoundLimit: state.perRoundLimit,
    riskWaitSeconds: state.riskWaitSeconds
  }
}

export const useGroupInviteStore = create<GroupInviteState>((set, get) => ({
  activeTab: 'settings',
  selectedAccountIds: [],
  groupSourceAccountId: null,
  groups: [],
  groupSearch: '',
  selectedGroupRef: '',
  selectedGroupTitle: '',
  targetInput: '',
  inviteIntervalSeconds: 45,
  accountFrequencySeconds: 90,
  retryWaitSeconds: 120,
  perRoundLimit: 8,
  riskWaitSeconds: 320,
  running: false,
  stopping: false,
  runningAccountIds: [],
  runtimeReady: false,
  loadingGroups: false,
  lastActionMessage: '',
  progressState: null,
  currentTaskId: null,
  tasks: [],
  taskSnapshots: [],
  completionDialogTaskId: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedAccountIds: (ids) => set((state) => ({
    selectedAccountIds: Array.from(new Set(ids.filter((id) => Number.isFinite(id)))),
    groupSourceAccountId: ids.includes(state.groupSourceAccountId ?? -1)
      ? state.groupSourceAccountId
      : (ids[0] ?? null)
  })),
  setGroupSourceAccountId: (id) => set({ groupSourceAccountId: id }),
  setGroupSearch: (value) => set({ groupSearch: value }),
  setSelectedGroup: (group) => set({
    selectedGroupRef: group?.targetRef || '',
    selectedGroupTitle: group?.title || ''
  }),
  setTargetInput: (value) => set({ targetInput: value }),
  setInviteIntervalSeconds: (value) => set({ inviteIntervalSeconds: Math.max(1, Number(value) || 1) }),
  setAccountFrequencySeconds: (value) => set({ accountFrequencySeconds: Math.max(1, Number(value) || 1) }),
  setRetryWaitSeconds: (value) => set({ retryWaitSeconds: Math.max(0, Number(value) || 0) }),
  setPerRoundLimit: (value) => set({ perRoundLimit: Math.max(1, Number(value) || 1) }),
  setRiskWaitSeconds: (value) => set({ riskWaitSeconds: Math.max(1, Number(value) || 1) }),
  refreshGroups: async () => {
    const api = window.desktopBroadcast
    const accountId = get().groupSourceAccountId
    if (!api?.listJoinedGroups) {
      set({ lastActionMessage: '当前运行环境没有注入群组读取能力。' })
      return
    }
    if (!accountId) {
      set({ lastActionMessage: '请先选择一个用于读取群组列表的账号。' })
      return
    }

    set({ loadingGroups: true, lastActionMessage: '正在读取群组列表…' })
    try {
      const groups = await api.listJoinedGroups(accountId)
      const currentRef = get().selectedGroupRef
      const matched = groups.find((item) => item.targetRef === currentRef || item.username === currentRef) ?? null
      set({
        groups,
        selectedGroupRef: matched?.targetRef || get().selectedGroupRef,
        selectedGroupTitle: matched?.title || get().selectedGroupTitle,
        loadingGroups: false,
        lastActionMessage: groups.length > 0 ? `已读取 ${groups.length} 个群组。` : '当前账号暂时没有可选群组。'
      })
    } catch (error) {
      set({
        loadingGroups: false,
        lastActionMessage: error instanceof Error ? error.message : '读取群组列表失败，请稍后再试。'
      })
    }
  },
  startTask: async () => {
    const api = window.desktopGroupInvite
    if (!api?.start) {
      throw new Error('当前运行环境没有注入群组邀请能力。')
    }
    const payload = buildPayload(get())
    if (payload.accountIds.length === 0) {
      throw new Error('请先选择执行账号。')
    }
    if (!payload.groupRef) {
      throw new Error('请先选择目标群组。')
    }
    if (payload.items.length === 0) {
      throw new Error('请先导入待邀请联系人。')
    }

    const taskId = createId('group-invite-task')
    const taskRecord = createTaskRecord(taskId, payload.items.length, payload.groupTitle || payload.groupRef)

    set((state) => ({
      activeTab: 'logs',
      currentTaskId: taskId,
      tasks: upsertTask(state.tasks, taskRecord),
      lastActionMessage: '正在启动群组邀请任务…'
    }))

    const result = await api.start(payload)
    const currentTaskId = get().currentTaskId ?? taskId
    const finishedAt = new Date().toISOString()

    set((state) => {
      const prevTask = state.tasks.find((item) => item.id === currentTaskId) ?? taskRecord
      const stopped = state.stopping || !state.running
      const nextTask: GroupInviteTaskRecord = {
        ...prevTask,
        status: stopped ? 'stopped' : 'completed',
        total: result.total,
        completed: result.results.length,
        successCount: result.successCount,
        failedCount: result.failedCount,
        finishedAt,
        lastMessage: result.message,
        groupTitle: payload.groupTitle || payload.groupRef
      }
      const nextSnapshot: GroupInviteTaskSnapshot = {
        taskId: currentTaskId,
        total: result.total,
        completed: result.results.length,
        successCount: result.successCount,
        failedCount: result.failedCount,
        items: result.results,
        message: result.message,
        finishedAt,
        stopped,
        groupTitle: payload.groupTitle || payload.groupRef
      }

      return {
        tasks: upsertTask(state.tasks, nextTask),
        taskSnapshots: upsertTaskSnapshot(state.taskSnapshots, nextSnapshot),
        completionDialogTaskId: currentTaskId,
        currentTaskId: null,
        lastActionMessage: result.message,
        stopping: false
      }
    })
  },
  stopTask: async () => {
    const api = window.desktopGroupInvite
    if (!api?.stop) {
      throw new Error('当前运行环境没有注入群组邀请能力。')
    }
    set({ stopping: true, lastActionMessage: '正在停止当前群组邀请任务…' })
    try {
      const result = await api.stop()
      set({ lastActionMessage: result.message })
    } finally {
      set({ stopping: true })
    }
  },
  clearLogs: () => set((state) => ({
    progressState: state.progressState
      ? {
          ...state.progressState,
          logs: []
        }
      : state.progressState,
    lastActionMessage: state.progressState ? '已清空本地日志显示。' : state.lastActionMessage
  })),
  closeCompletionDialog: () => set({ completionDialogTaskId: null }),
  openCompletionDialog: (taskId) => set({ completionDialogTaskId: taskId }),
  init: () => {
    if (subscribed) return
    subscribed = true

    const api = window.desktopGroupInvite
    if (!api?.onProgress || !api?.getState) {
      set({ runtimeReady: false, lastActionMessage: '当前运行环境没有注入群组邀请能力。' })
      return
    }

    void api.getState()
      .then((state) => {
        set((current) => {
          const currentTaskId = state.running ? current.currentTaskId ?? createId('group-invite-task') : current.currentTaskId
          const nextTasks = state.running && currentTaskId
            ? upsertTask(current.tasks, {
                ...(current.tasks.find((item) => item.id === currentTaskId) ?? createTaskRecord(currentTaskId, state.total, state.groupTitle || state.groupRef)),
                total: state.total,
                completed: state.completed,
                successCount: state.successCount,
                failedCount: state.failedCount,
                lastMessage: readLastMessage(state) || '群组邀请任务进行中',
                groupTitle: state.groupTitle || state.groupRef
              })
            : current.tasks

          return {
            progressState: state,
            running: state.running,
            stopping: state.stopRequested,
            runningAccountIds: state.runningAccountIds,
            runtimeReady: true,
            currentTaskId,
            tasks: nextTasks,
            lastActionMessage: readLastMessage(state)
          }
        })
      })
      .catch((error) => {
        set({ runtimeReady: false, lastActionMessage: error instanceof Error ? error.message : '读取群组邀请状态失败。' })
      })

    api.onProgress((state) => {
      set((current) => {
        const currentTaskId = state.running ? current.currentTaskId ?? createId('group-invite-task') : current.currentTaskId
        const nextTasks = currentTaskId
          ? upsertTask(current.tasks, {
              ...(current.tasks.find((item) => item.id === currentTaskId) ?? createTaskRecord(currentTaskId, state.total, state.groupTitle || state.groupRef)),
              total: state.total,
              completed: state.completed,
              successCount: state.successCount,
              failedCount: state.failedCount,
              lastMessage: readLastMessage(state) || '群组邀请任务进行中',
              groupTitle: state.groupTitle || state.groupRef,
              status: state.running ? 'running' : current.stopping ? 'stopped' : 'completed',
              finishedAt: state.running ? null : new Date().toISOString()
            })
          : current.tasks

        return {
          progressState: state,
          running: state.running,
          stopping: state.stopRequested,
          runningAccountIds: state.runningAccountIds,
          runtimeReady: true,
          currentTaskId: state.running ? currentTaskId : current.currentTaskId,
          tasks: nextTasks,
          lastActionMessage: readLastMessage(state)
        }
      })
    })
  }
}))
