import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AutoJoinProgress, AutoJoinPayloadItem, AutoJoinResultItem, AutoJoinTaskResult } from '../types'

export type AutoJoinTabKey = 'tasks' | 'logs' | 'links'
export type AutoJoinTaskStatus = 'draft' | 'running' | 'completed' | 'stopped'
export type AutoJoinLogLevel = 'info' | 'success' | 'warning' | 'error'

export interface AutoJoinParsedSummary {
  items: AutoJoinPayloadItem[]
  duplicates: string[]
  invalids: string[]
}

export interface AutoJoinTaskRecord {
  id: string
  name: string
  status: AutoJoinTaskStatus
  total: number
  completed: number
  successCount: number
  alreadyCount: number
  requestedCount: number
  failedCount: number
  startedAt: string | null
  finishedAt: string | null
  lastMessage: string
}

export interface AutoJoinLogEntry {
  id: string
  taskId: string | null
  level: AutoJoinLogLevel
  accountId: number | null
  accountLabel: string
  target: string
  groupTitle: string
  status: AutoJoinResultItem['status'] | 'waiting' | 'info'
  message: string
  createdAt: string
}

export interface AutoJoinTaskSnapshot {
  taskId: string
  name: string
  total: number
  successCount: number
  alreadyCount: number
  requestedCount: number
  failedCount: number
  items: AutoJoinResultItem[]
  finishedAt: string
  message: string
}

interface AutoJoinState {
  activeTab: AutoJoinTabKey
  selectedAccountIds: number[]
  taskName: string
  linkInput: string
  concurrency: number
  accountIntervalMin: number
  accountIntervalMax: number
  joinIntervalMin: number
  joinIntervalMax: number
  floodRestMin: number
  floodRestMax: number
  retryLimit: number
  repeatJoinEnabled: boolean
  dispatchMode: 'random' | 'sequential'
  running: boolean
  stopping: boolean
  runtimeReady: boolean
  currentTaskId: string | null
  lastActionMessage: string
  tasks: AutoJoinTaskRecord[]
  logs: AutoJoinLogEntry[]
  taskSnapshots: AutoJoinTaskSnapshot[]
  completionDialogTaskId: string | null
  setActiveTab: (tab: AutoJoinTabKey) => void
  setSelectedAccountIds: (ids: number[]) => void
  setTaskName: (value: string) => void
  setLinkInput: (value: string) => void
  setConcurrency: (value: number) => void
  setAccountIntervalMin: (value: number) => void
  setAccountIntervalMax: (value: number) => void
  setJoinIntervalMin: (value: number) => void
  setJoinIntervalMax: (value: number) => void
  setFloodRestMin: (value: number) => void
  setFloodRestMax: (value: number) => void
  setRetryLimit: (value: number) => void
  setRepeatJoinEnabled: (value: boolean) => void
  setDispatchMode: (value: 'random' | 'sequential') => void
  closeCompletionDialog: () => void
  clearLogs: () => void
  clearLinkInput: () => void
  startTask: () => Promise<void>
  stopTask: () => Promise<void>
  init: () => void
}

let subscribed = false

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeInviteHash(input: string) {
  const matched = input.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
  return matched?.[1]?.trim() || ''
}

