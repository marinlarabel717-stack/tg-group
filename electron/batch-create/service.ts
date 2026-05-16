import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type {
  BatchCreateMode,
  BatchCreatePayload,
  BatchCreateProgress,
  BatchCreateResultItem,
  BatchCreateStopResult,
  BatchCreateTaskResult
} from '../../src/types'

interface ActiveBatchCreateTask {
  id: string
  cancelled: boolean
  clients: Map<number, TelegramClient>
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

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomAlphaNumeric(length: number) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function hasTemplateTokens(value: string) {
  return /\{(?:n|index|accountId|type|rand\d+)\}/i.test(value)
}

function expandTemplate(input: string, context: { accountId: number; index: number; type: 'group' | 'channel' }) {
  const base = input || ''
  return base
    .replace(/\{accountId\}/gi, String(context.accountId))
    .replace(/\{index\}|\{n\}/gi, String(context.index + 1))
    .replace(/\{type\}/gi, context.type === 'group' ? 'group' : 'channel')
    .replace(/\{rand(\d+)\}/gi, (_matched, sizeText: string) => randomAlphaNumeric(Math.max(1, Math.min(24, Number(sizeText) || 6))))
}

function buildTitle(payload: BatchCreatePayload, context: { accountId: number; index: number; type: 'group' | 'channel' }) {
  const typeLabel = context.type === 'group' ? '群组' : '频道'
  if (payload.randomTitleEnabled) {
    return `${typeLabel}_${randomAlphaNumeric(Math.max(4, Math.min(10, payload.randomLength)) )}`
  }
  const template = payload.titleTemplate.trim() || `${typeLabel}_{accountId}_{index}`
  return expandTemplate(template, context)
}

function buildAbout(payload: BatchCreatePayload, context: { accountId: number; index: number; type: 'group' | 'channel' }, title: string) {
  if (payload.randomAboutEnabled) {
    return `${title} ${randomAlphaNumeric(Math.max(4, Math.min(10, payload.randomLength)))}`
  }
  const template = payload.aboutTemplate.trim()
  if (!template) return ''
  return expandTemplate(template, context)
}

function normalizeUsername(raw: string) {
  let value = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '')
  if (!/^[a-z]/.test(value)) {
    value = `tg${value}`
  }
  if (value.length < 5) {
    value = `${value}${randomAlphaNumeric(5 - value.length)}`
  }
  return value.slice(0, 32)
}

function buildUsername(payload: BatchCreatePayload, context: { accountId: number; index: number; type: 'group' | 'channel' }, retry: number) {
  const typePrefix = context.type === 'group' ? 'g' : 'c'
  if (payload.randomUsernameEnabled) {
    return normalizeUsername(`tg${typePrefix}${randomAlphaNumeric(Math.max(5, Math.min(20, payload.randomLength + retry)))}`)
  }

  const sourceTemplate = payload.usernameTemplate.trim() || `tg${typePrefix}_{accountId}_{index}`
  const expanded = expandTemplate(sourceTemplate, context)
  let value = normalizeUsername(expanded)
  const shouldAppendSequence = !hasTemplateTokens(sourceTemplate) && (payload.countPerAccount > 1 || payload.accountIds.length > 1 || payload.createMode === 'both')
  if (shouldAppendSequence) {
    value = normalizeUsername(`${value}_${context.accountId}_${context.index + 1}`)
  }
  if (retry > 0) {
    value = normalizeUsername(`${value}_${randomAlphaNumeric(Math.min(6, retry + 2))}`)
  }
  return value
}

function formatBatchCreateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '创建失败，原因没拿到。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录已经失效了。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(normalized)) return '这个账号已经被封了。'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '这个账号当前被 Telegram 限制了。'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号创建得太多了，Telegram 不让继续建了。'
  if (/CHANNELS_ADMIN_PUBLIC_TOO_MUCH/i.test(normalized)) return '这个账号公开群/频道数量已经到上限了。'
  if (/USERNAME_OCCUPIED/i.test(normalized)) return '这个公开链接已经被占用了。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个公开链接格式不对，只能用字母、数字和下划线。'
  if (/USERNAMES_UNAVAILABLE/i.test(normalized)) return '这个公开链接当前不可用。'
  if (/CHAT_TITLE_EMPTY/i.test(normalized)) return '群名或频道名不能为空。'
  if (/CHAT_ABOUT_TOO_LONG|ABOUT_TOO_LONG/i.test(normalized)) return '简介太长了，缩短一点再试。'
  if (/No user has\s+"username"/i.test(normalized)) return '当前公开链接没设置成功。'
  return `创建失败：${normalized}`
}

function isFatalAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(message)) {
    return { status: 'session_expired' as const, message: '登录失效' }
  }
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(message)) {
    return { status: 'banned' as const, message: '账号封禁' }
  }
  if (/ACCOUNT_RESTRICTED/i.test(message)) {
    return { status: 'not_logged_in' as const, message: '账号受限' }
  }
  return null
}

function extractCreatedChat(response: unknown) {
  const value = response as { chats?: unknown[] } | null
  return Array.isArray(value?.chats) ? value.chats[0] ?? null : null
}

async function rollbackCreatedEntity(client: TelegramClient, entity: unknown) {
  const input = await client.getInputEntity(entity as never)
  await client.invoke(new Api.channels.DeleteChannel({ channel: input as never }))
}

export class BatchCreateService {
  private activeTask: ActiveBatchCreateTask | null = null

  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  async stopCurrentTask(): Promise<BatchCreateStopResult> {
    if (!this.activeTask) {
      return {
        stopped: false,
        message: '当前没有正在执行的批量创建任务。'
      }
    }

    this.activeTask.cancelled = true
    await Promise.all(Array.from(this.activeTask.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
    this.activeTask.clients.clear()
    return {
      stopped: true,
      message: '批量创建任务已停止。'
    }
  }

  async start(payload: BatchCreatePayload, onProgress?: (payload: BatchCreateProgress) => void): Promise<BatchCreateTaskResult> {
    if (this.activeTask) {
      throw new Error('已经有批量创建任务在执行了，请先停掉当前任务。')
    }

    const accountIds = Array.from(new Set(payload.accountIds.filter((item): item is number => typeof item === 'number')))
    const requestedAccounts = this.accountRepository.getByIds(accountIds)
    const accounts = requestedAccounts.filter((account) => account.status !== 'banned' && account.status !== 'frozen' && account.status !== 'session_expired' && account.status !== 'not_logged_in')
    if (accounts.length === 0) {
      throw new Error('一个可用账号都没选上，先选能登录的账号再开始。')
    }

    const types: Array<'group' | 'channel'> = payload.createMode === 'both'
      ? ['group', 'channel']
      : [payload.createMode]
    const total = accounts.length * Math.max(1, payload.countPerAccount) * types.length
    const results: BatchCreateResultItem[] = []
    const task: ActiveBatchCreateTask = {
      id: payload.taskId,
      cancelled: false,
      clients: new Map()
    }
    this.activeTask = task

    let completed = 0
    let successCount = 0
    let failedCount = 0
    let groupCount = 0
    let channelCount = 0

    const emit = (message: string, item?: BatchCreateResultItem | null, running = true) => {
      onProgress?.({
        taskId: payload.taskId,
        total,
        completed,
        successCount,
        failedCount,
        groupCount,
        channelCount,
        running,
        item: item ?? null,
        message
      })
    }

    try {
      for (const account of accounts) {
        if (task.cancelled) break
        const accountLabel = account.username || account.phone || `账号#${account.id}`
        let client = task.clients.get(account.id) ?? null
        try {
          client = client ?? await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
          task.clients.set(account.id, client)
        } catch (error) {
          const fatal = isFatalAccountError(error)
          if (fatal) {
            this.accountRepository.updateStatus([account.id], fatal.status)
          }
          for (let index = 0; index < payload.countPerAccount; index += 1) {
            for (const type of types) {
              completed += 1
              failedCount += 1
              const item: BatchCreateResultItem = {
                id: createId('batch-create-item'),
                accountId: account.id,
                accountLabel,
                entityType: type,
                title: '',
                about: '',
                username: '',
                publicLink: '',
                status: 'failed',
                message: fatal ? `这个账号已自动停用：${fatal.message}` : formatBatchCreateError(error),
                createdAt: new Date().toISOString()
              }
              results.push(item)
              emit(item.message, item, true)
            }
          }
          continue
        }

        for (let index = 0; index < payload.countPerAccount; index += 1) {
          for (const type of types) {
            if (task.cancelled) break
            const context = { accountId: account.id, index, type }
            const title = buildTitle(payload, context)
            const about = buildAbout(payload, context, title)
            let lastError: unknown = null
            let emittedItem: BatchCreateResultItem | null = null

            for (let retry = 0; retry < 4; retry += 1) {
              let createdEntity: unknown = null
              const username = buildUsername(payload, context, retry)
              try {
                const createResult = await client.invoke(new Api.channels.CreateChannel({
                  title,
                  about,
                  broadcast: type === 'channel',
                  megagroup: type === 'group'
                }))
                createdEntity = extractCreatedChat(createResult)
                if (!createdEntity) {
                  throw new Error('CREATE_ENTITY_MISSING')
                }
                const inputChannel = await client.getInputEntity(createdEntity as never)
                await client.invoke(new Api.channels.UpdateUsername({
                  channel: inputChannel as never,
                  username
                }))

                completed += 1
                successCount += 1
                if (type === 'group') groupCount += 1
                else channelCount += 1
                emittedItem = {
                  id: createId('batch-create-item'),
                  accountId: account.id,
                  accountLabel,
                  entityType: type,
                  title,
                  about,
                  username,
                  publicLink: `https://t.me/${username}`,
                  status: 'success',
                  message: `已创建公开${type === 'group' ? '群组' : '频道'}：${title}`,
                  createdAt: new Date().toISOString()
                }
                results.push(emittedItem)
                emit(emittedItem.message, emittedItem, true)
                break
              } catch (error) {
                lastError = error
                const fatal = isFatalAccountError(error)
                if (fatal) {
                  this.accountRepository.updateStatus([account.id], fatal.status)
                }
                if (createdEntity) {
                  await rollbackCreatedEntity(client, createdEntity).catch(() => undefined)
                }
                const canRetryUsername = /USERNAME_OCCUPIED|USERNAME_INVALID|USERNAMES_UNAVAILABLE/i.test(error instanceof Error ? error.message : String(error))
                if (!canRetryUsername || retry >= 3 || fatal) {
                  completed += 1
                  failedCount += 1
                  emittedItem = {
                    id: createId('batch-create-item'),
                    accountId: account.id,
                    accountLabel,
                    entityType: type,
                    title,
                    about,
                    username,
                    publicLink: '',
                    status: 'failed',
                    message: fatal ? `这个账号已自动停用：${fatal.message}` : formatBatchCreateError(error),
                    createdAt: new Date().toISOString()
                  }
                  results.push(emittedItem)
                  emit(emittedItem.message, emittedItem, true)
                  break
                }
              }
            }

            if (!emittedItem && lastError) {
              completed += 1
              failedCount += 1
              const fallbackItem: BatchCreateResultItem = {
                id: createId('batch-create-item'),
                accountId: account.id,
                accountLabel,
                entityType: type,
                title,
                about,
                username: '',
                publicLink: '',
                status: 'failed',
                message: formatBatchCreateError(lastError),
                createdAt: new Date().toISOString()
              }
              results.push(fallbackItem)
              emit(fallbackItem.message, fallbackItem, true)
            }

            if (!task.cancelled) {
              await sleep(1200)
            }
          }
        }
      }

      const message = task.cancelled
        ? `批量创建已停止，已处理 ${completed} 条。`
        : `批量创建完成：成功 ${successCount}，失败 ${failedCount}，公开群组 ${groupCount}，公开频道 ${channelCount}。`
      emit(message, null, false)
      return {
        taskId: payload.taskId,
        total,
        completed,
        successCount,
        failedCount,
        groupCount,
        channelCount,
        items: results,
        message,
        stopped: task.cancelled
      }
    } finally {
      await Promise.all(Array.from(task.clients.values()).map((client) => this.clientManager.destroyClient(client).catch(() => undefined)))
      task.clients.clear()
      if (this.activeTask?.id === task.id) {
        this.activeTask = null
      }
    }
  }
}
