import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type DirectMessageTabKey = 'send' | 'logs' | 'collect' | 'auto-reply'
export type DirectMessageMessageType = 'text' | 'image_text'
export type DirectMessageSendMode = 'username' | 'contact' | 'txt'
export type DirectMessageCollectorMode = 'manual' | 'group_members' | 'comment_users' | 'react_users'
export type DirectMessagePreviewStatus = 'queued' | 'sent'

export interface DirectMessageTargetRecord {
  id: string
  value: string
  normalizedValue: string
  valid: boolean
  duplicate: boolean
  source: 'manual' | 'file' | 'collect'
}

export interface DirectMessageCollectedUser {
  id: string
  value: string
  normalizedValue: string
  sourceLabel: string
  importedAt: string
}

export interface DirectMessagePreviewItem {
  id: string
  targetId: string
  targetValue: string
  accountId: number | null
  accountLabel: string
  status: DirectMessagePreviewStatus
  waitSeconds: number
  batchIndex: number
}

export interface DirectMessageRunItem {
  id: string
  targetValue: string
  accountLabel: string
  status: 'sent'
  message: string
}

export interface DirectMessageRun {
  id: string
  createdAt: string
  total: number
  sent: number
  failed: number
  accountCount: number
  summary: string
  items: DirectMessageRunItem[]
}

export interface DirectMessageAutoReplyRule {
  id: string
  keyword: string
  replyText: string
  enabled: boolean
  matchMode: 'contains' | 'exact'
  cooldownSeconds: number
}

interface DirectMessageState {
  activeTab: DirectMessageTabKey
  sendMode: DirectMessageSendMode
  messageType: DirectMessageMessageType
  collectorMode: DirectMessageCollectorMode
  selectedAccountIds: number[]
  selectedAccountId: number | null
  targetInput: string
  collectorInput: string
  targets: DirectMessageTargetRecord[]
  collectedUsers: DirectMessageCollectedUser[]
  messageText: string
  imageUrl: string
  imageName: string
  groupConcurrency: number
  accountPerGroup: number
  intervalSeconds: number
  dedupeEnabled: boolean
  autoReplyEnabled: boolean
  previewItems: DirectMessagePreviewItem[]
  runs: DirectMessageRun[]
  autoReplyRules: DirectMessageAutoReplyRule[]
  lastActionMessage: string
  setActiveTab: (tab: DirectMessageTabKey) => void
  setSendMode: (mode: DirectMessageSendMode) => void
  setCollectorMode: (mode: DirectMessageCollectorMode) => void
  setMessageType: (value: DirectMessageMessageType) => void
  setTargetInput: (value: string) => void
  setCollectorInput: (value: string) => void
  setMessageText: (value: string) => void
  setImagePayload: (payload: { url: string; name?: string }) => void
  clearImage: () => void
  setGroupConcurrency: (value: number) => void
  setAccountPerGroup: (value: number) => void
  setIntervalSeconds: (value: number) => void
  setDedupeEnabled: (value: boolean) => void
  setAutoReplyEnabled: (value: boolean) => void
  setSelectedAccounts: (ids: number[]) => void
  setSelectedAccountId: (accountId: number | null) => void
  toggleSelectedAccount: (accountId: number) => void
  importTargets: (text: string, options?: { mode?: 'replace' | 'append'; source?: 'manual' | 'file' | 'collect' }) => { total: number; valid: number; invalid: number; duplicate: number }
  removeTarget: (targetId: string) => void
  clearTargets: () => void
  collectUsers: (text: string, sourceLabel: string) => { total: number; added: number }
  appendCollectedUsersToTargets: () => void
  clearCollectedUsers: () => void
  generatePreview: (accounts: Array<{ id: number; username?: string; phone?: string; profile?: Record<string, unknown> }>) => void
  startMockSend: () => void
  clearPreview: () => void
  addAutoReplyRule: () => void
  updateAutoReplyRule: (ruleId: string, patch: Partial<DirectMessageAutoReplyRule>) => void
  removeAutoReplyRule: (ruleId: string) => void
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeTargetValue(input: string) {
  const value = input.trim()
  if (!value) return ''
  if (/^@?[a-zA-Z0-9_]{5,}$/i.test(value)) {
    return `@${value.replace(/^@+/, '').toLowerCase()}`
  }
  return value.toLowerCase()
}

function isValidTargetValue(input: string) {
  const value = input.trim()
  if (!value) return false
  if (/^@?[a-zA-Z0-9_]{5,}$/i.test(value)) return true
  if (/^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,}(?:\/[0-9]+)?$/i.test(value)) return true
  if (/^\+?\d{6,15}$/.test(value)) return true
  return false
}

