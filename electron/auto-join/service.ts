import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import { TelethonAutoJoiner } from './telethon-auto-joiner'
import type { AutoJoinPayload, AutoJoinPayloadItem, AutoJoinProgress, AutoJoinResultItem, AutoJoinStopResult, AutoJoinTaskResult } from '../../src/types'

interface ActiveAutoJoinTask {
  id: string
  cancelled: boolean
  clients: Map<number, TelegramClient>
  wakeWaiters: Set<() => void>
  joinAbortControllers: Set<AbortController>
}

interface PendingJoinItem extends AutoJoinPayloadItem {
  attempts: number
}

function wakeTaskWaiters(task: ActiveAutoJoinTask) {
  for (const wake of Array.from(task.wakeWaiters)) {
    try {
      wake()
    } catch {
      // ignore wake failures
    }
  }
  task.wakeWaiters.clear()
}

async function sleepForTask(task: ActiveAutoJoinTask, ms: number) {
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

function randomInt(min: number, max: number) {
  const normalizedMin = Math.max(0, Math.min(min, max))
  const normalizedMax = Math.max(normalizedMin, Math.max(min, max))
  if (normalizedMin === normalizedMax) return normalizedMin
  return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin
}

function pickDelayMs(minSeconds: number, maxSeconds: number) {
  return randomInt(minSeconds, maxSeconds) * 1000
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

function shuffleItems<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function createPendingItems(items: AutoJoinPayloadItem[], dispatchMode: 'random' | 'sequential') {
  const ordered = dispatchMode === 'random' ? shuffleItems(items) : [...items]
  return ordered.map<PendingJoinItem>((item) => ({ ...item, attempts: 0 }))
}

function requeueItem(queue: PendingJoinItem[], item: PendingJoinItem, dispatchMode: 'random' | 'sequential') {
  if (dispatchMode === 'random') {
    const index = Math.floor(Math.random() * (queue.length + 1))
    queue.splice(index, 0, item)
    return
  }
  queue.push(item)
}

function readAccountLogLabel(account: AccountRecord) {
  if (account.phone?.trim()) return account.phone.trim()
  if (account.userId?.trim()) return account.userId.trim()
  return String(account.id)
}

function readRequiredWaitSeconds(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const explicitWait = message.match(/A wait of (\d+) seconds is required/i)
  if (explicitWait?.[1]) {
    const seconds = Number(explicitWait[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  const floodWait = message.match(/FLOOD_WAIT_(\d+)/i)
  if (floodWait?.[1]) {
    const seconds = Number(floodWait[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  const slowMode = message.match(/SLOWMODE_WAIT_(\d+)/i)
  if (slowMode?.[1]) {
    const seconds = Number(slowMode[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  }

  return null
}

function isJoinRequestSent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /INVITE_REQUEST_SENT/i.test(message)
}

function isMissingTargetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return false
  return /Cannot find any entity corresponding to/i.test(normalized)
    || /USERNAME_INVALID|USERNAME_NOT_OCCUPIED/i.test(normalized)
    || /CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)
    || /INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)
}

function formatAutoJoinError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '原因没拿到'
  if (/Cannot find any entity corresponding to/i.test(normalized)) return '当前账号暂时识别不了这个群，群未必不存在，建议改用完整 t.me 链接或邀请链接再试'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '邀请链接失效了，或者已经不能用了'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '这个群进不去，可能是私密群，或者当前账号没权限'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号加的群太多了，先退几个群再试'
  if (/USERS_TOO_MUCH/i.test(normalized)) return '这个群人数太多，当前方式进不去'
  if (/USERNAME_INVALID/i.test(normalized)) return '@群用户名格式不对，或者这个用户名已经失效了'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '@群用户名当前没有被占用，可能是群改名了，或者你填的不是它现在在用的用户名'
  if (/CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)) return '这个群链接或群引用当前解析不了，不代表群一定不存在，建议换完整链接或邀请链接再试'
  if (/USER_BANNED_IN_CHANNEL/i.test(normalized)) return '这个账号在目标群里被限制了'
  if (/USER_ALREADY_PARTICIPANT/i.test(normalized)) return '这个账号本来就在群里'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录状态失效了，需要重新登录'
  if (/No module named 'python_socks'|No module named 'socks'/i.test(normalized)) return '当前软件包里的代理运行环境不完整，自动加群没法通过 Telethon 走代理。请重新下载完整包后再试。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理，所以这次没有继续走本地直连。先把可用代理补上再试。'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '这个群限制加入，当前账号没法直接进'
  if (/INVITE_REQUEST_SENT/i.test(normalized)) return '这个群需要审核，已经提交申请了'
  if (/PEER_FLOOD/i.test(normalized)) return '这个账号操作太频繁了，被 Telegram 限流了'
  if (/FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING/i.test(normalized)) return '这个账号已经冻结了，没法继续加群'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(normalized)) return '这个账号已经被封了，没法继续加群'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '这个账号当前被限制了，没法继续加群'
  if (/AUTO_JOIN_STOPPED_BY_USER/i.test(normalized)) return '任务已停止'
  const wait = readRequiredWaitSeconds(error)
  if (wait) return `Telegram 要求先等 ${wait} 秒`
  return `加入时出了点问题：${normalized}`
}

function parseJoinTarget(target: AutoJoinPayloadItem) {
  if (target.kind === 'invite') {
    const matched = target.raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
    const hash = matched?.[1]?.trim() || target.normalized.replace(/^https:\/\/t\.me\/\+/, '').trim()
    return { kind: 'invite' as const, value: hash }
  }
  return { kind: 'username' as const, value: target.normalized.startsWith('@') ? target.normalized : `@${target.normalized.replace(/^@+/, '')}` }
}

async function resolveJoinEntity(client: TelegramClient, value: string) {
  try {
    return await client.getEntity(value as never)
  } catch (error) {
    if (!isMissingTargetError(error)) throw error

    const username = value.replace(/^@+/, '').trim()
    if (!username) throw error

    try {
      return await client.getEntity(`https://t.me/${username}` as never)
    } catch {
      throw error
    }
  }
}

async function isAlreadyInChannel(client: TelegramClient, entity: unknown) {
  try {
    await client.invoke(new Api.channels.GetParticipant({
      channel: entity as never,
      participant: new Api.InputPeerSelf()
    }))
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/USER_NOT_PARTICIPANT|PARTICIPANT_ID_INVALID|not a member of the specified megagroup or channel|target user is not a member/i.test(message)) {
      return false
    }
    throw error
  }
}

function readGroupTitle(source: unknown, fallback: string) {
  if (Array.isArray((source as { chats?: unknown[] } | null)?.chats)) {
    const chats = (source as { chats: Array<{ title?: unknown; username?: unknown }> }).chats
    const firstTitle = chats.map((item) => typeof item.title === 'string' ? item.title.trim() : '').find(Boolean)
    if (firstTitle) return firstTitle
    const firstUsername = chats.map((item) => typeof item.username === 'string' ? item.username.trim() : '').find(Boolean)
    if (firstUsername) return `@${firstUsername.replace(/^@+/, '')}`
  }

  const entity = source as { title?: unknown; username?: unknown } | null
  if (typeof entity?.title === 'string' && entity.title.trim()) return entity.title.trim()
  if (typeof entity?.username === 'string' && entity.username.trim()) return `@${entity.username.replace(/^@+/, '')}`
  return fallback
}

async function ensureAuthorizedClient(account: AccountRecord, sessionLoader: SessionLoader, clientManager: TelegramClientManager, proxyPoolService: ProxyPoolService) {
  const session = await sessionLoader.load(account.sessionPath)
  const proxy = proxyPoolService.isEnabled() ? proxyPoolService.getAccountCheckProxy() : null
  if (proxyPoolService.isEnabled() && !proxy) {
    throw new Error('GLOBAL_PROXY_REQUIRED')
  }

  const client = clientManager.createClient(session, {
    proxy: toClientProxy(proxy)
  })
  await client.connect()
  const authorized = await client.isUserAuthorized()
  if (!authorized) {
    await clientManager.destroyClient(client)
    throw new Error('AUTH_KEY_UNREGISTERED')
  }
  return client
}

async function joinSingleTarget(client: TelegramClient, item: AutoJoinPayloadItem) {
  const parsed = parseJoinTarget(item)
  if (parsed.kind === 'invite') {
    try {
      const result = await client.invoke(new Api.messages.ImportChatInvite({ hash: parsed.value }))
      const resultName = typeof (result as unknown as { className?: unknown })?.className === 'string'
        ? (result as unknown as { className: string }).className
        : typeof (result as unknown as { CLASS_NAME?: unknown })?.CLASS_NAME === 'string'
          ? (result as unknown as { CLASS_NAME: string }).CLASS_NAME
          : ''
      if (/ChatInviteAlready/i.test(resultName)) {
        return {
          status: 'already' as const,
          groupTitle: readGroupTitle(result, item.normalized)
        }
      }
      return {
        status: 'joined' as const,
        groupTitle: readGroupTitle(result, item.normalized)
      }
    } catch (error) {
      if (isJoinRequestSent(error)) {
        return {
          status: 'requested' as const,
          groupTitle: item.normalized
        }
      }
      if (/USER_ALREADY_PARTICIPANT/i.test(error instanceof Error ? error.message : String(error))) {
        const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }))
        return {
          status: 'already' as const,
          groupTitle: readGroupTitle(invite, item.normalized)
        }
      }
      throw error
    }
  }

  const entity = await resolveJoinEntity(client, parsed.value)
  if (await isAlreadyInChannel(client, entity)) {
    return {
      status: 'already' as const,
      groupTitle: readGroupTitle(entity, item.normalized)
    }
  }

  try {
    await client.invoke(new Api.channels.JoinChannel({ channel: entity as never }))
    return {
      status: 'joined' as const,
      groupTitle: readGroupTitle(entity, item.normalized)
    }
  } catch (error) {
    if (isJoinRequestSent(error)) {
      return {
        status: 'requested' as const,
        groupTitle: readGroupTitle(entity, item.normalized)
      }
    }
    if (/USER_ALREADY_PARTICIPANT/i.test(error instanceof Error ? error.message : String(error))) {
      return {
        status: 'already' as const,
        groupTitle: readGroupTitle(entity, item.normalized)
      }
    }
    throw error
  }
}

