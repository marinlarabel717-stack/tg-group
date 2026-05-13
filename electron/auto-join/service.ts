import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager } from '../accounts/check-engine/telegram-client-manager'
import type { AutoJoinPayload, AutoJoinPayloadItem, AutoJoinProgress, AutoJoinResultItem, AutoJoinStopResult, AutoJoinTaskResult } from '../../src/types'

interface ActiveAutoJoinTask {
  id: string
  cancelled: boolean
}

interface PendingJoinItem extends AutoJoinPayloadItem {
  attempts: number
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  if (/Cannot find any entity corresponding to/i.test(normalized)) return '当前账号没法直接识别这个@群用户名，群可能存在，建议改用完整链接或邀请链接'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '邀请链接失效了，或者已经不能用了'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '这个群进不去，可能是私密群，或者当前账号没权限'
  if (/CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号加的群太多了，先换号或者退一些群再试'
  if (/USERS_TOO_MUCH/i.test(normalized)) return '这个群人数太多，当前方式进不去'
  if (/USERNAME_INVALID/i.test(normalized)) return '@群用户名写错了'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '@群用户名不存在'
  if (/USER_BANNED_IN_CHANNEL/i.test(normalized)) return '这个账号在目标群里被限制了'
  if (/USER_ALREADY_PARTICIPANT/i.test(normalized)) return '这个账号本来就在群里'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录状态失效了，需要重新登录'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '这个群限制加入，当前账号没法直接进'
  const wait = readRequiredWaitSeconds(error)
  if (wait) return `Telegram 要求先等 ${wait} 秒`
  return normalized
}

function parseJoinTarget(target: AutoJoinPayloadItem) {
  if (target.kind === 'invite') {
    const matched = target.raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
    const hash = matched?.[1]?.trim() || target.normalized.replace(/^https:\/\/t\.me\/\+/, '').trim()
    return { kind: 'invite' as const, value: hash }
  }
  return { kind: 'username' as const, value: target.normalized.startsWith('@') ? target.normalized : `@${target.normalized.replace(/^@+/, '')}` }
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

async function ensureAuthorizedClient(account: AccountRecord, sessionLoader: SessionLoader, clientManager: TelegramClientManager) {
  const session = await sessionLoader.load(account.sessionPath)
  const client = clientManager.createClient(session)
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

  const entity = await client.getEntity(parsed.value as never)
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

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager
  ) {}

  async stopCurrentTask(): Promise<AutoJoinStopResult> {
    if (!this.activeTask) {
      return {
        stopped: false,
        message: '当前没有正在执行的自动加群任务。'
      }
    }

    this.activeTask.cancelled = true
    return {
      stopped: true,
      message: '自动加群任务正在停止，已不再接新目标。'
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

    const task: ActiveAutoJoinTask = { id: payload.taskId, cancelled: false }
    this.activeTask = task

    const clients = new Map<number, TelegramClient>()
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
          client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager)
          clients.set(account.id, client)
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
            await sleep(Math.min(waitMs, 1000))
            continue
          }

          const next = takeNextItem(account.id)
          if (!next) return

          const attempt = next.attempts + 1
          try {
            const joined = await joinSingleTarget(client, next)
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
              await sleep(baseDelay + joinDelay)
            }
          } catch (error) {
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
              await sleep(pickDelayMs(payload.accountIntervalMin, payload.accountIntervalMax))
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
        if (payload.repeatJoinEnabled) {
          for (const [accountId, queue] of perAccountQueue.entries()) {
            while (queue.length > 0) {
              const next = queue.shift()
              if (!next) break
              finalizeResult({
                itemId: next.id,
                raw: next.raw,
                normalized: next.normalized,
                status: 'failed',
                errorMessage: task.cancelled ? '任务已停止，这条没有继续执行' : '没有可用账号继续执行这条加群任务',
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
              errorMessage: task.cancelled ? '任务已停止，这条没有继续执行' : '没有可用账号继续执行这条加群任务',
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
        ? `自动加群已停止，已完成 ${completed}/${total} 条。`
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
        message
      }
    } finally {
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
