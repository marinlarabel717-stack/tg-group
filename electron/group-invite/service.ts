import { Api, utils } from 'telegram'
import bigInt from 'big-integer'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type {
  GroupInviteLogEntry,
  GroupInvitePayload,
  GroupInviteProgressState,
  GroupInviteResultItem,
  GroupInviteStopResult,
  GroupInviteTargetItem,
  GroupInviteTaskResult
} from '../../src/types'

interface ActiveGroupInviteTask {
  cancelled: boolean
  clients: Map<number, TelegramClient>
  wakeWaiters: Set<() => void>
}

const EMPTY_STATE: GroupInviteProgressState = {
  running: false,
  stopRequested: false,
  total: 0,
  completed: 0,
  successCount: 0,
  failedCount: 0,
  currentAccountId: null,
  currentPhone: null,
  currentTargetValue: null,
  groupRef: '',
  groupTitle: '',
  runningAccountIds: [],
  logs: [],
  lastUpdatedAt: null
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function trimLogs(logs: GroupInviteLogEntry[]) {
  return logs.slice(-400)
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
  return clientManager.createClient(session, {
    proxy: toClientProxy(proxy)
  })
}

function readRequiredWaitSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const waitMatched = message.match(/A wait of (\d+) seconds is required/i)
  if (waitMatched?.[1]) {
    const seconds = Number(waitMatched[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }
  const floodMatched = message.match(/FLOOD_WAIT_(\d+)/i)
  if (floodMatched?.[1]) {
    const seconds = Number(floodMatched[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }
  return null
}

function isRetryableInviteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /TimeoutError|timed out|ETIMEDOUT|Request timed out|ECONNRESET|ENETUNREACH|NETWORK/i.test(message)
}

function isAlreadyParticipantError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /USER_ALREADY_PARTICIPANT/i.test(message)
}

function isInviteRequestSentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /INVITE_REQUEST_SENT/i.test(message)
}

function isFatalAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN|ACCOUNT_RESTRICTED|FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(message)
}

function formatInviteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '未知错误'
  if (/USER_PRIVACY_RESTRICTED/i.test(normalized)) return '用户隐私限制'
  if (/USER_ALREADY_PARTICIPANT/i.test(normalized)) return '用户已经在群组中'
  if (/USER_NOT_MUTUAL_CONTACT/i.test(normalized)) return '当前账号和目标用户不是双向联系人'
  if (/INPUT_USER_DEACTIVATED|USER_DEACTIVATED_BAN|PHONE_NUMBER_BANNED/i.test(normalized)) return '目标用户已注销或不可用'
  if (/USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '目标用户加入的群组数量过多'
  if (/USERS_TOO_MUCH/i.test(normalized)) return '目标群组当前不再接受更多成员'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '当前账号没有邀请权限'
  if (/CHAT_WRITE_FORBIDDEN|CHAT_RESTRICTED|USER_BANNED_IN_CHANNEL/i.test(normalized)) return '当前账号在目标群组受限'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '目标群邀请链接无效或已过期'
  if (/CHANNEL_INVALID|CHAT_ID_INVALID|TARGET_GROUP_INVALID/i.test(normalized)) return '目标群格式不正确'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '无法访问目标群，请确认链接或账号权限'
  if (/CHANNELS_TOO_MUCH/i.test(normalized)) return '当前账号加入的群组太多了'
  if (/INVITE_REQUEST_SENT/i.test(normalized)) return '已提交加群申请，需管理员通过后才能继续邀请'
  if (/USERNAME_INVALID/i.test(normalized)) return '用户名格式不正确'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '用户名不存在'
  if (/PHONE_NUMBER_INVALID/i.test(normalized)) return '手机号格式不正确'
  if (/PEER_FLOOD/i.test(normalized)) return '当前账号触发邀请风控'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '当前账号登录状态已失效'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '当前账号被 Telegram 限制'
  if (/FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(normalized)) return '当前账号已冻结'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理'
  if (/Too many requests/i.test(normalized)) return '请求过于频繁'
  const wait = readRequiredWaitSeconds(error)
  if (wait) return `触发频率限制，需等待 ${wait} 秒`
  return normalized
}

