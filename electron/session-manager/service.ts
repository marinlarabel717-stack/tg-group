import { Api, utils } from 'telegram'
import bigInt from 'big-integer'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type {
  SessionManagerActionKind,
  SessionManagerActionPayload,
  SessionManagerActionResult,
  SessionManagerActionResultItem,
  SessionManagerLogEntry,
  SessionManagerProgressState
} from '../../src/types'

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyState(): SessionManagerProgressState {
  return {
    running: false,
    action: null,
    total: 0,
    completed: 0,
    successCount: 0,
    failedCount: 0,
    currentAccountId: null,
    currentPhone: null,
    logs: [],
    lastUpdatedAt: null
  }
}

function trimLogs(logs: SessionManagerLogEntry[], maxNonErrorLogs = 240) {
  let removableRegularLogs = Math.max(0, logs.filter((log) => log.level !== 'error').length - maxNonErrorLogs)
  if (removableRegularLogs <= 0) return logs

  return logs.filter((log) => {
    if (log.level === 'error') return true
    if (removableRegularLogs > 0) {
      removableRegularLogs -= 1
      return false
    }
    return true
  })
}

function readAccountLabel(account: AccountRecord) {
  if (account.phone?.trim()) return account.phone.trim()
  if (account.username?.trim()) return account.username.trim()
  return `账号#${account.id}`
}

function toClientProxy(proxy: AccountCheckProxy | null): AccountClientProxyOptions | null {
  if (!proxy) return null
  return {
    type: proxy.type,
    ip: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    ipVersion: proxy.ipVersion
  }
}

function normalizeTargetRef(input: string) {
  const raw = input.trim()
  if (!raw) return null

  const inviteMatched = raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
  if (inviteMatched?.[1]) return { kind: 'invite' as const, value: inviteMatched[1].trim(), raw }

  const publicMatched = raw.match(/(?:https?:\/\/)?t\.me\/([^/?#]+)/i)
  if (publicMatched?.[1]) {
    const value = publicMatched[1].trim()
    if (/^-?\d+$/.test(value)) return { kind: 'peer' as const, value: Number(value), raw }
    return { kind: 'username' as const, value: value.startsWith('@') ? value : `@${value.replace(/^@+/, '')}`, raw }
  }

  if (/^\+?\d{6,15}$/.test(raw)) return { kind: 'phone' as const, value: raw.replace(/^\+/, ''), raw }
  if (/^-?\d+$/.test(raw)) return { kind: 'peer' as const, value: Number(raw), raw }
  return { kind: 'username' as const, value: raw.startsWith('@') ? raw : `@${raw.replace(/^@+/, '')}`, raw }
}

async function ensureAuthorizedClient(
  account: AccountRecord,
  sessionLoader: SessionLoader,
  clientManager: TelegramClientManager,
  proxyPoolService: ProxyPoolService
) {
  const session = await sessionLoader.load(account.sessionPath)
  const proxy = proxyPoolService.isEnabled() ? proxyPoolService.getAccountCheckProxy() : null
  if (proxyPoolService.isEnabled() && !proxy) {
    throw new Error('GLOBAL_PROXY_REQUIRED')
  }

  const client = clientManager.createClient(session, {
    proxy: toClientProxy(proxy)
  })

  try {
    await client.connect()
    const authorized = await client.isUserAuthorized()
    if (!authorized) {
      throw new Error('AUTH_KEY_UNREGISTERED')
    }
    return client
  } catch (error) {
    await clientManager.destroyClient(client).catch(() => undefined)
    throw error
  }
}

async function resolvePeerEntity(client: TelegramClient, targetRef: string) {
  const parsed = normalizeTargetRef(targetRef)
  if (!parsed) {
    throw new Error('TARGET_REQUIRED')
  }

  if (parsed.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }))
    if ((invite as { className?: string }).className === 'ChatInviteAlready') {
      return (invite as { chat?: unknown }).chat ?? null
    }
    throw new Error('USER_NOT_PARTICIPANT')
  }

  if (parsed.kind === 'peer') {
    return await client.getEntity(parsed.value as never)
  }

  if (parsed.kind === 'phone') {
    const imported = await client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({
        clientId: bigInt(Date.now()),
        phone: parsed.value,
        firstName: 'TG',
        lastName: 'Matrix'
      })]
    }))
    const user = Array.isArray((imported as { users?: unknown[] }).users) ? (imported as { users: unknown[] }).users[0] : null
    if (!user) throw new Error('PHONE_NUMBER_INVALID')
    return user
  }

  return await client.getEntity(parsed.value as never)
}

