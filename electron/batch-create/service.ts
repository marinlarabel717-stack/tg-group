import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'
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

function pickDelayMs(minSeconds: number, maxSeconds: number) {
  const min = Math.max(0, Math.min(minSeconds, maxSeconds))
  const max = Math.max(min, Math.max(minSeconds, maxSeconds))
  const minMs = Math.round(min * 1000)
  const maxMs = Math.round(max * 1000)
  if (maxMs <= minMs) return minMs
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

function slugifyFileName(input: string) {
  const value = input.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '')
  return value || 'batch_create_post'
}

function inferImageExtension(mimeType: string) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'bin'
}

function resolveMediaFile(imageData: string, title: string) {
  const value = imageData.trim()
  if (!value) return undefined
  if (value.startsWith('data:')) {
    const matched = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!matched) throw new Error('图片 Data URL 格式不正确')
    const mimeType = matched[1] || 'application/octet-stream'
    const encoded = matched[3] || ''
    const buffer = matched[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded), 'utf8')
    const extension = inferImageExtension(mimeType)
    return new CustomFile(`${slugifyFileName(title)}.${extension}`, buffer.length, '', buffer)
  }
  return value
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

function readNonEmptyLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function pickSequentialValue(lines: string[], sequenceIndex: number) {
  if (sequenceIndex < 0 || lines.length === 0) return ''
  return lines[sequenceIndex] ?? ''
}

function expandTemplate(input: string, context: { accountId: number; index: number; type: 'group' | 'channel' }) {
  const base = input || ''
  return base
    .replace(/\{accountId\}/gi, String(context.accountId))
    .replace(/\{index\}|\{n\}/gi, String(context.index + 1))
    .replace(/\{type\}/gi, context.type === 'group' ? 'group' : 'channel')
    .replace(/\{rand(\d+)\}/gi, (_matched, sizeText: string) => randomAlphaNumeric(Math.max(1, Math.min(24, Number(sizeText) || 6))))
}

function buildTitle(payload: BatchCreatePayload, context: { accountId: number; index: number; type: 'group' | 'channel' }, sequenceIndex: number, customTitles: string[]) {
  const typeLabel = context.type === 'group' ? '群组' : '频道'
  if (payload.randomTitleEnabled) {
    return `${typeLabel}_${randomAlphaNumeric(Math.max(4, Math.min(10, payload.randomLength)) )}`
  }
  const sequentialValue = pickSequentialValue(customTitles, sequenceIndex)
  const template = sequentialValue || payload.titleTemplate.trim()
  if (!template) {
    return expandTemplate(`${typeLabel}_{accountId}_{index}`, context)
  }
  return hasTemplateTokens(template) ? expandTemplate(template, context) : template
}

function buildAbout(payload: BatchCreatePayload, context: { accountId: number; index: number; type: 'group' | 'channel' }, title: string) {
  if (payload.randomAboutEnabled) {
    return `${title} ${randomAlphaNumeric(Math.max(4, Math.min(10, payload.randomLength)))}`
  }
  const template = payload.aboutTemplate.trim()
  if (!template) return ''
  return hasTemplateTokens(template) ? expandTemplate(template, context) : template
}

function normalizeUsername(raw: string) {
  const trimmed = raw.trim()
  const matchedLink = trimmed.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([a-zA-Z0-9_]+)/i)
  const source = matchedLink?.[1] || trimmed.replace(/^@+/, '')
  let value = source.toLowerCase().replace(/[^a-z0-9_]+/g, '')
  if (!/^[a-z]/.test(value)) {
    value = `tg${value}`
  }
  if (value.length < 5) {
    value = `${value}${randomAlphaNumeric(5 - value.length)}`
  }
  return value.slice(0, 32)
}

function buildUsername(
  payload: BatchCreatePayload,
  context: { accountId: number; index: number; type: 'group' | 'channel' },
  retry: number,
  sequenceIndex: number,
  customUsernames: string[]
) {
  const typePrefix = context.type === 'group' ? 'g' : 'c'
  if (payload.randomUsernameEnabled) {
    return normalizeUsername(`tg${typePrefix}${randomAlphaNumeric(Math.max(5, Math.min(20, payload.randomLength + retry)))}`)
  }

  const sequentialValue = pickSequentialValue(customUsernames, sequenceIndex)
  const sourceTemplate = sequentialValue || payload.usernameTemplate.trim() || `tg${typePrefix}_{accountId}_{index}`
  const expanded = hasTemplateTokens(sourceTemplate) ? expandTemplate(sourceTemplate, context) : sourceTemplate
  let value = normalizeUsername(expanded)
  if (retry > 0) {
    value = normalizeUsername(`${value}_${randomAlphaNumeric(Math.min(6, retry + 2))}`)
  }
  return value
}

function formatBatchCreateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '创建失败，原因没拿到。'
  if (/BATCH_CREATE_POST_IMAGE_REQUIRED/i.test(normalized)) return '你选择了图文首帖，但还没上传图片。'
  if (/BATCH_CREATE_POST_CONTENT_REQUIRED/i.test(normalized)) return '你开启了首帖发送，但文案和图片至少要填一个。'
  if (/GLOBAL_PROXY_REQUIRED/i.test(normalized)) return '全局代理已开启，但当前没有可用代理。'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号登录已经失效了。'
  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN/i.test(normalized)) return '这个账号已经被封了。'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '这个账号当前被 Telegram 限制了。'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号创建得太多了，Telegram 不让继续建了。'
  if (/CHANNELS_ADMIN_PUBLIC_TOO_MUCH/i.test(normalized)) return '这个账号公开群/频道数量已经到上限了。'
  if (/PHOTO_INVALID|MEDIA_INVALID|IMAGE_PROCESS_FAILED/i.test(normalized)) return '首帖图片格式不对，Telegram 没能处理这张图。'
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/i.test(normalized)) return '首帖文案太长了，缩短一点再试。'
  if (/USERNAME_OCCUPIED/i.test(normalized)) return '这个公开链接已经被占用了。'
  if (/USERNAME_INVALID/i.test(normalized)) return '这个公开链接格式不对，只能用字母、数字和下划线。'
  if (/USERNAMES_UNAVAILABLE/i.test(normalized)) return '这个公开链接当前不可用。'
  if (/CHAT_TITLE_EMPTY/i.test(normalized)) return '群名或频道名不能为空。'
  if (/CHAT_ABOUT_TOO_LONG|ABOUT_TOO_LONG/i.test(normalized)) return '简介太长了，缩短一点再试。'
  if (/No user has\s+"username"/i.test(normalized)) return '当前公开链接没设置成功。'
  if (/Too many requests/i.test(normalized)) return '请求过于频繁，请稍后再试。'
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

async function sendInitialPostToChannel(client: TelegramClient, entity: unknown, payload: BatchCreatePayload, title: string) {
  if (payload.postType === 'none') return
  const message = payload.postText.trim() || undefined
  const file = payload.postType === 'photo' ? resolveMediaFile(payload.postImageData, title) : undefined
  await (((client as TelegramClient) as TelegramClient & {
    sendMessage: (peer: unknown, options: Record<string, unknown>) => Promise<unknown>
  }).sendMessage(entity as never, {
    message,
    file
  }))
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

    if (payload.postType === 'photo' && !payload.postImageData.trim()) {
      throw new Error('BATCH_CREATE_POST_IMAGE_REQUIRED')
    }
    if (payload.postType !== 'none' && !payload.postText.trim() && !(payload.postType === 'photo' && payload.postImageData.trim())) {
      throw new Error('BATCH_CREATE_POST_CONTENT_REQUIRED')
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
    let sequenceIndex = 0
    const customTitles = readNonEmptyLines(payload.titleTemplate)
    const customUsernames = readNonEmptyLines(payload.usernameTemplate)

    const emit = (message: string, item?: BatchCreateResultItem | null, running = true, waitSeconds?: number | null) => {
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
        message,
        waitSeconds: waitSeconds ?? null
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
              sequenceIndex += 1
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
            const currentSequenceIndex = sequenceIndex
            sequenceIndex += 1
            const title = buildTitle(payload, context, currentSequenceIndex, customTitles)
            const about = buildAbout(payload, context, title)
            let lastError: unknown = null
            let emittedItem: BatchCreateResultItem | null = null
            let postFailureMessage = ''

            for (let retry = 0; retry < 4; retry += 1) {
              let createdEntity: unknown = null
              let rollbackAllowed = true
              const username = buildUsername(payload, context, retry, currentSequenceIndex, customUsernames)
              emit(`${accountLabel} 开始创建公开${type === 'group' ? '群组' : '频道'}：${title}（准备绑定 ${username}）`, null, true)
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
                rollbackAllowed = false

                if (type === 'channel' && payload.postType !== 'none') {
                  emit(`${accountLabel} 公开频道 ${title} 创建完成，开始发送首帖。`, null, true)
                  try {
                    await sendInitialPostToChannel(client, createdEntity, payload, title)
                    emit(`${accountLabel} 已向频道 ${title} 发送首帖。`, null, true)
                  } catch (postError) {
                    postFailureMessage = formatBatchCreateError(postError)
                    emit(`${accountLabel} 频道 ${title} 已创建成功，但首帖发送失败：${postFailureMessage}`, null, true)
                  }
                }

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
                  message: `已创建公开${type === 'group' ? '群组' : '频道'}：${title}${type === 'channel' && payload.postType !== 'none' ? (postFailureMessage ? `，但首帖发送失败：${postFailureMessage}` : '，并已发送首帖') : ''}`,
                  createdAt: new Date().toISOString()
                }
                results.push(emittedItem)
                emit(emittedItem.message, emittedItem, true)
                break
              } catch (error) {
                lastError = error
                const fatal = isFatalAccountError(error)
                const waitSeconds = readRequiredWaitSeconds(error)
                if (fatal) {
                  this.accountRepository.updateStatus([account.id], fatal.status)
                }
                if (createdEntity && rollbackAllowed) {
                  await rollbackCreatedEntity(client, createdEntity).catch(() => undefined)
                }
                if (payload.autoWaitOnFlood && waitSeconds && !fatal) {
                  emit(`${accountLabel} 创建得有点频繁了，先自动等待 ${waitSeconds} 秒再继续。`, null, true, waitSeconds)
                  await sleep(waitSeconds * 1000)
                  retry -= 1
                  continue
                }
                const canRetryUsername = /USERNAME_OCCUPIED|USERNAME_INVALID|USERNAMES_UNAVAILABLE/i.test(error instanceof Error ? error.message : String(error))
                if (canRetryUsername && retry < 3 && !fatal) {
                  emit(`${accountLabel} 绑定公开链接 ${username} 失败，系统准备自动重试。`, null, true)
                }
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
              const delayMs = pickDelayMs(payload.createIntervalMin, payload.createIntervalMax)
              if (delayMs > 0) {
                const waitSeconds = Math.max(1, Math.ceil(delayMs / 1000))
                emit(`${accountLabel} 等待 ${waitSeconds} 秒后继续创建下一个。`, null, true, waitSeconds)
                await sleep(delayMs)
              }
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