function normalizeGroupRef(input: string) {
  const raw = input.trim()
  if (!raw) return null
  const inviteMatched = raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
  if (inviteMatched?.[1]) return { kind: 'invite' as const, value: inviteMatched[1].trim() }
  const linkMatched = raw.match(/(?:https?:\/\/)?t\.me\/([^/?#]+)/i)
  const candidate = (linkMatched?.[1] ?? raw).trim()
  if (!candidate) return null
  if (/^-?\d+$/.test(candidate)) return { kind: 'peer' as const, value: Number(candidate) }
  return { kind: 'username' as const, value: candidate.startsWith('@') ? candidate : `@${candidate.replace(/^@+/, '')}` }
}

async function resolveGroupEntity(client: TelegramClient, groupRef: ReturnType<typeof normalizeGroupRef>) {
  if (!groupRef) return null
  if (groupRef.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: groupRef.value }))
    if ((invite as { className?: string }).className === 'ChatInviteAlready') {
      return (invite as { chat?: unknown }).chat ?? null
    }
    throw new Error('USER_NOT_PARTICIPANT')
  }

  if (groupRef.kind === 'peer') {
    try {
      return await client.getEntity(groupRef.value as never)
    } catch (error) {
      for (const archived of [false, true]) {
        const dialogs: Array<{ id?: { toString?: () => string }; entity?: unknown }> = []
        for await (const dialog of client.iterDialogs({ archived })) {
          dialogs.push(dialog as { id?: { toString?: () => string }; entity?: unknown })
        }
        const matchedDialog = dialogs.find((dialog) => {
          const dialogId = typeof dialog?.id?.toString === 'function' ? dialog.id.toString() : ''
          return dialogId === String(groupRef.value)
        })
        if (matchedDialog?.entity) {
          return matchedDialog.entity
        }
      }
      throw error
    }
  }

  return client.getEntity(groupRef.value as never)
}

async function ensureJoinedGroupEntity(client: TelegramClient, groupRef: ReturnType<typeof normalizeGroupRef>) {
  if (!groupRef) return { entity: null, joined: false }

  if (groupRef.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: groupRef.value }))
    if ((invite as { className?: string }).className === 'ChatInviteAlready') {
      return {
        entity: (invite as { chat?: unknown }).chat ?? null,
        joined: false
      }
    }

    await client.invoke(new Api.messages.ImportChatInvite({ hash: groupRef.value }))
    const joinedInvite = await client.invoke(new Api.messages.CheckChatInvite({ hash: groupRef.value }))
    if ((joinedInvite as { className?: string }).className === 'ChatInviteAlready') {
      return {
        entity: (joinedInvite as { chat?: unknown }).chat ?? null,
        joined: true
      }
    }

    throw new Error('TARGET_GROUP_INVALID')
  }

  const entity = await resolveGroupEntity(client, groupRef)
  if (!entity) {
    return { entity: null, joined: false }
  }

  const className = String((entity as { className?: string })?.className || '')
  if (!className.includes('Channel')) {
    return { entity, joined: false }
  }

  try {
    await client.invoke(new Api.channels.JoinChannel({
      channel: utils.getInputChannel(await client.getInputEntity(entity as never))
    }))
    return {
      entity: await resolveGroupEntity(client, groupRef),
      joined: true
    }
  } catch (error) {
    if (isAlreadyParticipantError(error)) {
      return { entity, joined: false }
    }
    if (isInviteRequestSentError(error)) {
      throw error
    }
    throw error
  }
}