function normalizeAutoJoinTarget(input: string) {
  const raw = input.trim()
  if (!raw) return null

  const inviteHash = normalizeInviteHash(raw)
  if (inviteHash) {
    return {
      kind: 'invite' as const,
      normalized: `https://t.me/+${inviteHash}`
    }
  }

  const linkMatched = raw.match(/(?:https?:\/\/)?t\.me\/([^/?#]+)/i)
  const candidate = (linkMatched?.[1] ?? raw).trim()
  if (!candidate) return null
  if (/^(joinchat|addlist)$/i.test(candidate)) return null
  if (!/^@?[A-Za-z0-9_]{3,}$/.test(candidate)) return null
  return {
    kind: 'username' as const,
    normalized: `@${candidate.replace(/^@+/, '').toLowerCase()}`
  }
}

export function parseAutoJoinTargets(input: string): AutoJoinParsedSummary {
  const tokens = input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const items: AutoJoinPayloadItem[] = []
  const duplicates: string[] = []
  const invalids: string[] = []
  const seen = new Set<string>()

  tokens.forEach((token, index) => {
    const parsed = normalizeAutoJoinTarget(token)
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
      id: `join_${index}_${Math.random().toString(36).slice(2, 8)}`,
      raw: token,
      normalized: parsed.normalized,
      kind: parsed.kind
    })
  })

  return { items, duplicates, invalids }
}

function createTaskRecord(input: { id: string; name: string; total: number }): AutoJoinTaskRecord {
  return {
    id: input.id,
    name: input.name,
    status: 'running',
    total: input.total,
    completed: 0,
    successCount: 0,
    alreadyCount: 0,
    requestedCount: 0,
    failedCount: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastMessage: '自动加群任务已启动。'
  }
}

function upsertTask(tasks: AutoJoinTaskRecord[], task: AutoJoinTaskRecord) {
  const next = tasks.filter((item) => item.id !== task.id)
  return [task, ...next].slice(0, 20)
}

function appendLog(logs: AutoJoinLogEntry[], log: AutoJoinLogEntry) {
  return [log, ...logs].slice(0, 400)
}

function upsertTaskSnapshot(snapshots: AutoJoinTaskSnapshot[], snapshot: AutoJoinTaskSnapshot) {
  const next = snapshots.filter((item) => item.taskId !== snapshot.taskId)
  return [snapshot, ...next].slice(0, 10)
}

function removeTargetFromInput(input: string, target: string) {
  const normalizedTarget = target.trim().toLowerCase()
  if (!normalizedTarget) return input
  const tokens = input
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const nextTokens = tokens.filter((token) => {
    const parsed = normalizeAutoJoinTarget(token)
    return parsed?.normalized.toLowerCase() !== normalizedTarget
  })

  return nextTokens.join('\n')
}

function removeTargetsFromInput(input: string, targets: string[]) {
  if (targets.length === 0) return input
  let nextInput = input
  for (const target of targets) {
    nextInput = removeTargetFromInput(nextInput, target)
  }
  return nextInput
}

function isMissingTargetFailureMessage(message: string) {
  const normalized = message.trim()
  if (!normalized) return false
  return normalized.includes('找不到这个群')
    || normalized.includes('@群用户名写错了')
    || normalized.includes('@群用户名不存在')
    || normalized.includes('邀请链接失效了')
}

function collectRemovableTargets(
  items: AutoJoinResultItem[],
  repeatJoinEnabled: boolean,
  selectedAccountIds: number[]
) {
  if (items.length === 0) return [] as string[]

  if (!repeatJoinEnabled) {
    return Array.from(new Set(
      items
        .filter((item) => item.status === 'joined')
        .map((item) => (item.normalized || item.raw || '').trim())
        .filter(Boolean)
    ))
  }

  const requiredAccountIds = Array.from(new Set(selectedAccountIds.filter((item): item is number => typeof item === 'number')))
  if (requiredAccountIds.length === 0) return [] as string[]

  const successMap = new Map<string, Set<number>>()
  const missingTargetFailures = new Set<string>()
  items.forEach((item) => {
    const target = (item.normalized || item.raw || '').trim()
    if (!target) return
    if (item.status === 'failed' && isMissingTargetFailureMessage(item.errorMessage || '')) {
      missingTargetFailures.add(target)
      return
    }
    if ((item.status !== 'joined' && item.status !== 'already') || typeof item.accountId !== 'number') return
    const current = successMap.get(target) ?? new Set<number>()
    current.add(item.accountId)
    successMap.set(target, current)
  })

  return Array.from(new Set([
    ...Array.from(missingTargetFailures),
    ...Array.from(successMap.entries())
      .filter(([, accountIds]) => requiredAccountIds.every((accountId) => accountIds.has(accountId)))
      .map(([target]) => target)
  ]))
}

function formatLogMessage(item: AutoJoinResultItem, fallbackMessage: string) {
  const target = item.normalized || item.raw || '这个群'
  if (item.status === 'joined') return `成功加入${target}`
  if (item.status === 'requested') return `${target}需要审核，已申请等待通过`
  if (item.status === 'already') return `${target}已在群`
  if (item.status === 'failed') return `加入失败（${item.errorMessage || '原因没拿到'}）`
  return fallbackMessage
}

function buildProgressLog(payload: AutoJoinProgress): AutoJoinLogEntry | null {
  const item = payload.item
  if (!item) {
    return {
      id: createId('joinlog'),
      taskId: payload.taskId,
      level: payload.failedCount > 0 ? 'warning' : 'info',
      accountId: null,
      accountLabel: '',
      target: '',
      groupTitle: '',
      status: 'info',
      message: payload.message,
      createdAt: new Date().toISOString()
    }
  }

  const level: AutoJoinLogLevel = item.status === 'failed' ? 'error' : item.status === 'requested' || item.status === 'already' ? 'warning' : 'success'
  return {
    id: createId('joinlog'),
    taskId: payload.taskId,
    level,
    accountId: item.accountId,
    accountLabel: item.accountLabel,
    target: item.normalized || item.raw,
    groupTitle: item.groupTitle,
    status: item.status,
    message: formatLogMessage(item, payload.message),
    createdAt: item.joinedAt || new Date().toISOString()
  }
}

function applyProgress(tasks: AutoJoinTaskRecord[], payload: AutoJoinProgress) {
  const current = tasks.find((item) => item.id === payload.taskId) ?? createTaskRecord({
    id: payload.taskId,
    name: '自动加群任务',
    total: payload.total
  })

  const nextTask: AutoJoinTaskRecord = {
    ...current,
    total: payload.total,
    completed: payload.completed,
    successCount: payload.successCount,
    alreadyCount: payload.alreadyCount,
    requestedCount: payload.requestedCount,
    failedCount: payload.failedCount,
    status: payload.running ? 'running' : current.status === 'stopped' ? 'stopped' : 'completed',
    finishedAt: payload.running ? null : new Date().toISOString(),
    lastMessage: payload.message
  }

  return upsertTask(tasks, nextTask)
}

function applyResult(tasks: AutoJoinTaskRecord[], result: AutoJoinTaskResult) {
  const current = tasks.find((item) => item.id === result.taskId) ?? createTaskRecord({
    id: result.taskId,
    name: '自动加群任务',
    total: result.total
  })

  const nextTask: AutoJoinTaskRecord = {
    ...current,
    total: result.total,
    completed: result.total,
    successCount: result.successCount,
    alreadyCount: result.alreadyCount,
    requestedCount: result.requestedCount,
    failedCount: result.failedCount,
    status: current.status === 'stopped' ? 'stopped' : 'completed',
    finishedAt: new Date().toISOString(),
    lastMessage: result.message
  }

  return upsertTask(tasks, nextTask)
}

export const useAutoJoinStore = create<AutoJoinState>()(
  persist(
    (set, get) => ({
      activeTab: 'tasks',
      selectedAccountIds: [],
      taskName: '',
      linkInput: '',
      concurrency: 10,
      accountIntervalMin: 5,
      accountIntervalMax: 30,
      joinIntervalMin: 60,
      joinIntervalMax: 120,
      floodRestMin: 5,
      floodRestMax: 11,
      retryLimit: 2,
      repeatJoinEnabled: true,
      dispatchMode: 'random',
      running: false,
      stopping: false,
      runtimeReady: Boolean(window.desktopAutoJoin),
      currentTaskId: null,
      lastActionMessage: '',
      tasks: [],
      logs: [],
      taskSnapshots: [],
      completionDialogTaskId: null,
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedAccountIds: (ids) => set({ selectedAccountIds: ids }),
      setTaskName: (value) => set({ taskName: value }),
      setLinkInput: (value) => set({ linkInput: value }),
      setConcurrency: (value) => set({ concurrency: value }),
      setAccountIntervalMin: (value) => set({ accountIntervalMin: value }),
      setAccountIntervalMax: (value) => set({ accountIntervalMax: value }),
      setJoinIntervalMin: (value) => set({ joinIntervalMin: value }),
      setJoinIntervalMax: (value) => set({ joinIntervalMax: value }),
      setFloodRestMin: (value) => set({ floodRestMin: value }),
      setFloodRestMax: (value) => set({ floodRestMax: value }),
      setRetryLimit: (value) => set({ retryLimit: value }),
      setRepeatJoinEnabled: (value) => set({ repeatJoinEnabled: value }),
      setDispatchMode: (value) => set({ dispatchMode: value }),
      closeCompletionDialog: () => set({ completionDialogTaskId: null }),
      clearLogs: () => set({
        logs: [],
        tasks: [],
        taskSnapshots: [],
        completionDialogTaskId: null,
        currentTaskId: null,
        lastActionMessage: '加群日志已清空。'
      }),
      clearLinkInput: () => set({ linkInput: '' }),
      init: () => {
        if (!window.desktopAutoJoin || subscribed) {
          set({ runtimeReady: Boolean(window.desktopAutoJoin) })
          return
        }

        window.desktopAutoJoin.onProgress((payload) => {
          const nextLogs = buildProgressLog(payload)
          set((state) => ({
            runtimeReady: true,
            running: payload.running,
            stopping: false,
            currentTaskId: payload.running ? payload.taskId : state.currentTaskId === payload.taskId ? null : state.currentTaskId,
            tasks: applyProgress(state.tasks, payload),
            logs: nextLogs ? appendLog(state.logs, nextLogs) : state.logs,
            linkInput:
              !state.repeatJoinEnabled && payload.item?.status === 'joined'
                ? removeTargetFromInput(state.linkInput, payload.item.normalized || payload.item.raw)
                : state.repeatJoinEnabled && payload.item?.status === 'failed' && isMissingTargetFailureMessage(payload.item.errorMessage || '')
                  ? removeTargetFromInput(state.linkInput, payload.item.normalized || payload.item.raw)
                  : state.linkInput,
            lastActionMessage: payload.message
          }))
        })

        subscribed = true
        set({ runtimeReady: true })
      },
      startTask: async () => {
        const api = window.desktopAutoJoin
        if (!api) {
          set({ runtimeReady: false, lastActionMessage: '当前运行环境还没接好自动加群能力。' })
          return
        }

        const { items, duplicates, invalids } = parseAutoJoinTargets(get().linkInput)
        if (get().selectedAccountIds.length === 0) {
          set({ lastActionMessage: '先选几个账号，再开始自动加群。' })
          return
        }
        if (items.length === 0) {
          set({ lastActionMessage: '先填群链接或 @群用户名，至少要有一个有效目标。' })
          return
        }

        const taskId = createId('autojoin')
        const taskName = get().taskName.trim() || `自动加群 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
        const initialTotal = get().repeatJoinEnabled ? items.length * get().selectedAccountIds.length : items.length
        set((state) => ({
          activeTab: 'logs',
          running: true,
          stopping: false,
          currentTaskId: taskId,
          completionDialogTaskId: null,
          logs: [],
          taskSnapshots: [],
          tasks: [createTaskRecord({ id: taskId, name: taskName, total: initialTotal })],
          lastActionMessage: duplicates.length > 0 || invalids.length > 0
            ? `已过滤 ${duplicates.length} 条重复、${invalids.length} 条无效目标，准备开始加群。`
            : '自动加群任务已提交，正在启动。'
        }))

        try {
          const result = await api.start({
            taskId,
            accountIds: get().selectedAccountIds,
            items,
            concurrency: get().concurrency,
            accountIntervalMin: Math.min(get().accountIntervalMin, get().accountIntervalMax),
            accountIntervalMax: Math.max(get().accountIntervalMin, get().accountIntervalMax),
            joinIntervalMin: Math.min(get().joinIntervalMin, get().joinIntervalMax),
            joinIntervalMax: Math.max(get().joinIntervalMin, get().joinIntervalMax),
            floodRestMin: Math.min(get().floodRestMin, get().floodRestMax),
            floodRestMax: Math.max(get().floodRestMin, get().floodRestMax),
            retryLimit: get().retryLimit,
            autoRetryOnFloodWait: true,
            repeatJoinEnabled: get().repeatJoinEnabled,
            dispatchMode: get().dispatchMode
          })

          set((state) => ({
            running: false,
            stopping: false,
            currentTaskId: state.currentTaskId === result.taskId ? null : state.currentTaskId,
            tasks: applyResult(state.tasks, result),
            linkInput: removeTargetsFromInput(
              state.linkInput,
              collectRemovableTargets(result.items, state.repeatJoinEnabled, state.selectedAccountIds)
            ),
            taskSnapshots: upsertTaskSnapshot(state.taskSnapshots, {
              taskId: result.taskId,
              name: state.tasks.find((item) => item.id === result.taskId)?.name || taskName,
              total: result.total,
              successCount: result.successCount,
              alreadyCount: result.alreadyCount,
              requestedCount: result.requestedCount,
              failedCount: result.failedCount,
              items: result.items,
              finishedAt: new Date().toISOString(),
              message: result.message
            }),
            completionDialogTaskId: result.taskId,
            lastActionMessage: result.message
          }))
        } catch (error) {
          set((state) => ({
            running: false,
            stopping: false,
            currentTaskId: state.currentTaskId === taskId ? null : state.currentTaskId,
            tasks: upsertTask(state.tasks, {
              ...(state.tasks.find((item) => item.id === taskId) ?? createTaskRecord({ id: taskId, name: taskName, total: items.length })),
              status: 'stopped',
              finishedAt: new Date().toISOString(),
              lastMessage: error instanceof Error ? error.message : '自动加群任务启动失败。'
            }),
            lastActionMessage: error instanceof Error ? error.message : '自动加群任务启动失败。'
          }))
        }
      },
      stopTask: async () => {
        const api = window.desktopAutoJoin
        if (!api) {
          set({ runtimeReady: false, lastActionMessage: '当前运行环境还没接好自动加群能力。' })
          return
        }
        if (!get().running) {
          set({ lastActionMessage: '现在没有正在跑的自动加群任务。' })
          return
        }

        set({ stopping: true, lastActionMessage: '正在停止自动加群任务…' })
        try {
          const result = await api.stop()
          set((state) => ({
            running: false,
            stopping: false,
            currentTaskId: null,
            tasks: state.currentTaskId
              ? upsertTask(state.tasks, {
                  ...(state.tasks.find((item) => item.id === state.currentTaskId) ?? createTaskRecord({ id: state.currentTaskId, name: '自动加群任务', total: 0 })),
                  status: 'stopped',
                  finishedAt: new Date().toISOString(),
                  lastMessage: result.message
                })
              : state.tasks,
            lastActionMessage: result.message
          }))
        } catch (error) {
          set({
            stopping: false,
            lastActionMessage: error instanceof Error ? error.message : '停止自动加群任务失败。'
          })
        }
      }
    }),
    {
      name: 'tg-group-auto-join-store',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        selectedAccountIds: state.selectedAccountIds,
        taskName: state.taskName,
        linkInput: state.linkInput,
        concurrency: state.concurrency,
        accountIntervalMin: state.accountIntervalMin,
        accountIntervalMax: state.accountIntervalMax,
        joinIntervalMin: state.joinIntervalMin,
        joinIntervalMax: state.joinIntervalMax,
        floodRestMin: state.floodRestMin,
        floodRestMax: state.floodRestMax,
        retryLimit: state.retryLimit,
        repeatJoinEnabled: state.repeatJoinEnabled,
        dispatchMode: state.dispatchMode
      })
    }
  )
)