async function resolveUserInput(client: TelegramClient, targetRef: string) {
  const entity = await resolvePeerEntity(client, targetRef)
  const inputPeer = await client.getInputEntity(entity as never)
  return utils.getInputUser(inputPeer)
}

function isGroupLikeEntity(entity: unknown) {
  const className = String((entity as { className?: string } | null)?.className || '')
  return className.includes('Channel') || className === 'Chat'
}

function isPrivateDialogEntity(entity: unknown) {
  const className = String((entity as { className?: string } | null)?.className || '')
  if (className === 'Chat' || className.includes('Channel')) return false
  if (className === 'UserEmpty') return false
  return Boolean(className)
}

function readDialogEntityId(dialog: any) {
  const dialogId = typeof dialog?.id?.toString === 'function'
    ? dialog.id.toString()
    : String(dialog?.entity?.id ?? '')
  const accessHash = dialog?.entity?.accessHash?.toString?.() ?? dialog?.entity?.access_hash?.toString?.() ?? ''
  const username = typeof dialog?.entity?.username === 'string' ? dialog.entity.username.trim().toLowerCase() : ''
  return `${dialogId}::${accessHash}::${username}`
}

async function loadDialogsWithFallback(client: TelegramClient) {
  const dialogs: any[] = []
  const seen = new Set<string>()

  const pushDialog = (dialog: any) => {
    const key = readDialogEntityId(dialog)
    if (!key || seen.has(key)) return
    seen.add(key)
    dialogs.push(dialog)
  }

  for (const archived of [false, true]) {
    for await (const dialog of client.iterDialogs({ archived })) {
      pushDialog(dialog)
    }
  }

  if (dialogs.length > 0) {
    return dialogs
  }

  const dialogClient = client as TelegramClient & {
    getDialogs?: (params: { limit: number; archived?: boolean }) => Promise<any[]>
  }

  if (typeof dialogClient.getDialogs === 'function') {
    for (const archived of [false, true]) {
      const fallbackDialogs = await dialogClient.getDialogs({ limit: 5000, archived })
      for (const dialog of Array.isArray(fallbackDialogs) ? fallbackDialogs : []) {
        pushDialog(dialog)
      }
    }
  }

  return dialogs
}

async function deleteMessages(client: TelegramClient, targetRef: string, messageIds: number[]) {
  if (messageIds.length === 0) {
    throw new Error('MESSAGE_IDS_REQUIRED')
  }
  const entity = await resolvePeerEntity(client, targetRef)
  await client.deleteMessages(entity as never, messageIds, { revoke: true })
  return `已删除 ${messageIds.length} 条消息。`
}

async function deleteDialog(client: TelegramClient, targetRef: string) {
  const entity = await resolvePeerEntity(client, targetRef)
  const inputPeer = await client.getInputEntity(entity as never)
  await client.invoke(new Api.messages.DeleteHistory({
    peer: inputPeer as never,
    maxId: 0,
    justClear: true,
    revoke: false
  }))
  return '已删除当前账号侧的会话。'
}

async function clearHistory(client: TelegramClient, targetRef: string) {
  const entity = await resolvePeerEntity(client, targetRef)
  const inputPeer = await client.getInputEntity(entity as never)
  await client.invoke(new Api.messages.DeleteHistory({
    peer: inputPeer as never,
    maxId: 0,
    justClear: false,
    revoke: true
  }))
  return '已清空聊天记录。'
}

async function deleteContact(client: TelegramClient, targetRef: string) {
  const inputUser = await resolveUserInput(client, targetRef)
  await client.invoke(new Api.contacts.DeleteContacts({
    id: [inputUser]
  }))
  return '已删除联系人。'
}

async function leaveChat(client: TelegramClient, targetRef: string) {
  const entity = await resolvePeerEntity(client, targetRef)
  const inputPeer = await client.getInputEntity(entity as never)
  const className = String((entity as { className?: string } | null)?.className || '')
  if (className.includes('Channel')) {
    await client.invoke(new Api.channels.LeaveChannel({ channel: inputPeer as never }))
    return '已退出群组/频道。'
  }

  if (className === 'Chat') {
    await client.invoke(new Api.messages.DeleteChatUser({
      chatId: bigInt(Number((entity as { id?: unknown }).id)),
      userId: new Api.InputUserSelf(),
      revokeHistory: false
    }))
    return '已退出群组。'
  }

  throw new Error('TARGET_NOT_GROUP')
}

