import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BroadcastPushSchedulePayload } from '../types'

export type BroadcastTabKey = 'tasks' | 'creatives' | 'targets' | 'calendar'
export type BroadcastTaskStatus = 'draft' | 'active' | 'paused'
export type BroadcastPreviewStatus = 'queued' | 'scheduled' | 'failed'

export interface BroadcastCreative {
  id: string
  title: string
  text: string
  imageUrl: string
  dailyQuota: number
  weight: number
  enabled: boolean
  note: string
}

export interface BroadcastGroupTarget {
  id: string
  title: string
  username: string
  memberCount: number
  enabled: boolean
  accountIds: number[]
}

export interface BroadcastTask {
  id: string
  name: string
  enabled: boolean
  status: BroadcastTaskStatus
  note: string
  accountIds: number[]
  groupIds: string[]
  creativeIds: string[]
  startTime: string
  endTime: string
  intervalMinutes: number
  jitterMinutes: number
  dailyLimitPerGroup: number
  lastSyncedAt: string | null
}

export interface BroadcastPreviewItem {
  id: string
  taskId: string
  scheduledAt: string
  accountId: number | null
  groupId: string
  creativeId: string | null
  status: BroadcastPreviewStatus
  errorMessage: string
  remoteMessageId?: number | null
  syncedAt?: string | null
}

interface BroadcastState {
  activeTab: BroadcastTabKey
  tasks: BroadcastTask[]
  creatives: BroadcastCreative[]
  groups: BroadcastGroupTarget[]
  selectedTaskId: string | null
  selectedCreativeId: string | null
  previewItems: BroadcastPreviewItem[]
  lastActionMessage: string
  syncing: boolean
  errorMessage: string
  setActiveTab: (tab: BroadcastTabKey) => void
  selectTask: (taskId: string) => void
  selectCreative: (creativeId: string) => void
  createTask: () => void
  duplicateTask: (taskId: string) => void
  updateTask: (taskId: string, patch: Partial<BroadcastTask>) => void
  toggleTaskAccount: (taskId: string, accountId: number) => void
  toggleTaskGroup: (taskId: string, groupId: string) => void
  toggleTaskCreative: (taskId: string, creativeId: string) => void
  createCreative: () => void
  updateCreative: (creativeId: string, patch: Partial<BroadcastCreative>) => void
  createGroup: (payload: { title: string; username: string; memberCount: number }) => void
  updateGroup: (groupId: string, patch: Partial<BroadcastGroupTarget>) => void
  toggleGroupAccount: (groupId: string, accountId: number) => void
  generatePreview: (accounts: Array<{ id: number; status?: string }>) => void
  clearPreview: () => void
  pushScheduleToTelegram: () => Promise<void>
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function createPlaceholderImage(text: string, from = '#1d4ed8', to = '#7c3aed') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="none"><defs><linearGradient id="g" x1="0" y1="0" x2="640" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="640" height="360" rx="28" fill="url(#g)"/><text x="48" y="164" fill="white" font-family="Segoe UI, Arial" font-size="40" font-weight="700">${text}</text><text x="48" y="214" fill="rgba(255,255,255,0.78)" font-family="Segoe UI, Arial" font-size="22">TG Group Scheduled Broadcast</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function cloneTask(task: BroadcastTask): BroadcastTask {
  return {
    ...task,
    id: createId('task'),
    name: `${task.name} - 副本`,
    status: 'draft',
    lastSyncedAt: null
  }
}

function toMinutes(value: string) {
  const [hourRaw = '0', minuteRaw = '0'] = value.split(':')
  const hour = Math.max(0, Math.min(23, Number(hourRaw) || 0))
  const minute = Math.max(0, Math.min(59, Number(minuteRaw) || 0))
  return hour * 60 + minute
}

function setMinutes(base: Date, totalMinutes: number) {
  const next = new Date(base)
  const dayOffset = Math.floor(totalMinutes / (24 * 60))
  const minuteOfDay = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  next.setDate(next.getDate() + dayOffset)
  next.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0)
  return next
}

function rotateCreatives(task: BroadcastTask, creatives: BroadcastCreative[]) {
  const selected = creatives.filter((item) => task.creativeIds.includes(item.id) && item.enabled)
  const bucket: string[] = []
  for (const item of selected) {
    const quota = Math.max(1, Number(item.dailyQuota) || 1)
    const weight = Math.max(1, Number(item.weight) || 1)
    for (let index = 0; index < quota * weight; index += 1) {
      bucket.push(item.id)
    }
  }
  return bucket.length > 0 ? bucket : selected.map((item) => item.id)
}

