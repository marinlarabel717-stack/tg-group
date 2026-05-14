import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  DirectMessageAutoReplyEvent,
  DirectMessageAutoReplyState,
  DirectMessageCollectedUserPayload,
  DirectMessageSendResult,
  DirectMessageStopResult
} from '../types'

export type DirectMessageTabKey = 'send' | 'logs' | 'collect' | 'auto-reply'
export type DirectMessageMessageType = 'text' | 'channel_forward' | 'hidden_channel_forward' | 'postbot_code'
export type DirectMessageSendMode = 'username' | 'contact' | 'txt'
export type DirectMessageCollectorMode = 'manual' | 'contact' | 'group_members' | 'comment_users' | 'react_users'
export type DirectMessagePreviewStatus = 'queued' | 'sent' | 'failed'
export type DirectMessageDeleteMode = 'none' | 'self' | 'both'

export interface DirectMessageTargetRecord {
  id: string
  value: string
  normalizedValue: string
  valid: boolean
  duplicate: boolean
  source: 'manual' | 'file' | 'collect'
}

export interface DirectMessageTargetSummary {
  total: number
  valid: number
  invalid: number
  duplicate: number
}

export interface DirectMessageCollectedUser {
  id: string
  value: string
  normalizedValue: string
  sourceLabel: string
  importedAt: string
  userId?: string
  username?: string
  phone?: string
}

export interface DirectMessagePreviewItem {
  id: string
  targetId: string
  targetValue: string
  accountId: number | null
  accountLabel: string
  accountPhone: string
  status: DirectMessagePreviewStatus
  waitSeconds: number
  batchIndex: number
  errorMessage: string
  remoteMessageId: number | null
  sentAt: string | null
}

export interface DirectMessageRunItem {
  id: string
  targetValue: string
  accountLabel: string
  accountPhone: string
  messageType: DirectMessageMessageType
  sequence: number
  status: 'sent' | 'failed'
  message: string
  remoteMessageId?: number | null
  sentAt?: string | null
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

const EMPTY_AUTO_REPLY_STATE: DirectMessageAutoReplyState = {
  enabled: false,
  accountIds: [],
  activeCount: 0,
  ruleCount: 0,
  startedAt: null
}

const EMPTY_TARGET_SUMMARY: DirectMessageTargetSummary = {
  total: 0,
  valid: 0,
  invalid: 0,
  duplicate: 0
}

interface DirectMessageState {
  activeTab: DirectMessageTabKey
  sendMode: DirectMessageSendMode
  messageType: DirectMessageMessageType
  collectorMode: DirectMessageCollectorMode
  selectedAccountIds: number[]
  selectedAccountId: number | null
  targetInput: string
  targetSummary: DirectMessageTargetSummary
  collectorInput: string
  targets: DirectMessageTargetRecord[]
  collectedUsers: DirectMessageCollectedUser[]
  messageText: string
  imageUrl: string
  imageName: string
  sourceLink: string
  postbotCode: string
  deleteMode: DirectMessageDeleteMode
  groupConcurrency: number
  accountPerGroup: number
  intervalSeconds: number
  dedupeEnabled: boolean
  autoReplyEnabled: boolean
  previewItems: DirectMessagePreviewItem[]
  runs: DirectMessageRun[]
  autoReplyRules: DirectMessageAutoReplyRule[]
  autoReplyState: DirectMessageAutoReplyState
  autoReplyEvents: DirectMessageAutoReplyEvent[]
  sending: boolean
  stopping: boolean
  runningAccountIds: number[]
  collecting: boolean
  autoReplySyncing: boolean
  runtimeReady: boolean
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
  setSourceLink: (value: string) => void
  setPostbotCode: (value: string) => void
  setDeleteMode: (value: DirectMessageDeleteMode) => void
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
  collectUsersFromSource: () => Promise<void>
  appendCollectedUsersToTargets: () => void
  clearCollectedUsers: () => void
  generatePreview: (accounts: Array<{ id: number; username?: string; phone?: string; profile?: Record<string, unknown> }>) => void
  startSend: (accounts: Array<{ id: number; username?: string; phone?: string; profile?: Record<string, unknown> }>) => Promise<void>
  stopSend: () => Promise<void>
  clearPreview: () => void
  clearRuns: () => void
  initRuntime: () => Promise<void>
  syncAutoReply: () => Promise<void>
  clearAutoReplyEvents: () => void
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
  if (/^@?[a-zA-Z0-9_]{5,}$/i.test(value)) return `@${value.replace(/^@+/, '').toLowerCase()}`
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
  const targets: DirectMessageTargetRecord[] = []
  let invalid = 0
  let duplicate = 0