async function clearDialogHistoryByEntity(client: TelegramClient, entity: unknown) {
  const inputPeer = await client.getInputEntity(entity as never)
  await client.invoke(new Api.messages.DeleteHistory({
    peer: inputPeer as never,
    maxId: 0,
    justClear: true,
    revoke: false
  }))
}

async function leaveGroupLikeEntity(client: TelegramClient, entity: unknown) {
  const inputPeer = await client.getInputEntity(entity as never)
  const className = String((entity as { className?: string } | null)?.className || '')
  if (className.includes('Channel')) {
    await client.invoke(new Api.channels.LeaveChannel({ channel: inputPeer as never }))
    return
  }

  if (className === 'Chat') {
    await client.invoke(new Api.messages.DeleteChatUser({
      chatId: bigInt(Number((entity as { id?: unknown }).id)),
      userId: new Api.InputUserSelf(),
      revokeHistory: false
    }))
    return
  }

  throw new Error('TARGET_NOT_GROUP')
}

function formatSessionManagerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '未知错误'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '当前账号登录已失效'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '当前已开启全局代理，但没有可用代理'
  if (/TARGET_REQUIRED/i.test(normalized)) return '目标不能为空'
  if (/PHONE_NUMBER_INVALID/i.test(normalized)) return '手机号格式不正确或账号里找不到这个联系人'
  if (/USER_NOT_PARTICIPANT/i.test(normalized)) return '当前账号还没加入这个群/频道，没法直接管理'
  if (/MESSAGE_IDS_REQUIRED/i.test(normalized)) return '请先填写要删除的消息 ID'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '当前账号没有权限执行这个操作'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '无法访问这个群/频道，请确认账号权限'
  if (/PEER_ID_INVALID|CHANNEL_INVALID|CHAT_ID_INVALID/i.test(normalized)) return '目标会话格式不正确'
  if (/CONTACT_ID_INVALID/i.test(normalized)) return '当前账号里没有这个联系人'
  if (/TARGET_NOT_GROUP/i.test(normalized)) return '这个目标不是群组或频道'
  if (/CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL/i.test(normalized)) return '当前账号在这个会话里受限'
  if (/Too many requests/i.test(normalized)) return '请求过于频繁，请稍后再试'
  return normalized
}

function readActionLabel(action: SessionManagerActionKind) {
  if (action === 'delete-messages') return '删除消息'
  if (action === 'delete-dialog') return '删除对话'
  if (action === 'clear-history') return '删除聊天记录'
  if (action === 'delete-contact') return '删除联系人'
  if (action === 'leave-chat') return '退出群组/频道'
  if (action === 'wipe-all-dialogs') return '删除所有聊天对话'
  if (action === 'wipe-all-groups') return '删除所有群组频道'
  if (action === 'wipe-all-contacts') return '删除所有联系人'
  return '一键删除所有聊天-群组-频道-联系人'
}

function readActionIntro(action: SessionManagerActionKind) {
  if (action === 'wipe-all-dialogs') return '开始清理账号上的所有聊天对话。'
  if (action === 'wipe-all-groups') return '开始清理账号里的所有群组和频道（含归档）。'
  if (action === 'wipe-all-contacts') return '开始清理账号里的所有联系人。'
  if (action === 'wipe-all-everything') return '开始执行一键总清理：聊天、群组频道、联系人都会处理。'
  return '开始执行定向会话管理动作。'
}

function summarizeCleanup(action: SessionManagerActionKind, details: { dialogs?: number; groups?: number; contacts?: number; failed: number }) {
  if (action === 'wipe-all-dialogs') {
    return `聊天对话清理完成：已处理 ${details.dialogs ?? 0} 个，失败 ${details.failed} 个。`
  }
  if (action === 'wipe-all-groups') {
    return `群组频道清理完成：已处理 ${details.groups ?? 0} 个，失败 ${details.failed} 个。`
  }
  if (action === 'wipe-all-contacts') {
    return `联系人清理完成：已处理 ${details.contacts ?? 0} 个，失败 ${details.failed} 个。`
  }
  return `一键总清理完成：聊天 ${details.dialogs ?? 0} 个，群组频道 ${details.groups ?? 0} 个，联系人 ${details.contacts ?? 0} 个，失败 ${details.failed} 个。`
}