function tokenizeText(input: string) {
  return input
    .split(/\r?\n|,|，|;|；|\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function rebuildTargetRecords(records: Array<{ value: string; source: 'manual' | 'file' | 'collect' }>) {
  const seen = new Set<string>()
  return records.map((record) => {
    const normalizedValue = normalizeTargetValue(record.value)
    const valid = isValidTargetValue(record.value)
    const duplicate = Boolean(valid && normalizedValue && seen.has(normalizedValue))
    if (valid && normalizedValue && !duplicate) {
      seen.add(normalizedValue)
    }
    return {
      id: createId('dm_target'),
      value: /^@?[a-zA-Z0-9_]{5,}$/i.test(record.value) && !record.value.startsWith('@') ? `@${record.value}` : record.value,
      normalizedValue,
      valid,
      duplicate,
      source: record.source
    }
  })
}

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function createDefaultAutoReplyRule(): DirectMessageAutoReplyRule {
  return {
    id: createId('dm_rule'),
    keyword: '',
    replyText: '',
    enabled: true,
    matchMode: 'contains',
    cooldownSeconds: 30
  }
}

export const useDirectMessageStore = create<DirectMessageState>()(
  persist(
    (set, get) => ({
      activeTab: 'send',
      sendMode: 'username',
      messageType: 'text',
      collectorMode: 'manual',
      selectedAccountIds: [],
      selectedAccountId: null,
      targetInput: '',
      collectorInput: '',
      targets: [],
      collectedUsers: [],
      messageText: '',
      imageUrl: '',
      imageName: '',
      groupConcurrency: 3,
      accountPerGroup: 5,
      intervalSeconds: 25,
      dedupeEnabled: true,
      autoReplyEnabled: false,
      previewItems: [],
      runs: [],
      autoReplyRules: [createDefaultAutoReplyRule()],
      lastActionMessage: '先选账号，再导入目标用户。',
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSendMode: (mode) => set({ sendMode: mode }),
      setCollectorMode: (mode) => set({ collectorMode: mode }),
      setMessageType: (value) => set({ messageType: value }),
      setTargetInput: (value) => set({ targetInput: value }),
      setCollectorInput: (value) => set({ collectorInput: value }),
      setMessageText: (value) => set({ messageText: value }),
      setImagePayload: ({ url, name }) => set({ imageUrl: url, imageName: name || '', previewItems: [] }),
      clearImage: () => set({ imageUrl: '', imageName: '', previewItems: [] }),
      setGroupConcurrency: (value) => set({ groupConcurrency: Math.max(1, value || 1) }),
      setAccountPerGroup: (value) => set({ accountPerGroup: Math.max(1, value || 1) }),
      setIntervalSeconds: (value) => set({ intervalSeconds: Math.max(5, value || 5) }),
      setDedupeEnabled: (value) => set({ dedupeEnabled: value }),
      setAutoReplyEnabled: (value) => set({ autoReplyEnabled: value }),
      setSelectedAccounts: (ids) => set((state) => ({
        selectedAccountIds: Array.from(new Set(ids)),
        selectedAccountId: ids.includes(state.selectedAccountId ?? -1) ? state.selectedAccountId : ids[0] ?? null,
        previewItems: []
      })),
      setSelectedAccountId: (accountId) => set({ selectedAccountId: accountId }),
      toggleSelectedAccount: (accountId) => set((state) => {
        const exists = state.selectedAccountIds.includes(accountId)
        const nextIds = exists ? state.selectedAccountIds.filter((item) => item !== accountId) : [...state.selectedAccountIds, accountId]
        return {
          selectedAccountIds: nextIds,
          selectedAccountId: nextIds.includes(state.selectedAccountId ?? -1) ? state.selectedAccountId : nextIds[0] ?? null,
          previewItems: []
        }
      }),
      importTargets: (text, options) => {
        const mode = options?.mode || 'replace'
        const source = options?.source || 'manual'
        const tokens = tokenizeText(text)
        const current = mode === 'append' ? get().targets.map((item) => ({ value: item.value, source: item.source })) : []
        const incoming = tokens.map((value) => ({ value, source }))
        const nextTargets = rebuildTargetRecords([...current, ...incoming])
        const valid = nextTargets.filter((item) => item.valid).length
        const invalid = nextTargets.filter((item) => !item.valid).length
        const duplicate = nextTargets.filter((item) => item.duplicate).length
        set({
          targets: nextTargets,
          targetInput: mode === 'replace' ? text : get().targetInput,
          previewItems: [],
          lastActionMessage: nextTargets.length === 0 ? '没有识别到可用目标。' : `已整理 ${nextTargets.length} 个目标，其中可用 ${valid} 个。`
        })
        return { total: nextTargets.length, valid, invalid, duplicate }
      },
      removeTarget: (targetId) => set((state) => {
        const nextTargets = rebuildTargetRecords(state.targets.filter((item) => item.id !== targetId).map((item) => ({ value: item.value, source: item.source })))
        return { targets: nextTargets, previewItems: [] }
      }),
      clearTargets: () => set({ targets: [], targetInput: '', previewItems: [], lastActionMessage: '目标用户已清空。' }),
      collectUsers: (text, sourceLabel) => {
        const tokens = tokenizeText(text)
        const existing = new Set(get().collectedUsers.map((item) => item.normalizedValue))
        const added: DirectMessageCollectedUser[] = []
        for (const token of tokens) {
          if (!isValidTargetValue(token)) continue
          const normalizedValue = normalizeTargetValue(token)
          if (!normalizedValue || existing.has(normalizedValue)) continue
          existing.add(normalizedValue)
          added.push({
            id: createId('dm_collect'),
            value: /^@?[a-zA-Z0-9_]{5,}$/i.test(token) && !token.startsWith('@') ? `@${token}` : token,
            normalizedValue,
            sourceLabel,
            importedAt: new Date().toISOString()
          })
        }
        set((state) => ({
          collectedUsers: [...added, ...state.collectedUsers],
          lastActionMessage: added.length > 0 ? `已采集 ${added.length} 个用户，可一键加入发送目标。` : '这批内容里没有识别到新的可用用户。'
        }))
        return { total: tokens.length, added: added.length }
      },
      appendCollectedUsersToTargets: () => {
        const state = get()
        if (state.collectedUsers.length === 0) {
          set({ lastActionMessage: '还没有采集到可加入发送的用户。' })
          return
        }
        const nextTargets = rebuildTargetRecords([
          ...state.targets.map((item) => ({ value: item.value, source: item.source })),
          ...state.collectedUsers.map((item) => ({ value: item.value, source: 'collect' as const }))
        ])
        set({
          targets: nextTargets,
          previewItems: [],
          activeTab: 'send',
          lastActionMessage: `已把 ${state.collectedUsers.length} 个采集用户加入发送目标。`
        })
      },
      clearCollectedUsers: () => set({ collectedUsers: [], collectorInput: '', lastActionMessage: '采集结果已清空。' }),
      generatePreview: (accounts) => {
        const state = get()
        const selectedAccounts = accounts.filter((account) => state.selectedAccountIds.includes(account.id))
        if (selectedAccounts.length === 0) {
          set({ previewItems: [], lastActionMessage: '先选发送账号，再生成私信预览。' })
          return
        }
        const usableTargets = state.targets.filter((item) => item.valid && (state.dedupeEnabled ? !item.duplicate : true))
        if (usableTargets.length === 0) {
          set({ previewItems: [], lastActionMessage: '先导入可用目标用户，再生成私信预览。' })
          return
        }
        if (!state.messageText.trim() && !(state.messageType === 'image_text' && state.imageUrl.trim())) {
          set({ previewItems: [], lastActionMessage: '先把私信内容填好，再生成发送预览。' })
          return
        }
        const previewItems = usableTargets.map((target, index) => {
          const account = selectedAccounts[index % selectedAccounts.length]
          const batchIndex = Math.floor(index / Math.max(1, state.accountPerGroup))
          return {
            id: createId('dm_preview'),
            targetId: target.id,
            targetValue: target.value,
            accountId: account?.id ?? null,
            accountLabel: account ? readAccountLabel(account) : '未分配账号',
            status: 'queued' as const,
            waitSeconds: batchIndex * state.intervalSeconds,
            batchIndex
          }
        })
        set({
          previewItems,
          lastActionMessage: `已生成 ${previewItems.length} 条私信预览，当前按每 ${state.intervalSeconds} 秒一批往后排。`
        })
      },
      startMockSend: () => {
        const state = get()
        if (state.previewItems.length === 0) {
          set({ lastActionMessage: '先生成发送预览，再开始发送。' })
          return
        }
        const items = state.previewItems.map((item) => ({
          id: createId('dm_run_item'),
          targetValue: item.targetValue,
          accountLabel: item.accountLabel,
          status: 'sent' as const,
          message: '已进入当前工作台发送队列，下一步再接 Telegram 实际出站。'
        }))
        const run: DirectMessageRun = {
          id: createId('dm_run'),
          createdAt: new Date().toISOString(),
          total: items.length,
          sent: items.length,
          failed: 0,
          accountCount: state.selectedAccountIds.length,
          summary: `本次按 ${state.selectedAccountIds.length} 个账号分配了 ${items.length} 个私信目标。`,
          items
        }
        set({
          previewItems: state.previewItems.map((item) => ({ ...item, status: 'sent' })),
          runs: [run, ...state.runs],
          activeTab: 'logs',
          lastActionMessage: `已把 ${items.length} 条私信加入当前发送队列。`
        })
      },
      clearPreview: () => set({ previewItems: [], lastActionMessage: '当前私信预览已清空。' }),
      addAutoReplyRule: () => set((state) => ({ autoReplyRules: [...state.autoReplyRules, createDefaultAutoReplyRule()] })),
      updateAutoReplyRule: (ruleId, patch) => set((state) => ({
        autoReplyRules: state.autoReplyRules.map((item) => item.id === ruleId ? { ...item, ...patch } : item)
      })),
      removeAutoReplyRule: (ruleId) => set((state) => ({
        autoReplyRules: state.autoReplyRules.length <= 1 ? state.autoReplyRules : state.autoReplyRules.filter((item) => item.id !== ruleId)
      }))
    }),
    {
      name: 'tg-group-direct-message-store',
      version: 1,
      storage: createJSONStorage(() => window.localStorage)
    }
  )
)
