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

function readAccountLabel(account: AccountRecord) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  return `账号#${account.id}`
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

  return null
}

function formatAutoJoinError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '加入群组失败'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '邀请链接失效了，或者已经不能用了。'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '这个群当前账号进不去，可能是私密群，或者链接权限不够。'
  if (/CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号加的群太多了，先换号或者退一些群再试。'
  if (/USERS_TOO_MUCH/i.test(normalized)) return '这个群人数太多，当前方式进不去。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个 @群用户名不对，请检查是不是写错了。'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '这个 @群用户名不存在。'
  if (/USER_BANNED_IN_CHANNEL/i.test(normalized)) return '这个账号在目标群里被限制了，当前进不去。'
  if (/USER_ALREADY_PARTICIPANT/i.test(normalized)) return '这个账号本来就在群里。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录状态失效了，需要重新登录。'
  const wait = readRequiredWaitSeconds(error)
  if (wait) return `Telegram 要求先等 ${wait} 秒，再继续加群。`
  return `加入失败：${normalized}`
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
      return {
        status: 'joined' as const,
        groupTitle: readGroupTitle(result, item.normalized)
      }
    } catch (error) {
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
    const total = payload.items.length
    if (accounts.length === 0) {
      throw new Error('一个可用账号都没选上，先选能登录的账号再开始。')
    }
    if (total === 0) {
      return {
        taskId: payload.taskId,
        total: 0,
        successCount: 0,
        alreadyCount: 0,
        failedCount: 0,
        items: [],
        message: '没有可执行的加群目标。'
      }
    }

    const task: ActiveAutoJoinTask = { id: payload.taskId, cancelled: false }
    this.activeTask = task

    const clients = new Map<number, TelegramClient>()
    const pendingItems: PendingJoinItem[] = payload.items.map((item) => ({ ...item, attempts: 0 }))
    const results: AutoJoinResultItem[] = []
    const cooldownUntil = new Map<number, number>()
    const runningAccounts = accounts.slice(0, Math.max(1, Math.min(payload.concurrency || accounts.length, accounts.length)))
    const accountLabelById = new Map(accounts.map((item) => [item.id, readAccountLabel(item)]))
    let completed = 0
    let successCount = 0
    let alreadyCount = 0
    let failedCount = 0

    const emit = (message: string, item?: AutoJoinResultItem | null, waitSeconds?: number | null, running = true) => {
      onProgress?.({
        taskId: payload.taskId,
        total,
        completed,
        successCount,
        alreadyCount,
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
      else failedCount += 1
      emit(item.errorMessage || '自动加群进度已更新。', item, null, true)
    }

    try {
      await Promise.all(runningAccounts.map(async (account) => {
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

          const next = pendingItems.shift()
          if (!next) return

          const attempt = next.attempts + 1
          try {
            const joined = await joinSingleTarget(client, next)
            finalizeResult({
              itemId: next.id,
              raw: next.raw,
              normalized: next.normalized,
              status: joined.status,
              errorMessage: joined.status === 'already' ? '这个账号本来就在群里，已自动跳过。' : '加入成功。',
              accountId: account.id,
              accountLabel,
              groupTitle: joined.groupTitle,
              joinedAt: new Date().toISOString(),
              attempt
            })
            await sleep(Math.max(0, payload.intervalSeconds) * 1000)
          } catch (error) {
            const waitSeconds = readRequiredWaitSeconds(error)
            if (waitSeconds && payload.autoRetryOnFloodWait && attempt <= Math.max(1, payload.retryLimit + 1)) {
              cooldownUntil.set(account.id, Date.now() + waitSeconds * 1000)
              pendingItems.push({ ...next, attempts: attempt })
              emit(`${accountLabel} 被 Telegram 要求等待 ${waitSeconds} 秒，已自动延后继续。`, null, waitSeconds, true)
              continue
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
            await sleep(Math.max(0, payload.intervalSeconds) * 1000)
          }
        }
      }))

      if (pendingItems.length > 0) {
        while (pendingItems.length > 0) {
          const item = pendingItems.shift()
          if (!item) break
          finalizeResult({
            itemId: item.id,
            raw: item.raw,
            normalized: item.normalized,
            status: 'failed',
            errorMessage: task.cancelled ? '任务已停止，这条没有继续执行。' : '没有可用账号继续执行这条加群任务。',
            accountId: null,
            accountLabel: '',
            groupTitle: '',
            joinedAt: new Date().toISOString(),
            attempt: item.attempts
          })
        }
      }

      const message = task.cancelled
        ? `自动加群已停止，已完成 ${completed}/${total} 条。`
        : `自动加群完成：成功 ${successCount}，已在群里 ${alreadyCount}，失败 ${failedCount}。`

      emit(message, null, null, false)
      return {
        taskId: payload.taskId,
        total,
        successCount,
        alreadyCount,
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