export class SessionManagerService {
  private state = createEmptyState()
  private progressSink: ((state: SessionManagerProgressState) => void) | null = null

  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  setProgressSink(sink: ((state: SessionManagerProgressState) => void) | null) {
    this.progressSink = sink
  }

  getState() {
    return this.state
  }

  clearLogs() {
    this.state = {
      ...this.state,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
    return this.state
  }

  private updateState(patch: Partial<SessionManagerProgressState>) {
    this.state = {
      ...this.state,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  private pushLog(entry: Omit<SessionManagerLogEntry, 'id' | 'createdAt'>) {
    this.state = {
      ...this.state,
      logs: trimLogs([...this.state.logs, {
        id: createId('session_manager_log'),
        createdAt: new Date().toISOString(),
        ...entry
      }]),
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  private bumpCounters(kind: 'success' | 'failed') {
    this.state = {
      ...this.state,
      completed: this.state.completed + 1,
      successCount: this.state.successCount + (kind === 'success' ? 1 : 0),
      failedCount: this.state.failedCount + (kind === 'failed' ? 1 : 0),
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  private async cleanupAllDialogs(client: TelegramClient) {
    const dialogs = (await loadDialogsWithFallback(client)).filter((dialog) => isPrivateDialogEntity(dialog?.entity) && !dialog?.entity?.self)
    let failed = 0

    for (const dialog of dialogs) {
      try {
        await clearDialogHistoryByEntity(client, dialog.entity)
      } catch {
        failed += 1
      }
    }

    return { dialogs: dialogs.length, failed }
  }

  private async cleanupAllGroups(client: TelegramClient) {
    const dialogs = (await loadDialogsWithFallback(client)).filter((dialog) => isGroupLikeEntity(dialog?.entity))
    let failed = 0

    for (const dialog of dialogs) {
      try {
        await clearDialogHistoryByEntity(client, dialog.entity).catch(() => undefined)
        await leaveGroupLikeEntity(client, dialog.entity)
      } catch {
        failed += 1
      }
    }

    return { groups: dialogs.length, failed }
  }

  private async cleanupAllContacts(client: TelegramClient) {
    const response = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt.zero }))
    const users = Array.isArray((response as { users?: unknown[] }).users) ? (response as { users: any[] }).users : []
    const inputUsers = users
      .map((user) => {
        try {
          return utils.getInputUser(user)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    let failed = 0
    for (let index = 0; index < inputUsers.length; index += 100) {
      const chunk = inputUsers.slice(index, index + 100)
      try {
        await client.invoke(new Api.contacts.DeleteContacts({ id: chunk as never[] }))
      } catch {
        failed += chunk.length
      }
    }

    return { contacts: inputUsers.length, failed }
  }

  private async runAccountWideCleanup(account: AccountRecord, action: SessionManagerActionKind) {
    let client: TelegramClient | null = null
    try {
      client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
      const accountLabel = readAccountLabel(account)
      this.pushLog({
        level: 'info',
        accountId: account.id,
        accountPhone: accountLabel,
        message: readActionIntro(action)
      })

      let details = { dialogs: 0, groups: 0, contacts: 0, failed: 0 }
      if (action === 'wipe-all-dialogs') {
        const result = await this.cleanupAllDialogs(client)
        details = { dialogs: result.dialogs, groups: 0, contacts: 0, failed: result.failed }
      } else if (action === 'wipe-all-groups') {
        const result = await this.cleanupAllGroups(client)
        details = { dialogs: 0, groups: result.groups, contacts: 0, failed: result.failed }
      } else if (action === 'wipe-all-contacts') {
        const result = await this.cleanupAllContacts(client)
        details = { dialogs: 0, groups: 0, contacts: result.contacts, failed: result.failed }
      } else {
        const dialogs = await this.cleanupAllDialogs(client)
        const groups = await this.cleanupAllGroups(client)
        const contacts = await this.cleanupAllContacts(client)
        details = {
          dialogs: dialogs.dialogs,
          groups: groups.groups,
          contacts: contacts.contacts,
          failed: dialogs.failed + groups.failed + contacts.failed
        }
      }

      const message = summarizeCleanup(action, details)
      this.pushLog({
        level: details.failed > 0 ? 'warning' : 'success',
        accountId: account.id,
        accountPhone: accountLabel,
        message
      })

      return {
        accountId: account.id,
        accountLabel,
        targetRef: readActionLabel(action),
        success: details.failed === 0,
        message
      } satisfies SessionManagerActionResultItem
    } finally {
      if (client) {
        await this.clientManager.destroyClient(client).catch(() => undefined)
      }
    }
  }

  async runAction(payload: SessionManagerActionPayload): Promise<SessionManagerActionResult> {
    if (this.state.running) {
      throw new Error('当前已经有一个账号清理任务正在执行，请等它完成后再试。')
    }

    const action = payload.action
    const targetRefs = Array.from(new Set((payload.targetRefs || []).map((item) => item.trim()).filter(Boolean)))
    const accountIds = Array.from(new Set((payload.accountIds || []).filter((item) => Number.isFinite(item))))
    const accounts = this.repository.getByIds(accountIds)
    const results: SessionManagerActionResultItem[] = []
    const messageIds = Array.from(new Set((payload.messageIds || []).map((item) => Math.trunc(item)).filter((item) => Number.isFinite(item) && item > 0)))

    if (accounts.length === 0) {
      throw new Error('请先选择至少一个账号。')
    }

    const isAccountWideAction = action === 'wipe-all-dialogs' || action === 'wipe-all-groups' || action === 'wipe-all-contacts' || action === 'wipe-all-everything'
    if (!isAccountWideAction && targetRefs.length === 0) {
      throw new Error('请先填写至少一个目标。')
    }

    this.state = {
      running: true,
      action,
      total: isAccountWideAction ? accounts.length : accounts.length * targetRefs.length,
      completed: 0,
      successCount: 0,
      failedCount: 0,
      currentAccountId: null,
      currentPhone: null,
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)

    this.pushLog({
      level: 'info',
      accountId: null,
      accountPhone: '',
      message: `${readActionLabel(action)}已启动：本轮共 ${accounts.length} 个账号。`
    })

    try {
      for (const account of accounts) {
        const accountLabel = readAccountLabel(account)
        this.updateState({ currentAccountId: account.id, currentPhone: accountLabel })

        if (isAccountWideAction) {
          try {
            const item = await this.runAccountWideCleanup(account, action)
            results.push(item)
            this.bumpCounters(item.success ? 'success' : 'failed')
          } catch (error) {
            const message = formatSessionManagerError(error)
            this.pushLog({ level: 'error', accountId: account.id, accountPhone: accountLabel, message })
            results.push({ accountId: account.id, accountLabel, targetRef: readActionLabel(action), success: false, message })
            this.bumpCounters('failed')
          }
          continue
        }

        let client: TelegramClient | null = null
        try {
          client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
          for (const targetRef of targetRefs) {
            try {
              const message = action === 'delete-messages'
                ? await deleteMessages(client, targetRef, messageIds)
                : action === 'delete-dialog'
                  ? await deleteDialog(client, targetRef)
                  : action === 'clear-history'
                    ? await clearHistory(client, targetRef)
                    : action === 'delete-contact'
                      ? await deleteContact(client, targetRef)
                      : await leaveChat(client, targetRef)

              results.push({ accountId: account.id, accountLabel, targetRef, success: true, message })
              this.pushLog({ level: 'success', accountId: account.id, accountPhone: accountLabel, message: `${targetRef}：${message}` })
              this.bumpCounters('success')
            } catch (error) {
              const message = formatSessionManagerError(error)
              results.push({ accountId: account.id, accountLabel, targetRef, success: false, message })
              this.pushLog({ level: 'error', accountId: account.id, accountPhone: accountLabel, message: `${targetRef}：${message}` })
              this.bumpCounters('failed')
            }
          }
        } finally {
          if (client) {
            await this.clientManager.destroyClient(client).catch(() => undefined)
          }
        }
      }

      const successCount = results.filter((item) => item.success).length
      const failedCount = results.length - successCount
      const message = `${readActionLabel(action)}完成：成功 ${successCount}，失败 ${failedCount}。`
      this.pushLog({ level: failedCount > 0 ? 'warning' : 'success', accountId: null, accountPhone: '', message })
      return {
        action,
        total: results.length,
        successCount,
        failedCount,
        items: results,
        message
      }
    } finally {
      this.updateState({
        running: false,
        currentAccountId: null,
        currentPhone: null
      })
    }
  }
}
