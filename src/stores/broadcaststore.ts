import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { BroadcastJoinedGroup, BroadcastPushSchedulePayload } from '../types'

export type BroadcastTabKey = 'tasks' | 'creatives' | 'targets' | 'calendar'
export type BroadcastTaskStatus = 'draft' | 'active' | 'paused'
export type BroadcastPreviewStatus = 'queued' | 'scheduled' | 'failed'

export interface BroadcastCreative {
  id: string
  title: string
  kind: 'text' | 'image' | 'image_text' | 'image_button'
  text: string
  imageUrl: string
  dailyQuota: number
  weight: number
  enabled: boolean
  buttonText: string
  buttonUrl: string
  note: string
}

export interface BroadcastGroupTarget {
  id: string
  title: string
  username: string
  targetRef: string
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
  startDate: string
  endDate: string
  scheduleMode: 'date_range' | 'daily_repeat'
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
  selectedTargetAccountId: number | null
  joinedGroups: BroadcastJoinedGroup[]
  lastActionMessage: string
  syncing: boolean
  loadingJoinedGroups: boolean
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
  createGroup: (payload: { title: string; username: string; targetRef?: string; memberCount: number }) => void
  updateGroup: (groupId: string, patch: Partial<BroadcastGroupTarget>) => void
  toggleGroupAccount: (groupId: string, accountId: number) => void
  setSelectedTargetAccountId: (accountId: number | null) => void
  loadJoinedGroupsForAccount: (accountId: number) => Promise<void>
  attachJoinedGroupToAccount: (accountId: number, group: BroadcastJoinedGroup) => void
  generatePreview: (accounts: Array<{ id: number; status?: string }>) => void
  clearPreview: () => void
  pushScheduleToTelegram: () => Promise<void>
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2]) - 1
  const day = Number(matched[3])
  const date = new Date(year, month, day)
  return Number.isFinite(date.getTime()) ? date : null
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
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

function normalizeUsername(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return `@${trimmed.replace(/^@+/, '').toLowerCase()}`
}

function normalizeGroupRefValue(value: string) {
  return value.trim().toLowerCase()
}

function buildGroupIdentityKey(group: { title?: string; username?: string; targetRef?: string }) {
  const targetRef = normalizeGroupRefValue(group.targetRef || '')
  if (targetRef) return `ref:${targetRef}`
  const username = normalizeUsername(group.username || '')
  if (username) return `username:${username}`
  const title = String(group.title || '').trim().toLowerCase()
  return title ? `title:${title}` : ''
}

function isSameGroup(left: { title?: string; username?: string; targetRef?: string }, right: { title?: string; username?: string; targetRef?: string }) {
  const leftTargetRef = normalizeGroupRefValue(left.targetRef || '')
  const rightTargetRef = normalizeGroupRefValue(right.targetRef || '')
  if (leftTargetRef || rightTargetRef) {
    return Boolean(leftTargetRef && rightTargetRef && leftTargetRef === rightTargetRef)
  }

  const leftUsername = normalizeUsername(left.username || '')
  const rightUsername = normalizeUsername(right.username || '')
  if (leftUsername || rightUsername) {
    return Boolean(leftUsername && rightUsername && leftUsername === rightUsername)
  }

  return String(left.title || '').trim() !== '' && String(left.title || '').trim() === String(right.title || '').trim()
}

function dedupeGroups(groups: BroadcastGroupTarget[]) {
  const idMap = new Map<string, string>()
  const mergedByKey = new Map<string, BroadcastGroupTarget>()

  for (const group of groups) {
    const key = buildGroupIdentityKey(group)
    if (!key) {
      mergedByKey.set(group.id, group)
      idMap.set(group.id, group.id)
      continue
    }

    const existing = mergedByKey.get(key)
    if (!existing) {
      mergedByKey.set(key, { ...group, accountIds: [...group.accountIds] })
      idMap.set(group.id, group.id)
      continue
    }

    const merged: BroadcastGroupTarget = {
      ...existing,
      title: existing.title || group.title,
      username: existing.username || group.username,
      targetRef: existing.targetRef || group.targetRef || group.username,
      memberCount: Math.max(existing.memberCount || 0, group.memberCount || 0),
      enabled: existing.enabled || group.enabled,
      accountIds: Array.from(new Set([...existing.accountIds, ...group.accountIds]))
    }
    mergedByKey.set(key, merged)
    idMap.set(group.id, existing.id)
  }

  return {
    groups: Array.from(mergedByKey.values()),
    idMap
  }
}