async function resolveInviteTarget(client: TelegramClient, item: GroupInviteTargetItem) {
  if (item.kind === 'username') {
    const entity = await client.getEntity(item.normalized as never)
    const inputPeer = await client.getInputEntity(entity as never)
    return {
      inputUser: utils.getInputUser(inputPeer),
      cleanup: undefined as undefined | (() => Promise<void>)
    }
  }

  const phone = item.normalized
  const result = await client.invoke(new Api.contacts.ImportContacts({
    contacts: [new Api.InputPhoneContact({
      clientId: bigInt(Date.now()),
      phone,
      firstName: 'Group',
      lastName: 'Invite'
    })]
  }))

  const user = Array.isArray((result as { users?: unknown[] }).users) ? (result as { users: unknown[] }).users[0] : null
  if (!user) {
    throw new Error('PHONE_NUMBER_INVALID')
  }

  const inputPeer = await client.getInputEntity(user as never)
  return {
    inputUser: utils.getInputUser(inputPeer),
    cleanup: async () => {
      try {
        await client.invoke(new Api.contacts.DeleteByPhones({ phones: [phone] }))
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

async function inviteToGroup(client: TelegramClient, groupEntity: unknown, item: GroupInviteTargetItem) {
  const resolved = await resolveInviteTarget(client, item)
  try {
    const className = String((groupEntity as { className?: string })?.className || '')
    if (className.includes('Channel')) {
      const inputChannel = utils.getInputChannel(await client.getInputEntity(groupEntity as never))
      await client.invoke(new Api.channels.InviteToChannel({
        channel: inputChannel,
        users: [resolved.inputUser]
      }))
      return
    }

    const chatId = Number((groupEntity as { id?: unknown })?.id ?? 0)
    if (!Number.isFinite(chatId) || chatId <= 0) {
      throw new Error('TARGET_GROUP_INVALID')
    }

    await client.invoke(new Api.messages.AddChatUser({
      chatId: bigInt(chatId),
      userId: resolved.inputUser,
      fwdLimit: 10
    }))
  } finally {
    await resolved.cleanup?.()
  }
}

async function sleepForTask(task: ActiveGroupInviteTask, ms: number) {
  if (ms <= 0 || task.cancelled) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      task.wakeWaiters.delete(wake)
      resolve()
    }, ms)

    const wake = () => {
      clearTimeout(timeout)
      task.wakeWaiters.delete(wake)
      resolve()
    }

    task.wakeWaiters.add(wake)
  })
}

function buildAssignments(accountIds: number[], items: GroupInviteTargetItem[], perRoundLimit: number) {
  const assignments = new Map<number, GroupInviteTargetItem[]>()
  const normalizedLimit = perRoundLimit > 0 ? perRoundLimit : Number.POSITIVE_INFINITY
  let cursor = 0
  let assignedCount = 0

  for (const item of items) {
    let assigned = false
    for (let tried = 0; tried < accountIds.length; tried += 1) {
      const accountId = accountIds[(cursor + tried) % accountIds.length]
      const current = assignments.get(accountId) ?? []
      if (current.length < normalizedLimit) {
        current.push(item)
        assignments.set(accountId, current)
        cursor = (cursor + tried + 1) % accountIds.length
        assignedCount += 1
        assigned = true
        break
      }
    }

    if (!assigned) {
      break
    }
  }

  return {
    assignments,
    assignedCount,
    remainingCount: Math.max(0, items.length - assignedCount)
  }
}

export class GroupInviteService {
  private activeTask: ActiveGroupInviteTask | null = null
  private state: GroupInviteProgressState = { ...EMPTY_STATE }
  private progressSink?: (state: GroupInviteProgressState) => void

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  getState() {
    return this.state
  }

  setProgressSink(sink?: (state: GroupInviteProgressState) => void) {
    this.progressSink = sink
  }

