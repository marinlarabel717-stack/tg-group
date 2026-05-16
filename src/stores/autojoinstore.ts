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
  speakableCount: number
  mutedCount: number
  channelSkippedCount: number
  sendSuccessCount: number
  sendSkippedCount: number
  sendFailedCount: number
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
  speakableCount: number
  mutedCount: number
  channelSkippedCount: number
  sendSuccessCount: number
  sendSkippedCount: number
  sendFailedCount: number
  items: AutoJoinResultItem[]
  finishedAt: string
  message: string
  stopped?: boolean
}

interface AutoJoinState {
  activeTab: AutoJoinTabKey
  selectedAccountIds: number[]
  taskName: string
  mode: 'join-only' | 'join-and-send' | 'join-then-send'
  speedPreset: 'safe' | 'normal' | 'fast'
  skipChannelsEnabled: boolean
  leaveMutedGroupsEnabled: boolean
  linkInput: string
  messageText: string
  imageData: string
  buttonText: string
  buttonUrl: string
  concurrency: number
  accountIntervalMin: number
  accountIntervalMax: number
  joinIntervalMin: number
  joinIntervalMax: number
  sendIntervalMin: number
  sendIntervalMax: number
  floodRestMin: number
  floodRestMax: number
  retryLimit: number
  repeatJoinEnabled: boolean
  dispatchMode: 'random' | 'sequential'
  safeModeEnabled: boolean
  maxJoinsPerAccount: number
  running: boolean
  stopping: boolean
  runningAccountIds: number[]
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
  setMode: (value: 'join-only' | 'join-and-send' | 'join-then-send') => void
  setSpeedPreset: (value: 'safe' | 'normal' | 'fast') => void
  setSkipChannelsEnabled: (value: boolean) => void
  setLeaveMutedGroupsEnabled: (value: boolean) => void
  setLinkInput: (value: string) => void
  setMessageText: (value: string) => void
  setImageData: (value: string) => void
  setButtonText: (value: string) => void
  setButtonUrl: (value: string) => void
  setConcurrency: (value: number) => void
  setAccountIntervalMin: (value: number) => void
  setAccountIntervalMax: (value: number) => void
  setJoinIntervalMin: (value: number) => void
  setJoinIntervalMax: (value: number) => void
  setSendIntervalMin: (value: number) => void
  setSendIntervalMax: (value: number) => void
  setFloodRestMin: (value: number) => void
  setFloodRestMax: (value: number) => void
  setRetryLimit: (value: number) => void
  setRepeatJoinEnabled: (value: boolean) => void
  setDispatchMode: (value: 'random' | 'sequential') => void
  setSafeModeEnabled: (value: boolean) => void
  setMaxJoinsPerAccount: (value: number) => void
  closeCompletionDialog: () => void
  clearLogs: () => void
  clearLinkInput: () => void
  startTask: () => Promise<void>
  stopTask: () => Promise<void>
  init: () => void
}

let subscribed = false

function readSpeedPresetConfig(preset: 'safe' | 'normal' | 'fast') {
  if (preset === 'fast') {
    return {
      concurrency: 2,
      accountIntervalMin: 10,
      accountIntervalMax: 25,
      joinIntervalMin: 45,
      joinIntervalMax: 90,
      sendIntervalMin: 12,
      sendIntervalMax: 25,
      floodRestMin: 12,
      floodRestMax: 25,
      retryLimit: 1,
      dispatchMode: 'random' as const,
      repeatJoinEnabled: false,
      maxJoinsPerAccount: 5,
      safeModeEnabled: false
    }
  }

  if (preset === 'normal') {
    return {
      concurrency: 1,
      accountIntervalMin: 15,
      accountIntervalMax: 35,
      joinIntervalMin: 60,
      joinIntervalMax: 120,
      sendIntervalMin: 18,
      sendIntervalMax: 35,
      floodRestMin: 15,
      floodRestMax: 35,
      retryLimit: 1,
      dispatchMode: 'sequential' as const,
      repeatJoinEnabled: false,
      maxJoinsPerAccount: 4,
      safeModeEnabled: true
    }
  }

  return {
    concurrency: 1,
    accountIntervalMin: 20,
    accountIntervalMax: 60,
    joinIntervalMin: 90,
    joinIntervalMax: 180,
    sendIntervalMin: 25,
    sendIntervalMax: 60,
    floodRestMin: 20,
    floodRestMax: 45,
    retryLimit: 1,
    dispatchMode: 'sequential' as const,
    repeatJoinEnabled: false,
    maxJoinsPerAccount: 3,
    safeModeEnabled: true
  }
}

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
      speakableCount: 0,
      mutedCount: 0,
      channelSkippedCount: 0,
      sendSuccessCount: 0,
    sendSkippedCount: 0,
    sendFailedCount: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastMessage: '极速群发任务已启动。'
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