function dedupeJoinedGroups(items: BroadcastJoinedGroup[]) {
  const result = new Map<string, BroadcastJoinedGroup>()

  for (const item of items) {
    const targetRef = normalizeGroupRefValue(item.targetRef || '')
    const username = normalizeUsername(item.username || '')
    const title = String(item.title || '').trim().toLowerCase()
    const key = targetRef ? `ref:${targetRef}` : username ? `username:${username}` : `title:${title}`
    const titleKey = title ? `title:${title}` : key
    const existing = result.get(key) || result.get(titleKey)

    if (!existing) {
      result.set(key, item)
      if (title) result.set(titleKey, item)
      continue
    }

    const merged: BroadcastJoinedGroup = {
      ...existing,
      title: existing.title || item.title,
      username: item.username || existing.username,
      targetRef: item.username || existing.username || item.targetRef || existing.targetRef || item.peerId || existing.peerId,
      peerId: existing.peerId || item.peerId,
      memberCount: Math.max(existing.memberCount || 0, item.memberCount || 0),
      type: existing.type === 'supergroup' || item.type === 'supergroup' ? 'supergroup' : existing.type
    }

    result.set(key, merged)
    if (title) result.set(titleKey, merged)
  }

  return Array.from(new Map(Array.from(result.values()).map((item) => [`${item.username || ''}::${item.peerId || ''}::${String(item.title || '').trim().toLowerCase()}`, item])).values())
}

function scoreGroupRef(group: { username?: string; targetRef?: string }) {
  const username = normalizeUsername(group.username || '')
  if (username) return 4
  const targetRef = String(group.targetRef || '').trim().toLowerCase()
  if (!targetRef) return 0
  if (targetRef.includes('t.me/+') || targetRef.includes('joinchat/')) return 3
  if (/^-?\d+$/.test(targetRef)) return 2
  return 1
}

function buildTaskGroupSelectionKey(group: BroadcastGroupTarget) {
  const title = String(group.title || '').trim().toLowerCase()
  const accountKey = [...group.accountIds].sort((left, right) => left - right).join(',')
  if (title) return `${accountKey}::title:${title}`
  const identityKey = buildGroupIdentityKey(group)
  return `${accountKey}::${identityKey || group.id}`
}

