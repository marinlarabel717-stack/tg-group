import { create } from 'zustand'
import type { BatchCreateMode, BatchCreateProgress, BatchCreateResultItem, BatchCreateTaskResult } from '../types'

export type BatchCreateTabKey = 'tasks' | 'logs'
export type BatchCreateLogLevel = 'info' | 'success' | 'error'
export type BatchCreateTaskStatus = 'running' | 'completed' | 'stopped'

export interface BatchCreateTaskRecord {
  id: string
  status: BatchCreateTaskStatus
  total: number
  completed: number
  successCount: number
  failedCount: number
  groupCount: number
  channelCount: number
  startedAt: string
  finishedAt: string | null
  lastMessage: string
}

export interface BatchCreateTaskSnapshot {
  taskId: string
  total: number
  completed: number
  successCount: number
  failedCount: number
  groupCount: number
  channelCount: number
  items: BatchCreateResultItem[]
  message: string
  finishedAt: string
  stopped?: boolean
}

export interface BatchCreateLogEntry {
  id: string
  taskId: string | null
  level: BatchCreateLogLevel
  message: string
  createdAt: string
  accountLabel: string
  targetLabel: string
}

interface BatchCreateState {
  activeTab: BatchCreateTabKey
  selectedAccountIds: number[]
  createMode: BatchCreateMode
  countPerAccount: number
  createIntervalMin: number
  createIntervalMax: number
  autoWaitOnFlood: boolean
  titleTemplate: string
  aboutTemplate: string
  usernameTemplate: string
  randomTitleEnabled: boolean
  randomAboutEnabled: boolean
  randomUsernameEnabled: boolean
  randomLength: number
  running: boolean
  stopping: boolean
  runningAccountIds: number[]
  currentTaskId: string | null
  lastActionMessage: string
  errorMessage: string
  tasks: BatchCreateTaskRecord[]
  logs: BatchCreateLogEntry[]
  taskSnapshots: BatchCreateTaskSnapshot[]
  completionDialogTaskId: string | null
  setActiveTab: (value: BatchCreateTabKey) => void
  setSelectedAccountIds: (value: number[]) => void
  setCreateMode: (value: BatchCreateMode) => void
  setCountPerAccount: (value: number) => void
  setCreateIntervalMin: (value: number) => void
  setCreateIntervalMax: (value: number) => void
  setAutoWaitOnFlood: (value: boolean) => void
  setTitleTemplate: (value: string) => void
  setAboutTemplate: (value: string) => void
  setUsernameTemplate: (value: string) => void
  setRandomTitleEnabled: (value: boolean) => void
  setRandomAboutEnabled: (value: boolean) => void
  setRandomUsernameEnabled: (value: boolean) => void
  setRandomLength: (value: number) => void
  clearLogs: () => void
  closeCompletionDialog: () => void
  init: () => void
  startTask: () => Promise<void>
  stopTask: () => Promise<void>
}