function normalizePreviewItems(items: BroadcastPreviewItem[]) {
  return items.map((item) => {
    if (item.status === 'scheduled' && !item.remoteMessageId) {
      return {
        ...item,
        status: 'queued' as const,
        errorMessage: ''
      }
    }
    return {
      ...item,
      remoteMessageId: item.remoteMessageId ?? null,
      syncedAt: item.syncedAt ?? null
    }
  })
}

function getCompatibleAccounts(task: BroadcastTask, group: BroadcastGroupTarget, accounts: Array<{ id: number; status?: string }>) {
  const joined = task.accountIds.filter((accountId) => group.accountIds.includes(accountId))
  return joined.filter((accountId) => {
    const account = accounts.find((item) => item.id === accountId)
    if (!account) return false
    if (!account.status) return true
    return ['alive', 'limited', 'temporary_limited', 'frozen', 'unknown'].includes(account.status)
  })
}

function generatePreviewItems(task: BroadcastTask, creatives: BroadcastCreative[], groups: BroadcastGroupTarget[], accounts: Array<{ id: number; status?: string }>) {
  const today = new Date()
  const startMinutes = toMinutes(task.startTime)
  const rawEndMinutes = toMinutes(task.endTime)
  const endMinutes = rawEndMinutes < startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes
  const interval = Math.max(5, Number(task.intervalMinutes) || 10)
  const jitter = Math.max(0, Math.min(30, Number(task.jitterMinutes) || 0))
  const limitPerGroup = Math.max(1, Number(task.dailyLimitPerGroup) || 1)
  const creativeRotation = rotateCreatives(task, creatives)
  const selectedGroups = groups.filter((group) => task.groupIds.includes(group.id) && group.enabled)
  const items: BroadcastPreviewItem[] = []
  let globalIndex = 0

  for (const group of selectedGroups) {
    const compatibleAccounts = getCompatibleAccounts(task, group, accounts)
    let slotIndex = 0
    for (let minute = startMinutes; minute <= endMinutes && slotIndex < limitPerGroup; minute += interval) {
      const jitterOffset = jitter === 0 ? 0 : (globalIndex % (jitter * 2 + 1)) - jitter
      const scheduledMinute = Math.max(startMinutes, Math.min(endMinutes, minute + jitterOffset))
      const scheduledAt = setMinutes(today, scheduledMinute)
      const creativeId = creativeRotation.length > 0 ? creativeRotation[globalIndex % creativeRotation.length] : null
      const accountId = compatibleAccounts.length > 0 ? compatibleAccounts[slotIndex % compatibleAccounts.length] : null
      let status: BroadcastPreviewStatus = 'queued'
      let errorMessage = ''

      if (!creativeId) {
        status = 'failed'
        errorMessage = '当前任务还没有启用中的图文文案'
      } else if (!accountId) {
        status = 'failed'
        errorMessage = '目标群内没有已加入且可发送的账号'
      } else if (slotIndex < 2) {
        status = 'scheduled'
      }

      items.push({
        id: createId('preview'),
        taskId: task.id,
        scheduledAt: scheduledAt.toISOString(),
        accountId,
        groupId: group.id,
        creativeId,
        status,
        errorMessage,
        remoteMessageId: null,
        syncedAt: null
      })
      slotIndex += 1
      globalIndex += 1
    }
  }

  return items.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
}

const initialCreatives: BroadcastCreative[] = [
  {
    id: createId('creative'),
    title: '早间图文 A',
    text: '早安，今日热门内容已经整理好了，点击群内置顶查看详情。',
    imageUrl: createPlaceholderImage('早间图文 A', '#1d4ed8', '#2563eb'),
    dailyQuota: 12,
    weight: 3,
    enabled: true,
    note: '适合早间第一轮预热'
  },
  {
    id: createId('creative'),
    title: '转化图文 B',
    text: '今日限时活动继续开放，需要名额的直接联系管理员领取。',
    imageUrl: createPlaceholderImage('转化图文 B', '#7c3aed', '#9333ea'),
    dailyQuota: 8,
    weight: 2,
    enabled: true,
    note: '中午和晚间转化使用'
  }
]

const initialGroups: BroadcastGroupTarget[] = [
  {
    id: createId('group'),
    title: '高活跃交流群',
    username: '@high_active_group',
    memberCount: 1850,
    enabled: true,
    accountIds: []
  },
  {
    id: createId('group'),
    title: '转化群 02',
    username: '@convert_group_02',
    memberCount: 963,
    enabled: true,
    accountIds: []
  }
]