function dedupeTaskGroupIds(groupIds: string[], groups: BroadcastGroupTarget[]) {
  const selectedGroups = groupIds
    .map((groupId) => groups.find((group) => group.id === groupId))
    .filter((group): group is BroadcastGroupTarget => Boolean(group))

  const bestGroupByKey = new Map<string, BroadcastGroupTarget>()
  for (const group of selectedGroups) {
    const key = buildTaskGroupSelectionKey(group)
    const existing = bestGroupByKey.get(key)
    if (!existing) {
      bestGroupByKey.set(key, group)
      continue
    }

    const existingScore = scoreGroupRef(existing)
    const nextScore = scoreGroupRef(group)
    if (nextScore > existingScore || (nextScore === existingScore && (group.memberCount || 0) > (existing.memberCount || 0))) {
      bestGroupByKey.set(key, group)
    }
  }

  return Array.from(bestGroupByKey.values()).map((group) => group.id)
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
  const now = new Date()
  const today = startOfLocalDay(now)
  const startDate = parseDateInputValue(task.startDate) ?? today
  const rawEndDate = parseDateInputValue(task.endDate) ?? startDate
  const endDate = rawEndDate.getTime() >= startDate.getTime() ? rawEndDate : startDate
  const totalDays = Math.max(1, Math.floor((startOfLocalDay(endDate).getTime() - startOfLocalDay(startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1)
  const startMinutes = toMinutes(task.startTime)
  const rawEndMinutes = toMinutes(task.endTime)
  const endMinutes = rawEndMinutes < startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes
  const interval = Math.max(5, Number(task.intervalMinutes) || 10)
  const jitter = 0
  const limitPerGroup = Math.max(1, Number(task.dailyLimitPerGroup) || 1)
  const creativeRotation = rotateCreatives(task, creatives)
  const selectedGroupIds = dedupeTaskGroupIds(task.groupIds, groups)
  const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id) && group.enabled)
  const items: BroadcastPreviewItem[] = []
  let globalIndex = 0

  for (const group of selectedGroups) {
    const compatibleAccounts = getCompatibleAccounts(task, group, accounts)

    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const dayBase = new Date(startDate)
      dayBase.setDate(startDate.getDate() + dayIndex)
      let slotIndex = 0

      for (let minute = startMinutes; minute <= endMinutes && slotIndex < limitPerGroup; minute += interval) {
        const jitterOffset = jitter === 0 ? 0 : (globalIndex % (jitter * 2 + 1)) - jitter
        const scheduledMinute = Math.max(startMinutes, Math.min(endMinutes, minute + jitterOffset))
        const scheduledAt = setMinutes(dayBase, scheduledMinute)
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
  }

  return items.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
}

const initialCreatives: BroadcastCreative[] = []

const initialGroups: BroadcastGroupTarget[] = []

const defaultStartDate = formatDateInputValue(new Date())

const initialTasks: BroadcastTask[] = [
  {
    id: createId('task'),
    name: '默认定时群发任务',
    enabled: true,
    status: 'draft',
    note: '先把日期范围和每日条数配好，再一键写入 Telegram 官方定时消息。',
    accountIds: [],
    groupIds: initialGroups.map((item) => item.id),
    creativeIds: initialCreatives.map((item) => item.id),
    startDate: defaultStartDate,
    endDate: defaultStartDate,
    scheduleMode: 'date_range',
    startTime: '09:00',
    endTime: '23:00',
    intervalMinutes: 10,
    jitterMinutes: 0,
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
      selectedTargetAccountId: null,
      joinedGroups: [],
      lastActionMessage: '先完成任务配置，再写入 Telegram 官方定时消息。',
      syncing: false,
      loadingJoinedGroups: false,
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
          startDate: formatDateInputValue(new Date()),
          endDate: formatDateInputValue(new Date()),
          scheduleMode: 'date_range',
          startTime: '09:00',
          endTime: '23:00',
          intervalMinutes: 10,
          jitterMinutes: 0,
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
          title: '',
          kind: 'text',
          text: '',
          imageUrl: '',
          dailyQuota: 1,
          weight: 1,
          enabled: true,
          buttonText: '',
          buttonUrl: '',
          note: ''
        }
        set((state) => ({
          creatives: [nextCreative, ...state.creatives],
          selectedCreativeId: nextCreative.id,
          activeTab: 'creatives',
          lastActionMessage: '已新增空白文案，直接填你自己的内容就行。'
        }))
      },
      updateCreative: (creativeId, patch) => set((state) => ({
        creatives: state.creatives.map((item) => item.id === creativeId ? { ...item, ...patch } : item)
      })),
      createGroup: ({ title, username, targetRef, memberCount }) => {
        const state = get()
        const selectedTask = state.tasks.find((item) => item.id === state.selectedTaskId) ?? null
        const preferredAccountId = state.selectedTargetAccountId ?? (selectedTask?.accountIds.length === 1 ? selectedTask.accountIds[0] : null)
        const normalizedUsername = username.trim()
        const normalizedTargetRef = (targetRef ?? username).trim()
        const nextGroup: BroadcastGroupTarget = {
          id: createId('group'),
          title: title.trim() || '新群组',
          username: normalizedUsername,
          targetRef: normalizedTargetRef,
          memberCount: Number(memberCount) || 0,
          enabled: true,
          accountIds: typeof preferredAccountId === 'number' ? [preferredAccountId] : []
        }
        set((state) => ({
          groups: [nextGroup, ...state.groups],
          activeTab: 'targets',
          lastActionMessage: typeof preferredAccountId === 'number' ? `已新增目标群：${nextGroup.title}，并自动绑定当前账号。` : `已新增目标群：${nextGroup.title}`
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
      setSelectedTargetAccountId: (accountId) => set({ selectedTargetAccountId: accountId }),
      loadJoinedGroupsForAccount: async (accountId) => {
        if (!window.desktopBroadcast?.listJoinedGroups) {
          set({ errorMessage: '当前环境还没注入读取已加入群的桌面能力。' })
          return
        }

        set({ selectedTargetAccountId: accountId, loadingJoinedGroups: true, errorMessage: '', joinedGroups: [] })
        try {
          const joinedGroups = dedupeJoinedGroups(await window.desktopBroadcast.listJoinedGroups(accountId))
          set({
            joinedGroups,
            loadingJoinedGroups: false,
            lastActionMessage: joinedGroups.length > 0 ? `已读取 ${joinedGroups.length} 个已加入群。` : '这个账号暂时没读到可用群组。'
          })
        } catch (error) {
          set({
            joinedGroups: [],
            loadingJoinedGroups: false,
            errorMessage: error instanceof Error ? error.message : '读取已加入群失败。',
            lastActionMessage: '读取账号已加入群失败。'
          })
        }
      },
      attachJoinedGroupToAccount: (accountId, group) => set((state) => {
        const incomingTargetRef = (group.targetRef || group.username || group.peerId || '').trim()
        const matched = state.groups.find((item) => isSameGroup(item, { title: group.title, username: group.username, targetRef: incomingTargetRef }))

        if (matched) {
          return {
            groups: state.groups.map((item) => item.id !== matched.id
              ? item
              : {
                ...item,
                title: group.title || item.title,
                username: group.username || item.username,
                targetRef: incomingTargetRef || item.targetRef || item.username,
                memberCount: group.memberCount || item.memberCount,
                enabled: true,
                accountIds: item.accountIds.includes(accountId) ? item.accountIds : [...item.accountIds, accountId]
              }),
            lastActionMessage: `已把 ${group.title} 绑定到当前账号。`
          }
        }

        const nextGroup: BroadcastGroupTarget = {
          id: createId('group'),
          title: group.title,
          username: group.username,
          targetRef: incomingTargetRef,
          memberCount: group.memberCount,
          enabled: true,
          accountIds: [accountId]
        }

        return {
          groups: [nextGroup, ...state.groups],
          lastActionMessage: `已添加目标群：${group.title}`
        }
      }),
      generatePreview: (accounts) => {
        const state = get()
        const task = state.tasks.find((item) => item.id === state.selectedTaskId)
        if (!task) {
          set({ previewItems: [], lastActionMessage: '先选一个任务再生成预览。', errorMessage: '' })
          return
        }
        const previewItems = normalizePreviewItems(generatePreviewItems(task, state.creatives, state.groups, accounts))
        const startDate = parseDateInputValue(task.startDate)
        const endDate = parseDateInputValue(task.endDate)
        const totalDays = startDate && endDate
          ? Math.max(1, Math.floor((startOfLocalDay(endDate).getTime() - startOfLocalDay(startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1)
          : 1
        set({
          previewItems,
          activeTab: 'tasks',
          errorMessage: '',
          lastActionMessage: previewItems.length > 0 ? `已生成 ${previewItems.length} 条排程预览，共 ${totalDays} 天。` : '当前配置还生成不出任何排程，请检查账号、群或文案。'
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
      version: 9,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any) => {
        const defaultCreativeTitles = new Set(['早间图文 A', '转化图文 B'])
        const creatives = Array.isArray(persistedState?.creatives)
          ? persistedState.creatives
            .filter((creative: any) => !defaultCreativeTitles.has(String(creative?.title || '').trim()))
            .map((creative: any) => {
              const text = typeof creative?.text === 'string' ? creative.text : ''
              const imageUrl = typeof creative?.imageUrl === 'string' ? creative.imageUrl : ''
              const buttonText = typeof creative?.buttonText === 'string'
                ? creative.buttonText
                : typeof creative?.note === 'string'
                  ? creative.note
                  : ''
              const buttonUrl = typeof creative?.buttonUrl === 'string' ? creative.buttonUrl : ''
              const kind = typeof creative?.kind === 'string' && creative.kind
                ? creative.kind
                : buttonText.trim() || buttonUrl.trim()
                  ? 'image_button'
                  : imageUrl.trim() && text.trim()
                    ? 'image_text'
                    : imageUrl.trim()
                      ? 'image'
                      : 'text'

              return {
                ...creative,
                kind,
                buttonText,
                buttonUrl
              }
            })
          : []
        const creativeIds = new Set(creatives.map((creative: any) => creative.id))

        const normalizedGroups = Array.isArray(persistedState?.groups)
          ? persistedState.groups.map((group: any) => ({
            ...group,
            targetRef: typeof group?.targetRef === 'string' && group.targetRef.trim()
              ? group.targetRef
              : typeof group?.username === 'string'
                ? group.username
                : ''
          }))
          : []

        const deduped = dedupeGroups(normalizedGroups)

        return {
          ...persistedState,
          creatives,
          tasks: Array.isArray(persistedState?.tasks)
            ? persistedState.tasks.map((task: any) => ({
              ...task,
              startDate: typeof task?.startDate === 'string' && task.startDate.trim() ? task.startDate : defaultStartDate,
              endDate: typeof task?.endDate === 'string' && task.endDate.trim() ? task.endDate : (typeof task?.startDate === 'string' && task.startDate.trim() ? task.startDate : defaultStartDate),
              scheduleMode: task?.scheduleMode === 'daily_repeat' ? 'daily_repeat' : 'date_range',
              groupIds: Array.isArray(task?.groupIds)
                ? dedupeTaskGroupIds((Array.from(new Set((task.groupIds as string[]).map((groupId: string) => deduped.idMap.get(groupId) || groupId))) as string[]).filter((groupId) => deduped.groups.some((group) => group.id === groupId)), deduped.groups)
                : [],
              creativeIds: Array.isArray(task?.creativeIds)
                ? task.creativeIds.filter((creativeId: string) => creativeIds.has(creativeId))
                : []
            }))
            : [],
          selectedCreativeId: creativeIds.has(persistedState?.selectedCreativeId) ? persistedState.selectedCreativeId : null,
          groups: deduped.groups,
          previewItems: normalizePreviewItems(Array.isArray(persistedState?.previewItems)
            ? persistedState.previewItems.map((item: any) => ({
              ...item,
              groupId: deduped.idMap.get(item?.groupId) || item?.groupId
            })).filter((item: any) => deduped.groups.some((group) => group.id === item.groupId))
            : []),
          selectedTargetAccountId: null,
          joinedGroups: [],
          syncing: false,
          loadingJoinedGroups: false,
          errorMessage: ''
        }
      },
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
