import { create } from 'zustand'
import type { BroadcastJoinedGroup, GroupInvitePayload, GroupInviteProgressState, GroupInviteTargetItem } from '../types'

export type GroupInviteTabKey = 'settings' | 'logs'

export interface GroupInviteParsedSummary {
  items: GroupInviteTargetItem[]
  duplicates: string[]
  invalids: string[]
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
  init: () => void
}

let subscribed = false

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

    set({ activeTab: 'logs', lastActionMessage: '正在启动群组邀请任务…' })
    const result = await api.start(payload)
    set({ lastActionMessage: result.message })
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
      set({ stopping: false })
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
        set({
          progressState: state,
          running: state.running,
          stopping: state.stopRequested,
          runningAccountIds: state.runningAccountIds,
          runtimeReady: true,
          lastActionMessage: readLastMessage(state)
        })
      })
      .catch((error) => {
        set({ runtimeReady: false, lastActionMessage: error instanceof Error ? error.message : '读取群组邀请状态失败。' })
      })

    api.onProgress((state) => {
      set({
        progressState: state,
        running: state.running,
        stopping: state.stopRequested,
        runningAccountIds: state.runningAccountIds,
        runtimeReady: true,
        lastActionMessage: readLastMessage(state)
      })
    })
  }
}))