const initialTasks: BroadcastTask[] = [
  {
    id: createId('task'),
    name: '默认定时群发任务',
    enabled: true,
    status: 'draft',
    note: '先把今天的排程预览跑出来，再一键写入 Telegram 官方定时消息。',
    accountIds: [],
    groupIds: initialGroups.map((item) => item.id),
    creativeIds: initialCreatives.map((item) => item.id),
    startTime: '09:00',
    endTime: '23:00',
    intervalMinutes: 10,
    jitterMinutes: 1,
    dailyLimitPerGroup: 12,
    lastSyncedAt: null
  }
]

export const useBroadcastStore = create<BroadcastState>()(
  persist(
    (set, get) => ({
      activeTab: 'tasks',
      tasks: initialTasks,
      creatives: initialCreatives,
      groups: initialGroups,
      selectedTaskId: initialTasks[0]?.id ?? null,
      selectedCreativeId: initialCreatives[0]?.id ?? null,
      previewItems: [],
      lastActionMessage: '先完成任务配置，再写入 Telegram 官方定时消息。',
      syncing: false,
      errorMessage: '',
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectTask: (taskId) => set({ selectedTaskId: taskId }),
      selectCreative: (creativeId) => set({ selectedCreativeId: creativeId }),
      createTask: () => {
        const nextTask: BroadcastTask = {
          id: createId('task'),
          name: '新建定时群发任务',
          enabled: true,
          status: 'draft',
          note: '',
          accountIds: [],
          groupIds: [],
          creativeIds: [],
          startTime: '09:00',
          endTime: '23:00',
          intervalMinutes: 10,
          jitterMinutes: 1,
          dailyLimitPerGroup: 12,
          lastSyncedAt: null
        }
        set((state) => ({
          tasks: [nextTask, ...state.tasks],
          selectedTaskId: nextTask.id,
          activeTab: 'tasks',
          lastActionMessage: '已创建新任务，先把账号、群和文案勾上。'
        }))
      },
      duplicateTask: (taskId) => set((state) => {
        const current = state.tasks.find((item) => item.id === taskId)
        if (!current) return state
        const duplicated = cloneTask(current)
        return {
          tasks: [duplicated, ...state.tasks],
          selectedTaskId: duplicated.id,
          activeTab: 'tasks',
          lastActionMessage: `已复制任务：${current.name}`
        }
      }),
      updateTask: (taskId, patch) => set((state) => ({
        tasks: state.tasks.map((item) => item.id === taskId ? { ...item, ...patch } : item)
      })),
      toggleTaskAccount: (taskId, accountId) => set((state) => ({
        tasks: state.tasks.map((item) => {
          if (item.id !== taskId) return item
          const exists = item.accountIds.includes(accountId)
          return {
            ...item,
            accountIds: exists ? item.accountIds.filter((id) => id !== accountId) : [...item.accountIds, accountId]
          }
        })
      })),
      toggleTaskGroup: (taskId, groupId) => set((state) => ({
        tasks: state.tasks.map((item) => {
          if (item.id !== taskId) return item
          const exists = item.groupIds.includes(groupId)
          return {
            ...item,
            groupIds: exists ? item.groupIds.filter((id) => id !== groupId) : [...item.groupIds, groupId]
          }
        })
      })),
      toggleTaskCreative: (taskId, creativeId) => set((state) => ({
        tasks: state.tasks.map((item) => {
          if (item.id !== taskId) return item
          const exists = item.creativeIds.includes(creativeId)
          return {
            ...item,
            creativeIds: exists ? item.creativeIds.filter((id) => id !== creativeId) : [...item.creativeIds, creativeId]
          }
        })
      })),
      createCreative: () => {
        const nextCreative: BroadcastCreative = {
          id: createId('creative'),
          title: '新图文文案',
          text: '',
          imageUrl: createPlaceholderImage('新图文文案', '#0f172a', '#334155'),
          dailyQuota: 6,
          weight: 1,
          enabled: true,
          note: ''
        }
        set((state) => ({
          creatives: [nextCreative, ...state.creatives],
          selectedCreativeId: nextCreative.id,
          activeTab: 'creatives',
          lastActionMessage: '已新增文案卡片，直接把图文补进去就行。'
        }))
      },
      updateCreative: (creativeId, patch) => set((state) => ({
        creatives: state.creatives.map((item) => item.id === creativeId ? { ...item, ...patch } : item)
      })),
      createGroup: ({ title, username, memberCount }) => {
        const nextGroup: BroadcastGroupTarget = {
          id: createId('group'),
          title: title.trim() || '新群组',
          username: username.trim(),
          memberCount: Number(memberCount) || 0,
          enabled: true,
          accountIds: []
        }
        set((state) => ({
          groups: [nextGroup, ...state.groups],
          activeTab: 'targets',
          lastActionMessage: `已新增目标群：${nextGroup.title}`
        }))
      },
      updateGroup: (groupId, patch) => set((state) => ({
        groups: state.groups.map((item) => item.id === groupId ? { ...item, ...patch } : item)
      })),
      toggleGroupAccount: (groupId, accountId) => set((state) => ({
        groups: state.groups.map((item) => {
          if (item.id !== groupId) return item
          const exists = item.accountIds.includes(accountId)
          return {
            ...item,
            accountIds: exists ? item.accountIds.filter((id) => id !== accountId) : [...item.accountIds, accountId]
          }
        })
      })),
      generatePreview: (accounts) => {
        const state = get()
        const task = state.tasks.find((item) => item.id === state.selectedTaskId)
        if (!task) {
          set({ previewItems: [], lastActionMessage: '先选一个任务再生成预览。', errorMessage: '' })
          return
        }
        const previewItems = normalizePreviewItems(generatePreviewItems(task, state.creatives, state.groups, accounts))
        set({
          previewItems,
          activeTab: 'tasks',
          errorMessage: '',
          lastActionMessage: previewItems.length > 0 ? `已生成 ${previewItems.length} 条今日排程预览。` : '当前配置还生成不出任何排程，请检查账号、群或文案。'
        })
      },
      clearPreview: () => set({ previewItems: [], errorMessage: '', lastActionMessage: '当前任务预览已清空。' }),
      pushScheduleToTelegram: async () => {
        const state = get()
        const task = state.tasks.find((item) => item.id === state.selectedTaskId)
        if (!task) {
          set({ errorMessage: '请先选中要写入的任务。', lastActionMessage: '当前没有可写入的任务。' })
          return
        }

        const candidateItems = state.previewItems.filter((item) => item.taskId === task.id && item.status !== 'failed' && !item.remoteMessageId)
        if (candidateItems.length === 0) {
          set({ errorMessage: '', lastActionMessage: '当前没有新的可写入排程，已经写过的不会重复补发。' })
          return
        }

        const payload: BroadcastPushSchedulePayload = {
          items: candidateItems,
          creatives: state.creatives,
          groups: state.groups
        }

        if (!window.desktopBroadcast?.pushSchedule) {
          set((current) => ({
            previewItems: current.previewItems.map((item) => candidateItems.some((entry) => entry.id === item.id)
              ? { ...item, status: 'scheduled', syncedAt: new Date().toISOString(), errorMessage: '' }
              : item),
            tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: 'active', lastSyncedAt: new Date().toISOString() } : item),
            errorMessage: '',
            lastActionMessage: '当前环境未注入桌面排程 API，已按本地模拟模式标记为已写入。'
          }))
          return
        }

        set({ syncing: true, errorMessage: '' })
        try {
          const result = await window.desktopBroadcast.pushSchedule(payload)
          const resultMap = new Map(result.items.map((item) => [item.previewItemId, item]))
          const now = new Date().toISOString()
          set((current) => ({
            syncing: false,
            previewItems: current.previewItems.map((item) => {
              const matched = resultMap.get(item.id)
              if (!matched) return item
              return {
                ...item,
                status: matched.status,
                errorMessage: matched.errorMessage,
                remoteMessageId: matched.remoteMessageId,
                syncedAt: matched.syncedAt
              }
            }),
            tasks: current.tasks.map((item) => item.id === task.id
              ? {
                ...item,
                status: result.successCount > 0 ? 'active' : item.status,
                lastSyncedAt: result.successCount > 0 ? now : item.lastSyncedAt
              }
              : item),
            errorMessage: result.failedCount > 0 ? `有 ${result.failedCount} 条写入失败，可直接看右侧报错逐条修。` : '',
            lastActionMessage: result.message
          }))
        } catch (error) {
          set({
            syncing: false,
            errorMessage: error instanceof Error ? error.message : '写入 Telegram 定时消息失败。',
            lastActionMessage: '写入 Telegram 官方定时消息失败。'
          })
        }
      }
    }),
    {
      name: 'tg-group-broadcast-workbench',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any) => ({
        ...persistedState,
        previewItems: normalizePreviewItems(Array.isArray(persistedState?.previewItems) ? persistedState.previewItems : []),
        syncing: false,
        errorMessage: ''
      }),
      partialize: (state) => ({
        activeTab: state.activeTab,
        tasks: state.tasks,
        creatives: state.creatives,
        groups: state.groups,
        selectedTaskId: state.selectedTaskId,
        selectedCreativeId: state.selectedCreativeId,
        previewItems: state.previewItems,
        lastActionMessage: state.lastActionMessage
      })
    }
  )
)