function getDesktopBatchCreateApi() {
  return window.desktopBatchCreate
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

let subscribed = false

function createTaskRecord(taskId: string, total: number): BatchCreateTaskRecord {
  return {
    id: taskId,
    status: 'running',
    total,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    groupCount: 0,
    channelCount: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastMessage: '批量创建任务已启动。'
  }
}

function upsertTask(tasks: BatchCreateTaskRecord[], task: BatchCreateTaskRecord) {
  const next = tasks.filter((item) => item.id !== task.id)
  return [task, ...next].slice(0, 20)
}

function createLogEntry(progress: BatchCreateProgress): BatchCreateLogEntry {
  const item = progress.item
  return {
    id: createId('batch-create-log'),
    taskId: progress.taskId,
    level: item?.status === 'success' ? 'success' : item?.status === 'failed' ? 'error' : 'info',
    message: item?.message || progress.message,
    createdAt: new Date().toISOString(),
    accountLabel: item?.accountLabel || '',
    targetLabel: item?.publicLink || item?.title || ''
  }
}

export const useBatchCreateStore = create<BatchCreateState>((set, get) => ({
  activeTab: 'tasks',
  selectedAccountIds: [],
  createMode: 'group',
  countPerAccount: 1,
  createIntervalMin: 3,
  createIntervalMax: 8,
  autoWaitOnFlood: true,
  titleTemplate: '',
  aboutTemplate: '',
  usernameTemplate: '',
  randomTitleEnabled: false,
  randomAboutEnabled: false,
  randomUsernameEnabled: true,
  randomLength: 8,
  running: false,
  stopping: false,
  runningAccountIds: [],
  currentTaskId: null,
  lastActionMessage: '',
  errorMessage: '',
  tasks: [],
  logs: [],
  taskSnapshots: [],
  completionDialogTaskId: null,
  setActiveTab: (value) => set({ activeTab: value }),
  setSelectedAccountIds: (value) => set({ selectedAccountIds: value }),
  setCreateMode: (value) => set({ createMode: value }),
  setCountPerAccount: (value) => set({ countPerAccount: Math.max(1, Math.min(50, value)) }),
  setCreateIntervalMin: (value) => set({ createIntervalMin: Math.max(0, Math.min(600, value)) }),
  setCreateIntervalMax: (value) => set({ createIntervalMax: Math.max(0, Math.min(600, value)) }),
  setAutoWaitOnFlood: (value) => set({ autoWaitOnFlood: value }),
  setTitleTemplate: (value) => set({ titleTemplate: value }),
  setAboutTemplate: (value) => set({ aboutTemplate: value }),
  setUsernameTemplate: (value) => set({ usernameTemplate: value }),
  setRandomTitleEnabled: (value) => set({ randomTitleEnabled: value }),
  setRandomAboutEnabled: (value) => set({ randomAboutEnabled: value }),
  setRandomUsernameEnabled: (value) => set({ randomUsernameEnabled: value }),
  setRandomLength: (value) => set({ randomLength: Math.max(4, Math.min(24, value)) }),
  clearLogs: () => set({ logs: [] }),
  closeCompletionDialog: () => set({ completionDialogTaskId: null }),
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = getDesktopBatchCreateApi()
    if (!api) {
      set({ errorMessage: '当前环境不支持批量创建模块。' })
      return
    }
    api.onProgress((progress) => {
      set((state) => {
        const currentTask = state.tasks.find((item) => item.id === progress.taskId) ?? createTaskRecord(progress.taskId, progress.total)
        const nextTask: BatchCreateTaskRecord = {
          ...currentTask,
          total: progress.total,
          completed: progress.completed,
          successCount: progress.successCount,
          failedCount: progress.failedCount,
          groupCount: progress.groupCount,
          channelCount: progress.channelCount,
          lastMessage: progress.message,
          status: progress.running ? 'running' : state.stopping ? 'stopped' : 'completed',
          finishedAt: progress.running ? currentTask.finishedAt : new Date().toISOString()
        }
        const nextLogs = progress.item ? [createLogEntry(progress), ...state.logs].slice(0, 300) : state.logs
        return {
          tasks: upsertTask(state.tasks, nextTask),
          logs: nextLogs,
          lastActionMessage: progress.message,
          running: progress.running,
          stopping: progress.running ? state.stopping : false
        }
      })
    })
  },
  startTask: async () => {
    const api = getDesktopBatchCreateApi()
    if (!api) {
      set({ errorMessage: '当前环境不支持批量创建模块。' })
      return
    }

    const selectedAccountIds = Array.from(new Set(get().selectedAccountIds.filter((item) => Number.isFinite(item))))
    if (selectedAccountIds.length === 0) {
      set({ errorMessage: '先选账号，再开始批量创建。' })
      return
    }

    const taskId = createId('batch-create-task')
    const total = selectedAccountIds.length * get().countPerAccount * (get().createMode === 'both' ? 2 : 1)
    set((state) => ({
      errorMessage: '',
      running: true,
      stopping: false,
      runningAccountIds: selectedAccountIds,
      currentTaskId: taskId,
      activeTab: 'logs',
      lastActionMessage: '批量创建任务已启动。',
      tasks: upsertTask(state.tasks, createTaskRecord(taskId, total))
    }))

    try {
      const result = await api.start({
        taskId,
        accountIds: selectedAccountIds,
        createMode: get().createMode,
        countPerAccount: get().countPerAccount,
        createIntervalMin: get().createIntervalMin,
        createIntervalMax: get().createIntervalMax,
        autoWaitOnFlood: get().autoWaitOnFlood,
        titleTemplate: get().titleTemplate,
        aboutTemplate: get().aboutTemplate,
        usernameTemplate: get().usernameTemplate,
        randomTitleEnabled: get().randomTitleEnabled,
        randomAboutEnabled: get().randomAboutEnabled,
        randomUsernameEnabled: get().randomUsernameEnabled,
        randomLength: get().randomLength
      })
      set((state) => {
        const finishedTask: BatchCreateTaskRecord = {
          ...(state.tasks.find((item) => item.id === taskId) ?? createTaskRecord(taskId, result.total)),
          status: result.stopped ? 'stopped' : 'completed',
          total: result.total,
          completed: result.completed,
          successCount: result.successCount,
          failedCount: result.failedCount,
          groupCount: result.groupCount,
          channelCount: result.channelCount,
          lastMessage: result.message,
          finishedAt: new Date().toISOString()
        }
        const snapshot: BatchCreateTaskSnapshot = {
          taskId,
          total: result.total,
          completed: result.completed,
          successCount: result.successCount,
          failedCount: result.failedCount,
          groupCount: result.groupCount,
          channelCount: result.channelCount,
          items: result.items,
          message: result.message,
          finishedAt: new Date().toISOString(),
          stopped: result.stopped
        }
        return {
          running: false,
          stopping: false,
          runningAccountIds: [],
          currentTaskId: null,
          lastActionMessage: result.message,
          tasks: upsertTask(state.tasks, finishedTask),
          taskSnapshots: [snapshot, ...state.taskSnapshots.filter((item) => item.taskId !== taskId)].slice(0, 20),
          completionDialogTaskId: taskId
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set((state) => ({
        running: false,
        stopping: false,
        runningAccountIds: [],
        currentTaskId: null,
        errorMessage: message,
        lastActionMessage: message,
        tasks: state.currentTaskId
          ? upsertTask(state.tasks, {
              ...(state.tasks.find((item) => item.id === state.currentTaskId) ?? createTaskRecord(taskId, total)),
              status: 'stopped',
              finishedAt: new Date().toISOString(),
              lastMessage: message
            })
          : state.tasks
      }))
    }
  },
  stopTask: async () => {
    const api = getDesktopBatchCreateApi()
    if (!api || !get().running) return
    set({ stopping: true })
    try {
      const result = await api.stop()
      set({ lastActionMessage: result.message, stopping: false, running: false, runningAccountIds: [], currentTaskId: null })
    } catch (error) {
      set({ stopping: false, errorMessage: error instanceof Error ? error.message : String(error) })
    }
  }
}))