  private emitState() {
    this.state = {
      ...this.state,
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  private updateState(patch: Partial<GroupInviteProgressState>) {
    this.state = {
      ...this.state,
      ...patch,
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  private pushLog(entry: Omit<GroupInviteLogEntry, 'id' | 'createdAt'>) {
    this.state = {
      ...this.state,
      logs: trimLogs([...this.state.logs, {
        id: createId('group_invite_log'),
        createdAt: new Date().toISOString(),
        ...entry
      }]),
      lastUpdatedAt: new Date().toISOString()
    }
    this.progressSink?.(this.state)
  }

  async stop(): Promise<GroupInviteStopResult> {
    if (!this.activeTask) {
      return {
        stopped: false,
        message: '当前没有正在执行的群组邀请任务。'
      }
    }

    this.activeTask.cancelled = true
    for (const wake of Array.from(this.activeTask.wakeWaiters)) {
      try {
        wake()
      } catch {
        // ignore wake failures
      }
    }
    this.activeTask.wakeWaiters.clear()
    await Promise.all(Array.from(this.activeTask.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    this.activeTask.clients.clear()
    this.updateState({ stopRequested: true })
    this.pushLog({
      level: 'warning',
      accountId: null,
      accountPhone: '',
      targetValue: '',
      message: '已收到停止指令，当前任务会尽快结束。'
    })
    return {
      stopped: true,
      message: '已开始停止当前群组邀请任务。'
    }
  }

  async start(payload: GroupInvitePayload): Promise<GroupInviteTaskResult> {
    if (this.activeTask || this.state.running) {
      throw new Error('当前已经有一个群组邀请任务正在执行，请等它完成后再试。')
    }

    const accountIds = Array.from(new Set(payload.accountIds.filter((id) => Number.isFinite(id))))
    if (accountIds.length === 0) {
      throw new Error('请先选择执行账号。')
    }
    if (!payload.groupRef.trim()) {
      throw new Error('请先选择目标群组。')
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('请先导入待邀请联系人。')
    }

    const accounts = this.accountRepository.getByIds(accountIds)
    const accountMap = new Map(accounts.map((account) => [account.id, account]))
    const orderedAccounts = accountIds.map((id) => accountMap.get(id)).filter((item): item is AccountRecord => Boolean(item))
    if (orderedAccounts.length === 0) {
      throw new Error('没有找到可执行的账号。')
    }

    const normalizedGroupRef = normalizeGroupRef(payload.groupRef)
    if (!normalizedGroupRef) {
      throw new Error('目标群组格式不正确。')
    }

    const task: ActiveGroupInviteTask = {
      cancelled: false,
      clients: new Map<number, TelegramClient>(),
      wakeWaiters: new Set<() => void>()
    }
    this.activeTask = task

    const { assignments, assignedCount, remainingCount } = buildAssignments(orderedAccounts.map((account) => account.id), payload.items, payload.perRoundLimit)
    const results: GroupInviteResultItem[] = []
    const plannedTotal = assignedCount

    this.state = {
      running: true,
      stopRequested: false,
      total: plannedTotal,
      completed: 0,
      successCount: 0,
      failedCount: 0,
      currentAccountId: null,
      currentPhone: null,
      currentTargetValue: null,
      groupRef: payload.groupRef,
      groupTitle: payload.groupTitle,
      runningAccountIds: orderedAccounts.map((account) => account.id),
      logs: [],
      lastUpdatedAt: new Date().toISOString()
    }
    this.emitState()
    this.pushLog({
      level: 'info',
      accountId: null,
      accountPhone: '',
      targetValue: '',
      message: `本轮准备执行 ${plannedTotal} 个联系人，目标群组 ${payload.groupTitle || payload.groupRef}。`
    })

    if (remainingCount > 0) {
      this.pushLog({
        level: 'warning',
        accountId: null,
        accountPhone: '',
        targetValue: '',
        message: `还有 ${remainingCount} 个联系人超出本轮上限，先保留在名单里，下一轮再继续。`
      })
    }

    const intervalSeconds = Math.max(0, payload.inviteIntervalSeconds, payload.accountFrequencySeconds)

    const runWorker = async (account: AccountRecord, items: GroupInviteTargetItem[]) => {
      if (items.length === 0) return
      let client: TelegramClient | null = null
      try {
        client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
        task.clients.set(account.id, client)
        const { entity: groupEntity, joined } = await ensureJoinedGroupEntity(client, normalizedGroupRef)
        if (!groupEntity) {
          throw new Error('TARGET_GROUP_INVALID')
        }
        if (joined) {
          this.pushLog({
            level: 'info',
            accountId: account.id,
            accountPhone: readAccountLabel(account),
            targetValue: payload.groupRef,
            message: `当前账号已自动加入目标群 ${payload.groupTitle || payload.groupRef}`
          })
        }

        for (let index = 0; index < items.length; index += 1) {
          if (task.cancelled) return
          const item = items[index]
          this.updateState({
            currentAccountId: account.id,
            currentPhone: readAccountLabel(account),
            currentTargetValue: item.normalized
          })

          let success = false
          let attempts = 0
          while (!success && !task.cancelled) {
            attempts += 1
            try {
              await inviteToGroup(client, groupEntity, item)
              const message = `成功邀请 ${item.normalized} 加入 ${payload.groupTitle || payload.groupRef}`
              results.push({
                targetValue: item.normalized,
                accountId: account.id,
                accountPhone: readAccountLabel(account),
                success: true,
                status: 'invited',
                message
              })
              this.updateState({
                completed: this.state.completed + 1,
                successCount: this.state.successCount + 1
              })
              this.pushLog({
                level: 'success',
                accountId: account.id,
                accountPhone: readAccountLabel(account),
                targetValue: item.normalized,
                message
              })
              success = true
            } catch (error) {
              if (isAlreadyParticipantError(error)) {
                const message = `${item.normalized} 已在 ${payload.groupTitle || payload.groupRef} 中`
                results.push({
                  targetValue: item.normalized,
                  accountId: account.id,
                  accountPhone: readAccountLabel(account),
                  success: true,
                  status: 'already',
                  message
                })
                this.updateState({
                  completed: this.state.completed + 1,
                  successCount: this.state.successCount + 1
                })
                this.pushLog({
                  level: 'warning',
                  accountId: account.id,
                  accountPhone: readAccountLabel(account),
                  targetValue: item.normalized,
                  message
                })
                success = true
                continue
              }

              const waitSeconds = readRequiredWaitSeconds(error)
              const shouldRiskWait = /PEER_FLOOD/i.test(error instanceof Error ? error.message : String(error))
              if ((waitSeconds || shouldRiskWait) && attempts < 3) {
                const sleepSeconds = Math.max(waitSeconds ?? 0, shouldRiskWait ? payload.riskWaitSeconds : 0, 1)
                this.pushLog({
                  level: 'warning',
                  accountId: account.id,
                  accountPhone: readAccountLabel(account),
                  targetValue: item.normalized,
                  message: `触发频率限制，等待 ${sleepSeconds} 秒后继续`
                })
                await sleepForTask(task, sleepSeconds * 1000)
                continue
              }

              if (isRetryableInviteError(error) && attempts < 2 && payload.retryWaitSeconds > 0) {
                this.pushLog({
                  level: 'warning',
                  accountId: account.id,
                  accountPhone: readAccountLabel(account),
                  targetValue: item.normalized,
                  message: `邀请 ${item.normalized} 失败：${formatInviteError(error)}，${payload.retryWaitSeconds} 秒后重试`
                })
                await sleepForTask(task, payload.retryWaitSeconds * 1000)
                continue
              }

              const message = `邀请 ${item.normalized} 失败：${formatInviteError(error)}`
              results.push({
                targetValue: item.normalized,
                accountId: account.id,
                accountPhone: readAccountLabel(account),
                success: false,
                status: 'failed',
                message
              })
              this.updateState({
                completed: this.state.completed + 1,
                failedCount: this.state.failedCount + 1
              })
              this.pushLog({
                level: 'error',
                accountId: account.id,
                accountPhone: readAccountLabel(account),
                targetValue: item.normalized,
                message
              })

              if (isFatalAccountError(error)) {
                for (let restIndex = index + 1; restIndex < items.length; restIndex += 1) {
                  const restItem = items[restIndex]
                  const skipMessage = `邀请 ${restItem.normalized} 失败：当前账号不可继续执行，剩余联系人已跳过`
                  results.push({
                    targetValue: restItem.normalized,
                    accountId: account.id,
                    accountPhone: readAccountLabel(account),
                    success: false,
                    status: 'skipped',
                    message: skipMessage
                  })
                  this.updateState({
                    completed: this.state.completed + 1,
                    failedCount: this.state.failedCount + 1
                  })
                  this.pushLog({
                    level: 'warning',
                    accountId: account.id,
                    accountPhone: readAccountLabel(account),
                    targetValue: restItem.normalized,
                    message: skipMessage
                  })
                }
                return
              }

              success = true
            }
          }

          if (!task.cancelled && index < items.length - 1 && intervalSeconds > 0) {
            await sleepForTask(task, intervalSeconds * 1000)
          }
        }
      } finally {
        if (client) {
          task.clients.delete(account.id)
          await this.clientManager.destroyClient(client).catch(() => undefined)
        }
      }
    }

    try {
      await Promise.all(orderedAccounts.map((account) => runWorker(account, assignments.get(account.id) ?? [])))
      const stopped = task.cancelled
      this.updateState({
        running: false,
        stopRequested: stopped,
        currentAccountId: null,
        currentPhone: null,
        currentTargetValue: null,
        runningAccountIds: []
      })
      const finalMessage = stopped
        ? `群组邀请任务已停止：本轮成功 ${this.state.successCount}，失败 ${this.state.failedCount}，剩余 ${remainingCount} 个未处理。`
        : `群组邀请任务执行完成：本轮成功 ${this.state.successCount}，失败 ${this.state.failedCount}，剩余 ${remainingCount} 个未处理。`
      this.pushLog({
        level: 'info',
        accountId: null,
        accountPhone: '',
        targetValue: '',
        message: finalMessage
      })
      return {
        total: plannedTotal,
        successCount: this.state.successCount,
        failedCount: this.state.failedCount,
        remainingCount,
        results,
        message: finalMessage
      }
    } finally {
      this.activeTask = null
    }
  }
}