  for (const record of records) {
    const normalizedValue = normalizeTargetValue(record.value)
    const valid = isValidTargetValue(record.value)
    if (!valid || !normalizedValue) {
      invalid += 1
      continue
    }
    if (seen.has(normalizedValue)) {
      duplicate += 1
      continue
    }
    seen.add(normalizedValue)
    targets.push({
      id: createId('dm_target'),
      value: /^@?[a-zA-Z0-9_]{5,}$/i.test(record.value) && !record.value.startsWith('@') ? `@${record.value}` : record.value,
      normalizedValue,
      valid: true,
      duplicate: false,
      source: record.source
    })
  }

  return {
    targets,
    summary: {
      total: records.length,
      valid: targets.length,
      invalid,
      duplicate
    }
  }
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

function parsePostbotCode(code: string) {
  const raw = code.trim()
  if (!raw) return { text: '', imageUrl: '', buttonText: '', buttonUrl: '' }

  const normalized = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    const text = [parsed.text, parsed.message, parsed.caption, parsed.content].find((item) => typeof item === 'string' && item.trim())
    const imageUrl = [parsed.imageUrl, parsed.image, parsed.photo, parsed.media].find((item) => typeof item === 'string' && item.trim())
    const buttonText = [parsed.buttonText, parsed.button_title, parsed.buttonLabel].find((item) => typeof item === 'string' && item.trim())
    const buttonUrl = [parsed.buttonUrl, parsed.url, parsed.link].find((item) => typeof item === 'string' && item.trim())
    return {
      text: typeof text === 'string' ? text.trim() : '',
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
      buttonText: typeof buttonText === 'string' ? buttonText.trim() : '',
      buttonUrl: typeof buttonUrl === 'string' ? buttonUrl.trim() : ''
    }
  } catch {
    return { text: normalized, imageUrl: '', buttonText: '', buttonUrl: '' }
  }
}

function mapCollectedUsers(items: DirectMessageCollectedUserPayload[]) {
  return items.map((item) => ({
    id: createId('dm_collect'),
    value: item.value,
    normalizedValue: item.normalizedValue,
    sourceLabel: item.sourceLabel,
    importedAt: new Date().toISOString(),
    userId: item.userId,
    username: item.username,
    phone: item.phone
  }))
}

function readMessageTypeLabel(messageType: DirectMessageMessageType) {
  if (messageType === 'channel_forward') return '频道转发'
  if (messageType === 'hidden_channel_forward') return '隐藏频道来源转发'
  if (messageType === 'postbot_code') return 'post图文+按钮'
  return '文本直发'
}

function buildRunFromResult(result: DirectMessageSendResult, state: Pick<DirectMessageState, 'selectedAccountIds' | 'previewItems' | 'messageType'>): DirectMessageRun {
  const previewById = new Map(state.previewItems.map((item) => [item.id, item]))
  return {
    id: createId('dm_run'),
    createdAt: new Date().toISOString(),
    total: result.total,
    sent: result.successCount,
    failed: result.failedCount,
    accountCount: state.selectedAccountIds.length,
    summary: `${readMessageTypeLabel(state.messageType)} · ${result.message}`,
    items: result.items.map((item, index) => ({
      id: createId('dm_run_item'),
      targetValue: item.targetValue,
      accountLabel: previewById.get(item.previewItemId)?.accountLabel || '未知账号',
      accountPhone: previewById.get(item.previewItemId)?.accountPhone || '未知手机号',
      messageType: state.messageType,
      sequence: index + 1,
      status: item.status,
      message: item.errorMessage || (item.status === 'sent' ? '已成功发出私信。' : '发送失败。'),
      remoteMessageId: item.remoteMessageId,
      sentAt: item.sentAt
    }))
  }
}

let subscribed = false

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
      targetSummary: EMPTY_TARGET_SUMMARY,
      collectorInput: '',
      targets: [],
      collectedUsers: [],
      messageText: '',
      imageUrl: '',
      imageName: '',
      sourceLink: '',
      postbotCode: '',
      deleteMode: 'none',
      groupConcurrency: 3,
      accountPerGroup: 5,
      intervalSeconds: 25,
      dedupeEnabled: true,
      autoReplyEnabled: false,
      previewItems: [],
      runs: [],
      autoReplyRules: [createDefaultAutoReplyRule()],
      autoReplyState: EMPTY_AUTO_REPLY_STATE,
      autoReplyEvents: [],
      sending: false,
      stopping: false,
      runningAccountIds: [],
      collecting: false,
      autoReplySyncing: false,
      runtimeReady: false,
      lastActionMessage: '先选账号，再导入目标用户。',
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSendMode: (mode) => set({ sendMode: mode }),
      setCollectorMode: (mode) => set({ collectorMode: mode }),
      setMessageType: (value) => set({ messageType: value }),
      setTargetInput: (value) => {
        const incoming = tokenizeText(value).map((item) => ({ value: item, source: 'manual' as const }))
        const { targets, summary } = rebuildTargetRecords(incoming)
        set({
          targetInput: targets.map((item) => item.value).join('\n'),
          targetSummary: summary,
          targets,
          dedupeEnabled: true,
          previewItems: [],
          lastActionMessage: targets.length === 0
            ? '没有识别到可用目标。'
            : `已自动整理 ${summary.total} 个目标，可发送 ${summary.valid} 个，清掉重复 ${summary.duplicate} 个、格式不对 ${summary.invalid} 个。`
        })
      },
      setCollectorInput: (value) => set({ collectorInput: value }),
      setMessageText: (value) => set({ messageText: value }),
      setImagePayload: ({ url, name }) => set({ imageUrl: url, imageName: name || '', previewItems: [] }),
      clearImage: () => set({ imageUrl: '', imageName: '', previewItems: [] }),
      setSourceLink: (value) => set({ sourceLink: value, previewItems: [] }),
      setPostbotCode: (value) => set({ postbotCode: value, previewItems: [] }),
      setDeleteMode: (value) => set({ deleteMode: value, previewItems: [] }),
      setGroupConcurrency: (value) => set({ groupConcurrency: Math.max(1, value || 1) }),
      setAccountPerGroup: (value) => set({ accountPerGroup: Math.max(1, value || 1), previewItems: [] }),
      setIntervalSeconds: (value) => set({ intervalSeconds: Math.max(5, value || 5), previewItems: [] }),
      setDedupeEnabled: (value) => set({ dedupeEnabled: value, previewItems: [] }),
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
        const { targets, summary } = rebuildTargetRecords([...current, ...incoming])
        set({
          targets,
          targetSummary: summary,
          targetInput: targets.map((item) => item.value).join('\n'),
          dedupeEnabled: true,
          previewItems: [],
          lastActionMessage: targets.length === 0 ? '没有识别到可用目标。' : `已自动整理 ${summary.total} 个目标，可发送 ${summary.valid} 个，清掉重复 ${summary.duplicate} 个、格式不对 ${summary.invalid} 个。`
        })
        return summary
      },
      removeTarget: (targetId) => set((state) => {
        const { targets, summary } = rebuildTargetRecords(state.targets.filter((item) => item.id !== targetId).map((item) => ({ value: item.value, source: item.source })))
        return { targets, targetSummary: summary, targetInput: targets.map((item) => item.value).join('\n'), previewItems: [] }
      }),
      clearTargets: () => set({ targets: [], targetSummary: EMPTY_TARGET_SUMMARY, targetInput: '', previewItems: [], lastActionMessage: '目标用户已清空。' }),
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
      collectUsersFromSource: async () => {
        const state = get()
        if (!window.desktopDirectMessage) {
          set({ lastActionMessage: '当前环境没有接入私信采集能力。' })
          return
        }
        const accountId = state.selectedAccountId ?? state.selectedAccountIds[0] ?? null
        if (!accountId) {
          set({ lastActionMessage: '先选一个账号，再去采集用户。' })
          return
        }
        if (state.collectorMode === 'manual') {
          set({ lastActionMessage: '手工模式直接贴名单后点“识别名单”就行，不走 Telegram 实时采集。' })
          return
        }
        if ((state.collectorMode === 'group_members' || state.collectorMode === 'comment_users' || state.collectorMode === 'react_users') && !state.collectorInput.trim()) {
          set({ lastActionMessage: '先把群链接或消息链接贴上，再开始采集。' })
          return
        }

        set({ collecting: true, lastActionMessage: '正在读取 Telegram 里的目标用户，请稍候...' })
        try {
          const result = await window.desktopDirectMessage.collectUsers({
            accountId,
            mode: state.collectorMode,
            source: state.collectorInput.trim(),
            limit: 200
          })
          const existing = new Set(state.collectedUsers.map((item) => item.normalizedValue))
          const merged = [...mapCollectedUsers(result.items).filter((item) => !existing.has(item.normalizedValue)), ...state.collectedUsers]
          set({
            collecting: false,
            collectedUsers: merged,
            lastActionMessage: result.message
          })
        } catch (error) {
          set({
            collecting: false,
            lastActionMessage: error instanceof Error ? error.message : String(error)
          })
        }
      },
      appendCollectedUsersToTargets: () => {
        const state = get()
        if (state.collectedUsers.length === 0) {
          set({ lastActionMessage: '还没有采集到可加入发送的用户。' })
          return
        }
        const { targets, summary } = rebuildTargetRecords([
          ...state.targets.map((item) => ({ value: item.value, source: item.source })),
          ...state.collectedUsers.map((item) => ({ value: item.value, source: 'collect' as const }))
        ])
        set({
          targets,
          targetSummary: summary,
          targetInput: targets.map((item) => item.value).join('\n'),
          dedupeEnabled: true,
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
        if (state.messageType === 'text' && !state.messageText.trim()) {
          set({ previewItems: [], lastActionMessage: '文本直发要先填内容。' })
          return
        }
        if ((state.messageType === 'channel_forward' || state.messageType === 'hidden_channel_forward') && !state.sourceLink.trim()) {
          set({ previewItems: [], lastActionMessage: '先把频道消息链接填上。' })
          return
        }
        if (state.messageType === 'postbot_code' && !state.postbotCode.trim()) {
          set({ previewItems: [], lastActionMessage: '先把 postbot 生成代码填上。' })
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
            accountPhone: account?.phone?.trim() || '未识别手机号',
            status: 'queued' as const,
            waitSeconds: batchIndex * state.intervalSeconds,
            batchIndex,
            errorMessage: '',
            remoteMessageId: null,
            sentAt: null
          }
        })
        set({
          previewItems,
          lastActionMessage: `已生成 ${previewItems.length} 条私信预览，当前按每 ${state.intervalSeconds} 秒一批往后排。`
        })
      },
      startSend: async (accounts) => {
        let state = get()
        if (!window.desktopDirectMessage) {
          set({ lastActionMessage: '当前环境没有接入真实私信发送能力。' })
          return
        }
        if (state.previewItems.length === 0) {
          get().generatePreview(accounts)
          state = get()
        }
        if (state.previewItems.length === 0) {
          set({ lastActionMessage: '当前还不能直接发送，请先把账号、目标和文案填完整。' })
          return
        }
        set({
          sending: true,
          stopping: false,
          runs: [],
          runningAccountIds: Array.from(new Set(state.previewItems.map((item) => item.accountId).filter((item): item is number => typeof item === 'number'))),
          activeTab: 'logs',
          lastActionMessage: '正在把私信发到 Telegram，请稍候...'
        })
        try {
          const result = await window.desktopDirectMessage.sendMessages({
            items: state.previewItems.map((item) => ({
              id: item.id,
              targetId: item.targetId,
              targetValue: item.targetValue,
              accountId: item.accountId,
              waitSeconds: item.waitSeconds,
              batchIndex: item.batchIndex,
              status: item.status,
              errorMessage: item.errorMessage,
              remoteMessageId: item.remoteMessageId,
              sentAt: item.sentAt
            })),
            messageType: state.messageType,
            messageText: state.messageText,
            imageUrl: state.imageUrl,
            sourceLink: state.sourceLink,
            postbotCode: state.postbotCode,
            deleteMode: state.deleteMode,
            concurrency: state.groupConcurrency
          })
          const run = buildRunFromResult(result, state)
          set((current) => ({
            sending: false,
            stopping: false,
            runningAccountIds: [],
            ...(result.items.some((item) => item.status === 'sent')
              ? (() => {
                  const next = rebuildTargetRecords(current.targets
                    .filter((target) => !result.items.some((item) => item.status === 'sent' && item.targetId === target.id))
                    .map((target) => ({ value: target.value, source: target.source })))
                  return {
                    targets: next.targets,
                    targetSummary: next.summary,
                    targetInput: next.targets.map((target) => target.value).join('\n')
                  }
                })()
              : {
                  targets: current.targets,
                  targetSummary: current.targetSummary,
                  targetInput: current.targetInput
                }),
            runs: [run, ...current.runs],
            activeTab: 'logs',
            lastActionMessage: result.items.some((item) => item.status === 'sent')
              ? `${result.message} 发送成功的目标已自动从名单里移除。`
              : result.message
          }))
        } catch (error) {
          set({
            sending: false,
            stopping: false,
            runningAccountIds: [],
            lastActionMessage: error instanceof Error ? error.message : String(error)
          })
        }
      },
      stopSend: async () => {
        if (!window.desktopDirectMessage) {
          set({ lastActionMessage: '当前环境没有接入停止发送能力。' })
          return
        }
        if (!get().sending) {
          set({ lastActionMessage: '当前没有正在发送的私信任务。' })
          return
        }

        set({ stopping: true, lastActionMessage: '正在停止当前私信任务...' })
        try {
          const result: DirectMessageStopResult = await window.desktopDirectMessage.stopSend()
          set({
            sending: false,
            stopping: false,
            runningAccountIds: [],
            lastActionMessage: result.message
          })
        } catch (error) {
          set({
            stopping: false,
            lastActionMessage: error instanceof Error ? error.message : String(error)
          })
        }
      },
      clearPreview: () => set({ previewItems: [], lastActionMessage: '当前私信预览已清空。' }),
      clearRuns: () => set({ runs: [], lastActionMessage: '私信日志已清空。' }),
      initRuntime: async () => {
        if (!window.desktopDirectMessage || subscribed) {
          if (!window.desktopDirectMessage) set({ runtimeReady: false })
          return
        }
        subscribed = true
        window.desktopDirectMessage.onSendProgress((payload) => {
          set((state) => ({
            previewItems: payload.item ? state.previewItems.map((item) => item.id === payload.item?.previewItemId ? {
              ...item,
              status: payload.item.status,
              errorMessage: payload.item.errorMessage,
              remoteMessageId: payload.item.remoteMessageId,
              sentAt: payload.item.sentAt
            } : item) : state.previewItems,
            lastActionMessage: payload.message
          }))
        })
        window.desktopDirectMessage.onAutoReplyEvent((payload) => {
          set((state) => ({
            autoReplyEvents: [payload, ...state.autoReplyEvents].slice(0, 100),
            lastActionMessage: payload.status === 'replied'
              ? `自动回复已发送：${payload.senderLabel}`
              : `自动回复失败：${payload.errorMessage || '未知错误'}`
          }))
        })
        try {
          const autoReplyState = await window.desktopDirectMessage.getAutoReplyState()
          set({ runtimeReady: true, autoReplyState })
        } catch {
          set({ runtimeReady: true })
        }
      },
      syncAutoReply: async () => {
        const state = get()
        if (!window.desktopDirectMessage) {
          set({ lastActionMessage: '当前环境没有接入自动回复能力。' })
          return
        }
        set({ autoReplySyncing: true, lastActionMessage: '正在同步自动回复规则，请稍候...' })
        try {
          const autoReplyState = await window.desktopDirectMessage.configureAutoReply({
            accountIds: state.selectedAccountIds,
            enabled: state.autoReplyEnabled,
            rules: state.autoReplyRules.map((rule) => ({
              id: rule.id,
              keyword: rule.keyword,
              replyText: rule.replyText,
              enabled: rule.enabled,
              matchMode: rule.matchMode,
              cooldownSeconds: rule.cooldownSeconds
            }))
          })
          set({
            autoReplySyncing: false,
            autoReplyState,
            lastActionMessage: autoReplyState.enabled ? `自动回复已在 ${autoReplyState.activeCount} 个账号上启用。` : '自动回复已关闭。'
          })
        } catch (error) {
          set({
            autoReplySyncing: false,
            lastActionMessage: error instanceof Error ? error.message : String(error)
          })
        }
      },
      clearAutoReplyEvents: () => set({ autoReplyEvents: [] }),
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
      version: 6,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        sendMode: state.sendMode,
        messageType: state.messageType,
        collectorMode: state.collectorMode,
        targetInput: state.targetInput,
        targetSummary: state.targetSummary,
        collectorInput: state.collectorInput,
        targets: state.targets,
        collectedUsers: state.collectedUsers,
        messageText: state.messageText,
        imageUrl: state.imageUrl,
        imageName: state.imageName,
        sourceLink: state.sourceLink,
        postbotCode: state.postbotCode,
        deleteMode: state.deleteMode,
        groupConcurrency: state.groupConcurrency,
        accountPerGroup: state.accountPerGroup,
        intervalSeconds: state.intervalSeconds,
        dedupeEnabled: state.dedupeEnabled,
        autoReplyEnabled: state.autoReplyEnabled,
        previewItems: state.previewItems,
        runs: state.runs,
        autoReplyRules: state.autoReplyRules,
        lastActionMessage: state.lastActionMessage,
        autoReplyState: state.autoReplyState,
        autoReplyEvents: state.autoReplyEvents
      }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<DirectMessageState> | undefined
        const rebuiltTargets = rebuildTargetRecords((state?.targets || []).map((item) => ({ value: item.value, source: item.source })))
        return {
          activeTab: state?.activeTab || 'send',
          sendMode: state?.sendMode || 'username',
          messageType: state?.messageType || 'text',
          collectorMode: state?.collectorMode || 'manual',
          selectedAccountIds: [],
          selectedAccountId: null,
          targetInput: rebuiltTargets.targets.map((item) => item.value).join('\n'),
          targetSummary: rebuiltTargets.summary,
          collectorInput: state?.collectorInput || '',
          targets: rebuiltTargets.targets,
          collectedUsers: state?.collectedUsers || [],
          messageText: state?.messageText || '',
          imageUrl: state?.imageUrl || '',
          imageName: state?.imageName || '',
          sourceLink: state?.sourceLink || '',
          postbotCode: state?.postbotCode || '',
          deleteMode: state?.deleteMode === 'self' || state?.deleteMode === 'both' ? state.deleteMode : 'none',
          groupConcurrency: state?.groupConcurrency || 3,
          accountPerGroup: state?.accountPerGroup || 5,
          intervalSeconds: state?.intervalSeconds || 25,
          dedupeEnabled: true,
          autoReplyEnabled: typeof state?.autoReplyEnabled === 'boolean' ? state.autoReplyEnabled : false,
          previewItems: (state?.previewItems || []).map((item) => ({
            ...item,
            accountPhone: item.accountPhone || '未识别手机号',
            status: item.status === 'failed' ? 'failed' : item.status === 'sent' ? 'sent' : 'queued',
            errorMessage: item.errorMessage || '',
            remoteMessageId: item.remoteMessageId ?? null,
            sentAt: item.sentAt ?? null
          })),
          runs: state?.runs || [],
          autoReplyRules: state?.autoReplyRules || [createDefaultAutoReplyRule()],
          autoReplyState: EMPTY_AUTO_REPLY_STATE,
          autoReplyEvents: [],
          sending: false,
          stopping: false,
          runningAccountIds: [],
          collecting: false,
          autoReplySyncing: false,
          runtimeReady: false,
          lastActionMessage: state?.lastActionMessage || '先选账号，再导入目标用户。'
        }
      }
    }
  )
)