export class AutoJoinService {
  private activeTask: ActiveAutoJoinTask | null = null

  private getCurrentProxy() {
    if (!this.proxyPoolService.isEnabled()) {
      return null
    }

    const proxy = this.proxyPoolService.getAccountCheckProxy()
    if (!proxy) {
      throw new Error('GLOBAL_PROXY_REQUIRED')
    }

    return proxy
  }

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService,
    private readonly telethonAutoJoiner: TelethonAutoJoiner
  ) {}

  async stopCurrentTask(): Promise<AutoJoinStopResult> {
    if (!this.activeTask) {
      return {
        stopped: false,
        message: '当前没有正在执行的自动加群任务。'
      }
    }

    this.activeTask.cancelled = true
    wakeTaskWaiters(this.activeTask)
    for (const controller of Array.from(this.activeTask.joinAbortControllers)) {
      controller.abort()
    }
    this.activeTask.joinAbortControllers.clear()
    await Promise.all(Array.from(this.activeTask.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    this.activeTask.clients.clear()
    return {
      stopped: true,
      message: '自动加群任务已停止。'
    }
  }

  async start(payload: AutoJoinPayload, onProgress?: (payload: AutoJoinProgress) => void): Promise<AutoJoinTaskResult> {
    if (this.activeTask) {
      throw new Error('已经有自动加群任务在执行了，请先停掉当前任务。')
    }

    const accountIds = Array.from(new Set(payload.accountIds.filter((item): item is number => typeof item === 'number')))
    const requestedAccounts = this.accountRepository.getByIds(accountIds)
    const accounts = requestedAccounts.filter((account) => account.status !== 'banned' && account.status !== 'session_expired' && account.status !== 'not_logged_in')
    const workerLimit = Math.max(1, Math.min(payload.concurrency || accounts.length, accounts.length))
    let total = payload.repeatJoinEnabled ? payload.items.length * accounts.length : payload.items.length
    if (accounts.length === 0) {
      throw new Error('一个可用账号都没选上，先选能登录的账号再开始。')
    }
    if (payload.items.length === 0) {
      return {
        taskId: payload.taskId,
        total: 0,
        successCount: 0,
        alreadyCount: 0,
        requestedCount: 0,
        failedCount: 0,
        items: [],
        message: '没有可执行的加群目标。'
      }
    }

    const clients = new Map<number, TelegramClient>()
    const task: ActiveAutoJoinTask = {
      id: payload.taskId,
      cancelled: false,
      clients,
      wakeWaiters: new Set(),
      joinAbortControllers: new Set()
    }
    this.activeTask = task
    const useTelethonPrimary = this.telethonAutoJoiner.isAvailable()
    const results: AutoJoinResultItem[] = []
    const accountLabelById = new Map(accounts.map((item) => [item.id, readAccountLogLabel(item)]))
    const sharedQueue = payload.repeatJoinEnabled ? null : createPendingItems(payload.items, payload.dispatchMode)
    const perAccountQueue = new Map<number, PendingJoinItem[]>()
    accounts.forEach((account) => {
      if (payload.repeatJoinEnabled) {
        perAccountQueue.set(account.id, createPendingItems(payload.items, payload.dispatchMode))
      }
    })
    const pendingAccounts = [...accounts]
    const cooldownUntil = new Map<number, number>()
    let completed = 0
    let successCount = 0
    let alreadyCount = 0
    let requestedCount = 0
    let failedCount = 0

    const emit = (message: string, item?: AutoJoinResultItem | null, waitSeconds?: number | null, running = true) => {
      onProgress?.({
        taskId: payload.taskId,
        total,
        completed,
        successCount,
        alreadyCount,
        requestedCount,
        failedCount,
        running,
        item,
        message,
        waitSeconds: waitSeconds ?? null
      })
    }

    const finalizeResult = (item: AutoJoinResultItem) => {
      results.push(item)
      completed += 1
      if (item.status === 'joined') successCount += 1
      else if (item.status === 'already') alreadyCount += 1
      else if (item.status === 'requested') requestedCount += 1
      else failedCount += 1
      emit(item.errorMessage || '自动加群进度已更新。', item, null, true)
    }

    const takeNextItem = (accountId: number) => {
      if (payload.repeatJoinEnabled) {
        return perAccountQueue.get(accountId)?.shift() ?? null
      }
      return sharedQueue?.shift() ?? null
    }

    const pushBackItem = (accountId: number, item: PendingJoinItem) => {
      if (payload.repeatJoinEnabled) {
        const queue = perAccountQueue.get(accountId)
        if (!queue) return
        requeueItem(queue, item, payload.dispatchMode)
        return
      }
      if (!sharedQueue) return
      requeueItem(sharedQueue, item, payload.dispatchMode)
    }

    const hasPendingItems = () => {
      if (payload.repeatJoinEnabled) {
        return Array.from(perAccountQueue.values()).some((queue) => queue.length > 0)
      }
      return Boolean(sharedQueue && sharedQueue.length > 0)
    }

    const shouldWaitAfterAttempt = (accountId: number) => {
      if (task.cancelled) return false
      if (payload.repeatJoinEnabled) {
        return (perAccountQueue.get(accountId)?.length ?? 0) > 0
      }
      return hasPendingItems()
    }

    const dropTargetFromQueues = (targetNormalized: string, excludeAccountId?: number | null) => {
      if (!targetNormalized) return 0
      let removed = 0
      if (payload.repeatJoinEnabled) {
        for (const [accountId, queue] of perAccountQueue.entries()) {
          if (typeof excludeAccountId === 'number' && accountId === excludeAccountId) continue
          const nextQueue = queue.filter((item) => {
            const matched = item.normalized === targetNormalized
            if (matched) removed += 1
            return !matched
          })
          perAccountQueue.set(accountId, nextQueue)
        }
      } else if (sharedQueue) {
        const nextQueue = sharedQueue.filter((item) => {
          const matched = item.normalized === targetNormalized
          if (matched) removed += 1
          return !matched
        })
        sharedQueue.length = 0
        sharedQueue.push(...nextQueue)
      }
      if (removed > 0) {
        total = Math.max(completed, total - removed)
      }
      return removed
    }

    try {
      const runAccount = async (account: AccountRecord) => {
        let client: TelegramClient | null = null
        const accountLabel = accountLabelById.get(account.id) || `账号#${account.id}`

      try {
          if (!useTelethonPrimary) {
            client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
            clients.set(account.id, client)
          }
        } catch (error) {
          emit(`${accountLabel} 登录状态不可用，已跳过这个账号。`, {
            itemId: createSyntheticItemId(account.id),
            raw: '',
            normalized: '',
            status: 'failed',
            errorMessage: formatAutoJoinError(error),
            accountId: account.id,
            accountLabel,
            groupTitle: '',
            joinedAt: new Date().toISOString(),
            attempt: 1
          })
          return
        }

        while (!task.cancelled) {
          const cooldown = cooldownUntil.get(account.id) ?? 0
          const waitMs = cooldown - Date.now()
          if (waitMs > 0) {
            await sleepForTask(task, Math.min(waitMs, 1000))
            continue
          }

          const next = takeNextItem(account.id)
          if (!next) return
          if (task.cancelled) {
            pushBackItem(account.id, next)
            return
          }

          const attempt = next.attempts + 1
          try {
            const joined = useTelethonPrimary
              ? await (async () => {
                  const controller = new AbortController()
                  task.joinAbortControllers.add(controller)
                  try {
                    return await this.telethonAutoJoiner.join(account.sessionPath, next, {
                      timeoutSeconds: 40,
                      proxy: this.getCurrentProxy(),
                      signal: controller.signal
                    })
                  } finally {
                    task.joinAbortControllers.delete(controller)
                  }
                })()
              : await joinSingleTarget(client as TelegramClient, next)

            if (!joined) {
              throw new Error('TELETHON_AUTO_JOINER_UNAVAILABLE')
            }

            if (task.cancelled) {
              return
            }

            finalizeResult({
              itemId: next.id,
              raw: next.raw,
              normalized: next.normalized,
              status: joined.status,
              errorMessage:
                joined.status === 'already'
                  ? '这个账号本来就在群里'
                  : joined.status === 'requested'
                    ? '这个群需要审核，已经申请等待通过'
                    : '加入成功',
              accountId: account.id,
              accountLabel,
              groupTitle: joined.groupTitle,
              joinedAt: new Date().toISOString(),
              attempt
            })

            if (shouldWaitAfterAttempt(account.id)) {
              const baseDelay = pickDelayMs(payload.accountIntervalMin, payload.accountIntervalMax)
              const joinDelay = pickDelayMs(payload.joinIntervalMin, payload.joinIntervalMax)
              const totalWaitSeconds = Math.max(1, Math.ceil((baseDelay + joinDelay) / 1000))
              emit(`${accountLabel} 等待 ${totalWaitSeconds} 秒后，继续加入下一个。`, null, totalWaitSeconds, true)
              await sleepForTask(task, baseDelay + joinDelay)
            }
          } catch (error) {
            if (task.cancelled) {
              return
            }

            const waitSeconds = readRequiredWaitSeconds(error)
            if (waitSeconds && payload.autoRetryOnFloodWait && attempt <= Math.max(1, payload.retryLimit + 1)) {
              const configuredRestMs = pickDelayMs(payload.floodRestMin, payload.floodRestMax)
              const finalWaitMs = Math.max(waitSeconds * 1000, configuredRestMs)
              cooldownUntil.set(account.id, Date.now() + finalWaitMs)
              pushBackItem(account.id, { ...next, attempts: attempt })
              emit(`${accountLabel} 触发限流，先休息 ${Math.ceil(finalWaitMs / 1000)} 秒后继续。`, null, Math.ceil(finalWaitMs / 1000), true)
              continue
            }

            const missingTarget = isMissingTargetError(error)
            if (payload.repeatJoinEnabled && missingTarget) {
              const removed = dropTargetFromQueues(next.normalized, account.id)
              if (removed > 0) {
                emit(`${next.normalized || next.raw} 找不到，已自动跳过剩余账号。`, null, null, true)
              }
            }

            finalizeResult({
              itemId: next.id,
              raw: next.raw,
              normalized: next.normalized,
              status: 'failed',
              errorMessage: formatAutoJoinError(error),
              accountId: account.id,
              accountLabel,
              groupTitle: '',
              joinedAt: new Date().toISOString(),
              attempt
            })
            if (shouldWaitAfterAttempt(account.id)) {
              const waitMs = pickDelayMs(payload.accountIntervalMin, payload.accountIntervalMax)
              const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000))
              emit(`${accountLabel} 等待 ${waitSeconds} 秒后，继续加入下一个。`, null, waitSeconds, true)
              await sleepForTask(task, waitMs)
            }
          }
        }
      }

      await Promise.all(Array.from({ length: workerLimit }, async () => {
        while (!task.cancelled) {
          const account = pendingAccounts.shift()
          if (!account) return
          await runAccount(account)
          if (!payload.repeatJoinEnabled && !hasPendingItems()) return
        }
      }))

      if (hasPendingItems()) {
        if (task.cancelled) {
          if (payload.repeatJoinEnabled) {
            for (const queue of perAccountQueue.values()) {
              queue.length = 0
            }
          } else if (sharedQueue) {
            sharedQueue.length = 0
          }
          total = completed
        } else if (payload.repeatJoinEnabled) {
          for (const [accountId, queue] of perAccountQueue.entries()) {
            while (queue.length > 0) {
              const next = queue.shift()
              if (!next) break
              finalizeResult({
                itemId: next.id,
                raw: next.raw,
                normalized: next.normalized,
                status: 'failed',
                errorMessage: '没有可用账号继续执行这条加群任务',
                accountId,
                accountLabel: accountLabelById.get(accountId) || '',
                groupTitle: '',
                joinedAt: new Date().toISOString(),
                attempt: next.attempts
              })
            }
          }
        } else {
          while ((sharedQueue?.length ?? 0) > 0) {
            const next = sharedQueue?.shift()
            if (!next) break
            finalizeResult({
              itemId: next.id,
              raw: next.raw,
              normalized: next.normalized,
              status: 'failed',
              errorMessage: '没有可用账号继续执行这条加群任务',
              accountId: null,
              accountLabel: '',
              groupTitle: '',
              joinedAt: new Date().toISOString(),
              attempt: next.attempts
            })
          }
        }
      }

      const message = task.cancelled
        ? `自动加群已停止，已执行 ${completed} 条。`
        : `自动加群完成：成功 ${successCount}，已在群里 ${alreadyCount}，待审核 ${requestedCount}，失败 ${failedCount}。`

      emit(message, null, null, false)
      return {
        taskId: payload.taskId,
        total,
        successCount,
        alreadyCount,
        requestedCount,
        failedCount,
        items: results,
        message,
        stopped: task.cancelled
      }
    } finally {
      wakeTaskWaiters(task)
      for (const controller of Array.from(task.joinAbortControllers)) {
        controller.abort()
      }
      task.joinAbortControllers.clear()
      await Promise.all(Array.from(clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
      if (this.activeTask?.id === task.id) {
        this.activeTask = null
      }
    }
  }
}

function createSyntheticItemId(accountId: number) {
  return `account_${accountId}_${Date.now()}`
}