function collectRemovableTargets(
  items: AutoJoinResultItem[]
) {
  if (items.length === 0) return [] as string[]

  return Array.from(new Set(
    items
      .filter((item) => item.status === 'joined' || item.status === 'already' || item.status === 'requested')
      .map((item) => (item.normalized || item.raw || '').trim())
      .filter(Boolean)
  ))
}

function formatLogMessage(item: AutoJoinResultItem, fallbackMessage: string) {
  const target = item.normalized || item.raw || '这个群'
  if (item.joinCategory === 'channel-skipped') return `${target}是频道，已经自动跳过`
  if (item.joinCategory === 'muted') return `${target}已归为禁言群`
  if (item.joinCategory === 'speakable') return `${target}已归为可发言`
  if (item.joinCategory === 'requested') return `${target}需要管理员通过，先归到需验证`
  if (item.sendStatus === 'sent') return `${target}已发送内容`
  if (item.sendStatus === 'skipped') return `${target}已跳过发送（${item.sendErrorMessage || '当前模式不需要发送'}）`
  if (item.sendStatus === 'failed') return `${target}发送失败（${item.sendErrorMessage || '原因没拿到'}）`
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

  const level: AutoJoinLogLevel = item.sendStatus === 'failed'
    ? 'error'
    : item.sendStatus === 'skipped'
      ? 'warning'
      : item.sendStatus === 'sent'
        ? 'success'
        : item.status === 'failed'
          ? 'error'
          : item.status === 'requested' || item.status === 'already'
            ? 'warning'
            : 'success'
  return {
    id: createId('joinlog'),
    taskId: payload.taskId,
    level,
    accountId: item.accountId,
    accountLabel: item.accountLabel,
    target: item.normalized || item.raw,
    groupTitle: item.groupTitle,
    status: item.sendStatus === 'sent' ? 'joined' : item.sendStatus === 'failed' ? 'failed' : item.status,
    message: formatLogMessage(item, payload.message),
    createdAt: item.sentAt || item.joinedAt || new Date().toISOString()
  }
}

function applyProgress(tasks: AutoJoinTaskRecord[], payload: AutoJoinProgress) {
  const current = tasks.find((item) => item.id === payload.taskId) ?? createTaskRecord({
    id: payload.taskId,
    name: '极速群发任务',
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
    speakableCount: payload.speakableCount,
    mutedCount: payload.mutedCount,
    channelSkippedCount: payload.channelSkippedCount,
    sendSuccessCount: payload.sendSuccessCount,
    sendSkippedCount: payload.sendSkippedCount,
    sendFailedCount: payload.sendFailedCount,
    status: payload.running ? 'running' : current.status === 'stopped' ? 'stopped' : 'completed',
    finishedAt: payload.running ? null : new Date().toISOString(),
    lastMessage: payload.message
  }

  return upsertTask(tasks, nextTask)
}

function applyResult(tasks: AutoJoinTaskRecord[], result: AutoJoinTaskResult) {
  const current = tasks.find((item) => item.id === result.taskId) ?? createTaskRecord({
    id: result.taskId,
    name: '极速群发任务',
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
    speakableCount: result.speakableCount,
    mutedCount: result.mutedCount,
    channelSkippedCount: result.channelSkippedCount,
    sendSuccessCount: result.sendSuccessCount,
    sendSkippedCount: result.sendSkippedCount,
    sendFailedCount: result.sendFailedCount,
    status: result.stopped || current.status === 'stopped' ? 'stopped' : 'completed',
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
      mode: 'join-then-send',
      speedPreset: 'safe',
      skipChannelsEnabled: true,
      leaveMutedGroupsEnabled: false,
      linkInput: '',
      messageText: '',
      imageData: '',
      buttonText: '',
      buttonUrl: '',
      concurrency: 1,
      accountIntervalMin: 20,
      accountIntervalMax: 60,
      joinIntervalMin: 90,
      joinIntervalMax: 180,
      sendIntervalMin: 25,
      sendIntervalMax: 60,
      floodRestMin: 20,
      floodRestMax: 45,
      retryLimit: 1,
      repeatJoinEnabled: false,
      dispatchMode: 'sequential',
      safeModeEnabled: true,
      maxJoinsPerAccount: 3,
      running: false,
      stopping: false,
      runningAccountIds: [],
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
      setMode: (value) => set({ mode: value }),
      setSpeedPreset: (value) => {
        const preset = readSpeedPresetConfig(value)
        set({
          speedPreset: value,
          concurrency: preset.concurrency,
          accountIntervalMin: preset.accountIntervalMin,
          accountIntervalMax: preset.accountIntervalMax,
          joinIntervalMin: preset.joinIntervalMin,
          joinIntervalMax: preset.joinIntervalMax,
          sendIntervalMin: preset.sendIntervalMin,
          sendIntervalMax: preset.sendIntervalMax,
          floodRestMin: preset.floodRestMin,
          floodRestMax: preset.floodRestMax,
          retryLimit: preset.retryLimit,
          dispatchMode: preset.dispatchMode,
          repeatJoinEnabled: preset.repeatJoinEnabled,
          maxJoinsPerAccount: preset.maxJoinsPerAccount,
          safeModeEnabled: preset.safeModeEnabled
        })
      },
      setSkipChannelsEnabled: (value) => set({ skipChannelsEnabled: value }),
      setLeaveMutedGroupsEnabled: (value) => set({ leaveMutedGroupsEnabled: value }),
      setLinkInput: (value) => set({ linkInput: value }),
      setMessageText: (value) => set({ messageText: value }),
      setImageData: (value) => set({ imageData: value }),
      setButtonText: (value) => set({ buttonText: value }),
      setButtonUrl: (value) => set({ buttonUrl: value }),
      setConcurrency: (value) => set({ concurrency: value }),
      setAccountIntervalMin: (value) => set({ accountIntervalMin: value }),
      setAccountIntervalMax: (value) => set({ accountIntervalMax: value }),
      setJoinIntervalMin: (value) => set({ joinIntervalMin: value }),
      setJoinIntervalMax: (value) => set({ joinIntervalMax: value }),
      setSendIntervalMin: (value) => set({ sendIntervalMin: value }),
      setSendIntervalMax: (value) => set({ sendIntervalMax: value }),
      setFloodRestMin: (value) => set({ floodRestMin: value }),
      setFloodRestMax: (value) => set({ floodRestMax: value }),
      setRetryLimit: (value) => set({ retryLimit: value }),
      setRepeatJoinEnabled: (value) => set({ repeatJoinEnabled: value }),
      setDispatchMode: (value) => set({ dispatchMode: value }),
      setSafeModeEnabled: (value) => set({ safeModeEnabled: value }),
      setMaxJoinsPerAccount: (value) => set({ maxJoinsPerAccount: Math.max(1, value) }),
      closeCompletionDialog: () => set({ completionDialogTaskId: null }),
      clearLogs: () => set({
        logs: [],
        tasks: [],
        taskSnapshots: [],
        completionDialogTaskId: null,
        currentTaskId: null,
        lastActionMessage: '极速群发日志已清空。'
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
            lastActionMessage: payload.message
          }))
        })

        subscribed = true
        set({ runtimeReady: true })
      },
      startTask: async () => {
        const api = window.desktopAutoJoin
        if (!api) {
          set({ runtimeReady: false, lastActionMessage: '当前运行环境还没接好极速群发能力。' })
          return
        }

        const { items, duplicates, invalids } = parseAutoJoinTargets(get().linkInput)
        if (get().selectedAccountIds.length === 0) {
          set({ lastActionMessage: '先选几个账号，再开始极速群发。' })
          return
        }
        if (items.length === 0) {
          set({ lastActionMessage: '先填群链接或 @群用户名，至少要有一个有效目标。' })
          return
        }

        const mode = get().mode
        const needsMessage = mode !== 'join-only'
        if (needsMessage && !get().messageText.trim() && !get().imageData.trim()) {
          set({ lastActionMessage: '当前模式需要发送内容，至少填一段文案或上传一张图片。' })
          return
        }

        const taskId = createId('autojoin')
        const taskName = get().taskName.trim() || `极速群发 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
        const safeModeEnabled = get().safeModeEnabled
        const selectedAccountCount = get().selectedAccountIds.length
        const perAccountTargetLimit = Math.max(1, get().maxJoinsPerAccount)
        const initialTotal = get().repeatJoinEnabled
          ? items.length * selectedAccountCount
          : items.length
        set((state) => ({
          activeTab: 'logs',
          running: true,
          stopping: false,
          runningAccountIds: state.selectedAccountIds,
          currentTaskId: taskId,
          completionDialogTaskId: null,
          logs: [],
          taskSnapshots: [],
          tasks: [createTaskRecord({ id: taskId, name: taskName, total: initialTotal })],
          lastActionMessage: duplicates.length > 0 || invalids.length > 0
            ? `已过滤 ${duplicates.length} 条重复、${invalids.length} 条无效目标，准备开始执行。${safeModeEnabled ? ` 当前防冻结保护已开启：每号最多 ${perAccountTargetLimit} 个。` : ''}`
            : `极速群发任务已提交，正在启动。${safeModeEnabled ? ` 当前防冻结保护已开启：每号最多 ${perAccountTargetLimit} 个。` : ''}`
        }))

        try {
          const result = await api.start({
            taskId,
            accountIds: get().selectedAccountIds,
            items,
            mode,
            speedPreset: get().speedPreset,
            skipChannelsEnabled: get().skipChannelsEnabled,
            leaveMutedGroupsEnabled: get().leaveMutedGroupsEnabled,
            concurrency: get().concurrency,
            accountIntervalMin: Math.min(get().accountIntervalMin, get().accountIntervalMax),
            accountIntervalMax: Math.max(get().accountIntervalMin, get().accountIntervalMax),
            joinIntervalMin: Math.min(get().joinIntervalMin, get().joinIntervalMax),
            joinIntervalMax: Math.max(get().joinIntervalMin, get().joinIntervalMax),
            sendIntervalMin: Math.min(get().sendIntervalMin, get().sendIntervalMax),
            sendIntervalMax: Math.max(get().sendIntervalMin, get().sendIntervalMax),
            floodRestMin: Math.min(get().floodRestMin, get().floodRestMax),
            floodRestMax: Math.max(get().floodRestMin, get().floodRestMax),
            retryLimit: get().retryLimit,
            autoRetryOnFloodWait: true,
            repeatJoinEnabled: get().repeatJoinEnabled,
            dispatchMode: get().dispatchMode,
            safeModeEnabled,
            maxJoinsPerAccount: perAccountTargetLimit,
            messageText: get().messageText,
            imageData: get().imageData,
            buttonText: get().buttonText,
            buttonUrl: get().buttonUrl
          })

          set((state) => ({
            running: false,
            stopping: false,
            runningAccountIds: [],
            currentTaskId: state.currentTaskId === result.taskId ? null : state.currentTaskId,
            tasks: applyResult(state.tasks, result),
            linkInput: state.repeatJoinEnabled
              ? state.linkInput
              : removeTargetsFromInput(
                  state.linkInput,
                  collectRemovableTargets(result.items)
                ),
            taskSnapshots: upsertTaskSnapshot(state.taskSnapshots, {
              taskId: result.taskId,
              name: state.tasks.find((item) => item.id === result.taskId)?.name || taskName,
              total: result.total,
              successCount: result.successCount,
              alreadyCount: result.alreadyCount,
              requestedCount: result.requestedCount,
              failedCount: result.failedCount,
              speakableCount: result.speakableCount,
              mutedCount: result.mutedCount,
              channelSkippedCount: result.channelSkippedCount,
              sendSuccessCount: result.sendSuccessCount,
              sendSkippedCount: result.sendSkippedCount,
              sendFailedCount: result.sendFailedCount,
              items: result.items,
              finishedAt: new Date().toISOString(),
              message: result.message,
              stopped: Boolean(result.stopped)
            }),
            completionDialogTaskId: result.taskId,
            lastActionMessage: result.message
          }))
        } catch (error) {
          set((state) => ({
            running: false,
            stopping: false,
            runningAccountIds: [],
            currentTaskId: state.currentTaskId === taskId ? null : state.currentTaskId,
            tasks: upsertTask(state.tasks, {
              ...(state.tasks.find((item) => item.id === taskId) ?? createTaskRecord({ id: taskId, name: taskName, total: items.length })),
              status: 'stopped',
              finishedAt: new Date().toISOString(),
              lastMessage: error instanceof Error ? error.message : '极速群发任务启动失败。'
            }),
            lastActionMessage: error instanceof Error ? error.message : '极速群发任务启动失败。'
          }))
        }
      },
      stopTask: async () => {
        const api = window.desktopAutoJoin
        if (!api) {
          set({ runtimeReady: false, lastActionMessage: '当前运行环境还没接好极速群发能力。' })
          return
        }
        if (!get().running) {
          set({ lastActionMessage: '现在没有正在跑的极速群发任务。' })
          return
        }

        set({ stopping: true, lastActionMessage: '正在停止极速群发任务…' })
        try {
          const result = await api.stop()
          set((state) => ({
            stopping: true,
            tasks: state.currentTaskId
              ? upsertTask(state.tasks, {
                  ...(state.tasks.find((item) => item.id === state.currentTaskId) ?? createTaskRecord({ id: state.currentTaskId, name: '极速群发任务', total: 0 })),
                  status: 'stopped',
                  total: state.tasks.find((item) => item.id === state.currentTaskId)?.completed ?? 0,
                  finishedAt: new Date().toISOString(),
                  lastMessage: result.message
                })
              : state.tasks,
            lastActionMessage: '极速群发任务已停止。'
          }))
        } catch (error) {
          set({
            stopping: false,
            lastActionMessage: error instanceof Error ? error.message : '停止极速群发任务失败。'
          })
        }
      }
    }),
    {
      name: 'tg-group-auto-join-store',
      version: 5,
      storage: createJSONStorage(() => window.localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<AutoJoinState> | undefined
        return {
          ...state,
          selectedAccountIds: [],
          mode: state?.mode ?? 'join-then-send',
          speedPreset: state?.speedPreset ?? 'safe',
          skipChannelsEnabled: state?.skipChannelsEnabled ?? true,
          leaveMutedGroupsEnabled: state?.leaveMutedGroupsEnabled ?? false,
          messageText: state?.messageText || '',
          imageData: state?.imageData || '',
          buttonText: state?.buttonText || '',
          buttonUrl: state?.buttonUrl || '',
          safeModeEnabled: state?.safeModeEnabled ?? true,
          maxJoinsPerAccount: Math.max(1, state?.maxJoinsPerAccount ?? 3),
          repeatJoinEnabled: state?.repeatJoinEnabled ?? false,
          dispatchMode: state?.dispatchMode ?? 'sequential',
          retryLimit: state?.retryLimit ?? 1,
          sendIntervalMin: state?.sendIntervalMin ?? 25,
          sendIntervalMax: state?.sendIntervalMax ?? 60
        }
      },
      partialize: (state) => ({
        activeTab: state.activeTab,
        taskName: state.taskName,
        mode: state.mode,
        speedPreset: state.speedPreset,
        skipChannelsEnabled: state.skipChannelsEnabled,
        leaveMutedGroupsEnabled: state.leaveMutedGroupsEnabled,
        linkInput: state.linkInput,
        messageText: state.messageText,
        imageData: state.imageData,
        buttonText: state.buttonText,
        buttonUrl: state.buttonUrl,
        concurrency: state.concurrency,
        accountIntervalMin: state.accountIntervalMin,
        accountIntervalMax: state.accountIntervalMax,
        joinIntervalMin: state.joinIntervalMin,
        joinIntervalMax: state.joinIntervalMax,
        sendIntervalMin: state.sendIntervalMin,
        sendIntervalMax: state.sendIntervalMax,
        floodRestMin: state.floodRestMin,
        floodRestMax: state.floodRestMax,
        retryLimit: state.retryLimit,
        repeatJoinEnabled: state.repeatJoinEnabled,
        dispatchMode: state.dispatchMode,
        safeModeEnabled: state.safeModeEnabled,
        maxJoinsPerAccount: state.maxJoinsPerAccount
      })
    }
  )
)
