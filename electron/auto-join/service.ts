import { Api } from 'telegram'
import type { TelegramClient } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { TelethonFreezeChecker, type TelethonFreezeCheckResult } from '../accounts/check-engine/telethon-freeze-checker'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import { TelethonAutoJoiner } from './telethon-auto-joiner'
import type { AutoJoinPayload, AutoJoinPayloadItem, AutoJoinProgress, AutoJoinResultItem, AutoJoinStopResult, AutoJoinTaskResult } from '../../src/types'

interface ActiveAutoJoinTask {
  id: string
  cancelled: boolean
  clients: Map<number, TelegramClient>
  wakeWaiters: Set<() => void>
  joinAbortControllers: Set<AbortController>
  deletePromises: Set<Promise<void>>
}

interface PendingJoinItem extends AutoJoinPayloadItem {
  attempts: number
}

interface JoinExecutionResult {
  status: 'joined' | 'already' | 'requested'
  groupTitle: string
  entity?: unknown
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

function slugifyFileName(input: string) {
  const value = input.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '')
  return value || 'fast_broadcast_image'
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
    || /No user has\s+".+"\s+as username/i.test(normalized)
    || /USERNAME_INVALID|USERNAME_NOT_OCCUPIED/i.test(normalized)
    || /CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)
    || /INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)
}

function formatAutoJoinError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return '原因没拿到'
  if (/BROADCAST_CHANNEL_SKIPPED/i.test(normalized)) return '这是频道，不是群，已经自动跳过了'
  if (/Cannot find any entity corresponding to/i.test(normalized)) return '当前账号暂时识别不了这个群，群未必不存在，建议改用完整 t.me 链接或邀请链接再试'
  if (/No user has\s+".+"\s+as username/i.test(normalized)) return '当前账号暂时识别不了这个群，未必是群不存在，更像是这个账号当前搜不到，建议换完整 t.me 链接或邀请链接再试'
  if (/INVITE_HASH_INVALID|INVITE_HASH_EXPIRED/i.test(normalized)) return '邀请链接失效了，或者已经不能用了'
  if (/CHANNEL_PRIVATE/i.test(normalized)) return '这个群进不去，可能是私密群，或者当前账号没权限'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号加的群太多了，先退几个群再试'
  if (/USERS_TOO_MUCH/i.test(normalized)) return '这个群人数太多，当前方式进不去'
  if (/USERNAME_INVALID/i.test(normalized)) return '@群用户名格式不对，或者这个用户名已经失效了'
  if (/USERNAME_NOT_OCCUPIED/i.test(normalized)) return '@群用户名当前没有被占用，可能是群改名了，或者你填的不是它现在在用的用户名'
  if (/CHANNEL_INVALID|CHAT_ID_INVALID|PEER_ID_INVALID/i.test(normalized)) return '这个群链接或群引用当前解析不了，不代表群一定不存在，建议换完整链接或邀请链接再试'
  if (/USER_BANNED_IN_CHANNEL/i.test(normalized)) return '这个账号在目标群里被限制了'
  if (/CHAT_WRITE_FORBIDDEN/i.test(normalized)) return '这个群现在发不了言，更像是被禁言了'
  if (/CHAT_ADMIN_REQUIRED/i.test(normalized)) return '这个群当前不让这个账号发消息'
  if (/CHAT_RESTRICTED/i.test(normalized)) return '这个群把当前账号限制住了，暂时发不了消息'
  if (/CHAT_SEND_MEDIA_FORBIDDEN/i.test(normalized)) return '这个群不让发图片或媒体'
  if (/CHAT_SEND_PLAIN_FORBIDDEN/i.test(normalized)) return '这个群不让发纯文字'
  if (/CHAT_SEND_PHOTOS_FORBIDDEN/i.test(normalized)) return '这个群不让发图片'
  if (/USER_ALREADY_PARTICIPANT/i.test(normalized)) return '这个账号本来就在群里'
  if (/The server claims it doesn't know about the authorization key|authorization key \(session file\) currently being used|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) return '这个账号的登录凭证已经失效了，或者 Telegram 现在不认这个 session 了，需要重新登录'
  if (/TimeoutError|timed out|ETIMEDOUT|Request timed out/i.test(normalized)) return '连接 Telegram 超时了，更像是网络或代理不稳定，稍后再试会更稳'
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
  if (/^[A-Z0-9_]+$/.test(normalized)) return `加入时出了点问题：${normalized}`
  if (/[A-Za-z]/.test(normalized) && normalized.length >= 60) return '加入时出了点问题，像是 Telegram 返回了异常响应；如果反复出现，优先检查网络、代理和 session 状态'
  return `加入时出了点问题：${normalized}`
}

type AutoJoinFatalAccountState = {
  persistedStatus: 'frozen' | 'banned' | 'session_expired' | 'not_logged_in' | null
  itemMessage: string
  stopMessage: string
}

function readFatalAccountStateFromError(error: unknown): AutoJoinFatalAccountState | null {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return null

  if (/FROZEN_METHOD_INVALID|FROZEN_PARTICIPANT_MISSING|FREEZE_STATE_IN_APP_CONFIG/i.test(normalized)) {
    return {
      persistedStatus: 'frozen',
      itemMessage: '这个账号已经冻结了，已停止继续加群',
      stopMessage: '已冻结，后面的群已不再继续用这个账号加入。'
    }
  }

  if (/PHONE_NUMBER_BANNED|USER_DEACTIVATED_BAN|USER_DEACTIVATED/i.test(normalized)) {
    return {
      persistedStatus: 'banned',
      itemMessage: '这个账号已经封禁了，已停止继续加群',
      stopMessage: '已封禁，后面的群已不再继续用这个账号加入。'
    }
  }

  if (/The server claims it doesn't know about the authorization key|authorization key \(session file\) currently being used|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED/i.test(normalized)) {
    return {
      persistedStatus: 'session_expired',
      itemMessage: '这个账号登录状态失效了，已停止继续加群',
      stopMessage: '登录状态失效，后面的群已不再继续用这个账号加入。'
    }
  }

  if (/ACCOUNT_RESTRICTED/i.test(normalized)) {
    return {
      persistedStatus: null,
      itemMessage: '这个账号当前被限制了，已停止继续加群',
      stopMessage: '当前被限制，后面的群已不再继续用这个账号加入。'
    }
  }

  return null
}

function readFatalAccountStateFromProbe(result: TelethonFreezeCheckResult | null | undefined): AutoJoinFatalAccountState | null {
  if (!result) return null

  if (result.status === 'frozen') {
    return {
      persistedStatus: 'frozen',
      itemMessage: '这个账号已经冻结了，已停止继续加群',
      stopMessage: '已冻结，后面的群已不再继续用这个账号加入。'
    }
  }

  if (result.status === 'not_logged_in') {
    return {
      persistedStatus: 'not_logged_in',
      itemMessage: '这个账号登录状态失效了，已停止继续加群',
      stopMessage: '登录状态失效，后面的群已不再继续用这个账号加入。'
    }
  }

  return null
}

function parseJoinTarget(target: AutoJoinPayloadItem) {
  if (target.kind === 'invite') {
    const matched = target.raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#]+)/i)
    const hash = matched?.[1]?.trim() || target.normalized.replace(/^https:\/\/t\.me\/\+/, '').trim()
    return { kind: 'invite' as const, value: hash }
  }
  return { kind: 'username' as const, value: target.normalized.startsWith('@') ? target.normalized : `@${target.normalized.replace(/^@+/, '')}` }
}

function applySafeModeLimits(payload: AutoJoinPayload) {
  if (!payload.safeModeEnabled) {
    return {
      workerLimit: payload.concurrency,
      accountIntervalMin: payload.accountIntervalMin,
      accountIntervalMax: payload.accountIntervalMax,
      joinIntervalMin: payload.joinIntervalMin,
      joinIntervalMax: payload.joinIntervalMax,
      sendIntervalMin: payload.sendIntervalMin,
      sendIntervalMax: payload.sendIntervalMax,
      floodRestMin: payload.floodRestMin,
      floodRestMax: payload.floodRestMax,
      maxJoinsPerAccount: payload.maxJoinsPerAccount
    }
  }

  return {
    workerLimit: 1,
    accountIntervalMin: Math.max(20, payload.accountIntervalMin),
    accountIntervalMax: Math.max(Math.max(20, payload.accountIntervalMin), Math.max(60, payload.accountIntervalMax)),
    joinIntervalMin: Math.max(90, payload.joinIntervalMin),
    joinIntervalMax: Math.max(Math.max(90, payload.joinIntervalMin), Math.max(180, payload.joinIntervalMax)),
    sendIntervalMin: Math.max(25, payload.sendIntervalMin),
    sendIntervalMax: Math.max(Math.max(25, payload.sendIntervalMin), Math.max(60, payload.sendIntervalMax)),
    floodRestMin: Math.max(20, payload.floodRestMin),
    floodRestMax: Math.max(Math.max(20, payload.floodRestMin), Math.max(45, payload.floodRestMax)),
    maxJoinsPerAccount: Math.max(1, Math.min(20, payload.maxJoinsPerAccount || 3))
  }
}

function readRiskHoldMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return null
  if (/PEER_FLOOD/i.test(normalized)) return '这个账号触发了 Telegram 风控，已停止继续加群，避免越跑越危险。'
  if (/CHANNELS_TOO_MUCH|USER_CHANNELS_TOO_MUCH/i.test(normalized)) return '这个账号加群数量已经太多，已停止继续加群，避免继续触发风控。'
  if (/ACCOUNT_RESTRICTED/i.test(normalized)) return '这个账号当前已被限制，已停止继续加群。'
  return null
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

function extractInviteEntity(source: unknown) {
  const value = source as { chats?: unknown[]; chat?: unknown } | null
  if (Array.isArray(value?.chats) && value.chats[0]) {
    return value.chats[0]
  }
  if (value?.chat) {
    return value.chat
  }
  return null
}

function isBroadcastChannel(entity: unknown) {
  const value = entity as { broadcast?: unknown; megagroup?: unknown } | null
  return Boolean(value?.broadcast) && !Boolean(value?.megagroup)
}

function readSendRestrictedRights(source: unknown) {
  const rights = source as {
    sendMessages?: unknown
    sendMedia?: unknown
    sendPlain?: unknown
    sendPhotos?: unknown
  } | null
  return Boolean(rights?.sendMessages || rights?.sendMedia || rights?.sendPlain || rights?.sendPhotos)
}

async function inspectTargetPreview(client: TelegramClient, item: AutoJoinPayloadItem) {
  const parsed = parseJoinTarget(item)
  if (parsed.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }))
    const entity = extractInviteEntity(invite)
    return {
      entity,
      groupTitle: readGroupTitle(invite, item.normalized),
      isBroadcast: isBroadcastChannel(entity)
    }
  }

  const entity = await resolveJoinEntity(client, parsed.value)
  return {
    entity,
    groupTitle: readGroupTitle(entity, item.normalized),
    isBroadcast: isBroadcastChannel(entity)
  }
}

async function inspectSpeakingAbility(client: TelegramClient, entity: unknown) {
  if (isBroadcastChannel(entity)) return 'channel-skipped' as const
  if (readSendRestrictedRights((entity as { defaultBannedRights?: unknown } | null)?.defaultBannedRights)) {
    return 'muted' as const
  }

  try {
    const participantResult = await client.invoke(new Api.channels.GetParticipant({
      channel: entity as never,
      participant: new Api.InputPeerSelf()
    }))
    const participant = (participantResult as { participant?: unknown }).participant
    if (readSendRestrictedRights((participant as { bannedRights?: unknown } | null)?.bannedRights)) {
      return 'muted' as const
    }
  } catch {
    // ignore permission probe failures and fall back to entity-level rights
  }

  return 'speakable' as const
}

function isSendForbiddenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED|CHAT_ADMIN_REQUIRED|CHAT_SEND_[A-Z_]+_FORBIDDEN/i.test(message)
}

async function leaveJoinedTarget(client: TelegramClient, entity: unknown) {
  const inputPeer = await client.getInputEntity(entity as never)
  if ('channelId' in (inputPeer as object)) {
    await client.invoke(new Api.channels.LeaveChannel({ channel: inputPeer as never }))
    return
  }

  if ('chatId' in (inputPeer as object)) {
    const chatPeer = inputPeer as unknown as { chatId: bigint | number }
    await client.invoke(new Api.messages.DeleteChatUser({
      chatId: chatPeer.chatId as never,
      userId: 'me'
    }))
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

async function joinSingleTarget(client: TelegramClient, item: AutoJoinPayloadItem): Promise<JoinExecutionResult> {
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
        const inviteEntity = Array.isArray((result as { chats?: unknown[] } | null)?.chats)
          ? (result as { chats: unknown[] }).chats[0]
          : undefined
        return {
          status: 'already' as const,
          groupTitle: readGroupTitle(result, item.normalized),
          entity: inviteEntity
        }
      }
      const inviteEntity = Array.isArray((result as { chats?: unknown[] } | null)?.chats)
        ? (result as { chats: unknown[] }).chats[0]
        : undefined
      return {
        status: 'joined' as const,
        groupTitle: readGroupTitle(result, item.normalized),
        entity: inviteEntity
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
        const inviteEntity = 'chat' in (invite as object) ? (invite as { chat?: unknown }).chat : undefined
        return {
          status: 'already' as const,
          groupTitle: readGroupTitle(invite, item.normalized),
          entity: inviteEntity
        }
      }
      throw error
    }
  }

  const entity = await resolveJoinEntity(client, parsed.value)
  if (await isAlreadyInChannel(client, entity)) {
    return {
      status: 'already' as const,
      groupTitle: readGroupTitle(entity, item.normalized),
      entity
    }
  }

  try {
    await client.invoke(new Api.channels.JoinChannel({ channel: entity as never }))
    return {
      status: 'joined' as const,
      groupTitle: readGroupTitle(entity, item.normalized),
      entity
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
        groupTitle: readGroupTitle(entity, item.normalized),
        entity
      }
    }
    throw error
  }
}

async function resolveSendEntity(client: TelegramClient, item: AutoJoinPayloadItem, joinedEntity?: unknown) {
  if (joinedEntity) return joinedEntity
  const parsed = parseJoinTarget(item)
  if (parsed.kind === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }))
    if ('chat' in (invite as object) && (invite as { chat?: unknown }).chat) {
      return (invite as { chat: unknown }).chat
    }
    throw new Error('CHANNEL_INVALID')
  }
  return await resolveJoinEntity(client, parsed.value)
}

async function sendContentToJoinedTarget(client: TelegramClient, entity: unknown, payload: AutoJoinPayload, targetTitle: string) {
  const messageText = payload.messageText.trim()
  const buttonText = payload.buttonText.trim()
  const buttonUrl = payload.buttonUrl.trim()
  const media = payload.imageData.trim() ? resolveMediaFile(payload.imageData, targetTitle || 'fast_broadcast') : undefined
  const replyMarkup = buttonUrl
    ? new Api.ReplyInlineMarkup({
        rows: [
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonUrl({
                text: buttonText || '立即查看',
                url: buttonUrl
              })
            ]
          })
        ]
      })
    : undefined

  const response = await (((client as TelegramClient) as TelegramClient & {
    sendMessage: (peer: unknown, options: Record<string, unknown>) => Promise<unknown>
  }).sendMessage(entity as never, {
    message: messageText || undefined,
    file: media,
    replyMarkup
  }))

  const responseMessage = response as { id?: unknown; message?: { id?: unknown } } | null
  if (typeof responseMessage?.id === 'number' && responseMessage.id > 0) {
    return responseMessage.id
  }
  if (typeof responseMessage?.message?.id === 'number' && responseMessage.message.id > 0) {
    return responseMessage.message.id
  }
  return null
}

async function deleteSentMessage(client: TelegramClient, entity: unknown, messageId: number) {
  await (((client as TelegramClient) as TelegramClient & {
    deleteMessages: (peer: unknown, messageIds: number[], options: { revoke?: boolean }) => Promise<unknown>
  }).deleteMessages(entity as never, [messageId], { revoke: true }))
}

function readMessageText(message: unknown) {
  const source = message as { message?: unknown; text?: unknown; rawText?: unknown } | null
  if (typeof source?.message === 'string') return source.message.trim()
  if (typeof source?.text === 'string') return source.text.trim()
  if (typeof source?.rawText === 'string') return source.rawText.trim()
  return ''
}

function readMessageDateMs(message: unknown) {
  const source = message as { date?: unknown } | null
  const raw = source?.date
  if (raw instanceof Date) return raw.getTime()
  if (typeof raw === 'number') return raw > 1_000_000_000_000 ? raw : raw * 1000
  if (typeof raw === 'bigint') return Number(raw) * 1000
  if (typeof raw === 'string' && raw.trim()) {
    const time = new Date(raw).getTime()
    return Number.isFinite(time) ? time : null
  }
  return null
}

async function wasMessageActuallySent(client: TelegramClient, entity: unknown, payload: AutoJoinPayload, startedAtMs: number) {
  const expectedText = payload.messageText.trim()
  const expectedHasMedia = Boolean(payload.imageData.trim())
  const messages = await ((client as TelegramClient) as TelegramClient & {
    getMessages: (peer: unknown, params: Record<string, unknown>) => Promise<Array<{ out?: unknown; media?: unknown; message?: unknown; text?: unknown; rawText?: unknown; date?: unknown }>>
  }).getMessages(entity as never, { limit: 6 })

  if (!Array.isArray(messages) || messages.length === 0) return false

  return messages.some((message) => {
    const out = Boolean((message as { out?: unknown }).out)
    if (!out) return false
    const sentAtMs = readMessageDateMs(message)
    if (typeof sentAtMs === 'number' && sentAtMs + 15_000 < startedAtMs) return false
    const actualText = readMessageText(message)
    const actualHasMedia = Boolean((message as { media?: unknown }).media)
    const textMatched = expectedText ? actualText === expectedText : true
    const mediaMatched = expectedHasMedia ? actualHasMedia : true
    return textMatched && mediaMatched
  })
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
    private readonly telethonFreezeChecker: TelethonFreezeChecker,
    private readonly telethonAutoJoiner: TelethonAutoJoiner
  ) {}

  private async probeAccountState(account: AccountRecord) {
    try {
      const proxy = this.getCurrentProxy()
      return await this.telethonFreezeChecker.check(account.sessionPath, 20, toClientProxy(proxy))
    } catch {
      return null
    }
  }

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
      message: '极速群发任务已停止。'
    }
  }

  async start(payload: AutoJoinPayload, onProgress?: (payload: AutoJoinProgress) => void): Promise<AutoJoinTaskResult> {
    if (this.activeTask) {
      throw new Error('已经有极速群发任务在执行了，请先停掉当前任务。')
    }

    const accountIds = Array.from(new Set(payload.accountIds.filter((item): item is number => typeof item === 'number')))
    const requestedAccounts = this.accountRepository.getByIds(accountIds)
    const accounts = requestedAccounts.filter((account) => account.status !== 'banned' && account.status !== 'frozen' && account.status !== 'session_expired' && account.status !== 'not_logged_in')
    const safeModeLimits = applySafeModeLimits(payload)
    const workerLimit = Math.max(1, Math.min(safeModeLimits.workerLimit || accounts.length, accounts.length))
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
        speakableCount: 0,
        mutedCount: 0,
        channelSkippedCount: 0,
        sendSuccessCount: 0,
        sendSkippedCount: 0,
        sendFailedCount: 0,
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
      joinAbortControllers: new Set(),
      deletePromises: new Set()
    }
    this.activeTask = task
    const needsMessage = payload.mode !== 'join-only'
    const requiresNativeInspection = needsMessage || payload.skipChannelsEnabled || payload.leaveMutedGroupsEnabled || payload.mode === 'join-only'
    const useTelethonPrimary = this.telethonAutoJoiner.isAvailable() && !requiresNativeInspection
    const results: AutoJoinResultItem[] = []
    const accountById = new Map(accounts.map((item) => [item.id, item]))
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
    const accountJoinCounts = new Map<number, number>()
    const stoppedAccountIds = new Set<number>()
    let completed = 0
    let successCount = 0
    let alreadyCount = 0
    let requestedCount = 0
    let failedCount = 0
    let speakableCount = 0
    let mutedCount = 0
    let channelSkippedCount = 0
    let sendSuccessCount = 0
    let sendSkippedCount = 0
    let sendFailedCount = 0

    const emit = (message: string, item?: AutoJoinResultItem | null, waitSeconds?: number | null, running = true) => {
      onProgress?.({
        taskId: payload.taskId,
        total,
        completed,
        successCount,
        alreadyCount,
        requestedCount,
        failedCount,
        speakableCount,
        mutedCount,
        channelSkippedCount,
        sendSuccessCount,
        sendSkippedCount,
        sendFailedCount,
        running,
        item,
        message,
        waitSeconds: waitSeconds ?? null
      })
    }

    const finalizeResult = (item: AutoJoinResultItem) => {
      results.push(item)
      completed += 1
      if (item.joinCategory === 'channel-skipped') {
        channelSkippedCount += 1
      }
      if (item.status === 'joined') {
        successCount += 1
        accountJoinCounts.set(item.accountId ?? -1, (accountJoinCounts.get(item.accountId ?? -1) ?? 0) + 1)
      } else if (item.status === 'already') {
        alreadyCount += 1
        accountJoinCounts.set(item.accountId ?? -1, (accountJoinCounts.get(item.accountId ?? -1) ?? 0) + 1)
      } else if (item.status === 'requested') {
        requestedCount += 1
        accountJoinCounts.set(item.accountId ?? -1, (accountJoinCounts.get(item.accountId ?? -1) ?? 0) + 1)
      } else if (item.joinCategory !== 'channel-skipped') failedCount += 1
      if (item.joinCategory === 'speakable') speakableCount += 1
      if (item.joinCategory === 'muted') mutedCount += 1
      emit(item.errorMessage || '自动加群进度已更新。', item, null, true)
    }

    const finalizeSendState = (item: AutoJoinResultItem, status: 'sent' | 'skipped' | 'failed', message: string) => {
      item.sendStatus = status
      item.sendErrorMessage = message
      item.sentAt = new Date().toISOString()
      if (status === 'sent') sendSuccessCount += 1
      else if (status === 'skipped') sendSkippedCount += 1
      else sendFailedCount += 1
      emit(message, item, null, true)
    }

    const scheduleDeleteAfterSend = (client: TelegramClient, entity: unknown, messageId: number, accountLabel: string, targetLabel: string) => {
      if (!payload.autoDeleteSentMessages || !Number.isFinite(messageId) || messageId <= 0) return
      const waitMs = Math.max(1, payload.deleteSentAfterSeconds) * 1000
      const deletePromise = (async () => {
        await sleepForTask(task, waitMs)
        if (task.cancelled) return
        try {
          await deleteSentMessage(client, entity, messageId)
          emit(`${accountLabel} 已自动删除 ${targetLabel} 刚发出的消息。`, null, null, true)
        } catch (error) {
          emit(`${accountLabel} 自动删除消息失败：${formatAutoJoinError(error)}`, null, null, true)
        }
      })().finally(() => {
        task.deletePromises.delete(deletePromise)
      })
      task.deletePromises.add(deletePromise)
    }

    const sendToResolvedTarget = async (client: TelegramClient, accountId: number, accountLabel: string, sourceItem: AutoJoinPayloadItem, targetLabel: string, resultItem: AutoJoinResultItem, roundLabel?: string) => {
      let resolvedEntity: unknown | null = null
      try {
        resolvedEntity = await resolveSendEntity(client, sourceItem)
        const sentMessageId = await sendContentToJoinedTarget(client, resolvedEntity, payload, targetLabel)
        finalizeSendState(resultItem, 'sent', `${accountLabel} 已向 ${targetLabel} 发送内容${roundLabel ? `（${roundLabel}）` : ''}。`)
        if (sentMessageId) {
          scheduleDeleteAfterSend(client, resolvedEntity, sentMessageId, accountLabel, targetLabel)
        }
        return
      } catch (sendError) {
        try {
          const verifyEntity = resolvedEntity ?? await resolveSendEntity(client, sourceItem)
          const confirmedSent = await wasMessageActuallySent(client, verifyEntity, payload, Date.now() - 3_000)
          if (confirmedSent) {
            finalizeSendState(resultItem, 'sent', `${accountLabel} 已向 ${targetLabel} 发出内容；虽然 Telegram 回了异常，但实际已经发成功${roundLabel ? `（${roundLabel}）` : ''}。`)
            return
          }
          resolvedEntity = verifyEntity
        } catch {
          // ignore verification failures and keep original error handling
        }

        const fatal = readFatalAccountStateFromError(sendError)
        if (fatal) {
          if (fatal.persistedStatus) {
            this.accountRepository.updateStatus([accountId], fatal.persistedStatus)
          }
          stoppedAccountIds.add(accountId)
          finalizeSendState(resultItem, 'failed', `发送时发现账号状态异常：${fatal.itemMessage}`)
          emit(`${accountLabel} ${fatal.stopMessage}`, null, null, true)
          return
        }

        if (payload.leaveMutedGroupsEnabled && isSendForbiddenError(sendError) && resolvedEntity) {
          try {
            await leaveJoinedTarget(client, resolvedEntity)
            finalizeSendState(resultItem, 'failed', `发送失败：${formatAutoJoinError(sendError)}，已自动退群。`)
          } catch {
            finalizeSendState(resultItem, 'failed', `发送失败：${formatAutoJoinError(sendError)}，不过自动退群没成功。`)
          }
        } else {
          finalizeSendState(resultItem, 'failed', `发送失败：${formatAutoJoinError(sendError)}`)
        }
      }
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
          const preflightState = await this.probeAccountState(account)
          const preflightFatal = readFatalAccountStateFromProbe(preflightState)
          if (preflightFatal) {
            if (preflightFatal.persistedStatus) {
              this.accountRepository.updateStatus([account.id], preflightFatal.persistedStatus)
            }
            emit(`${accountLabel} ${preflightFatal.stopMessage}`, null, null, true)
            return
          }

          if (!useTelethonPrimary || needsMessage) {
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
          if (payload.safeModeEnabled) {
            const joinedCount = accountJoinCounts.get(account.id) ?? 0
            if (joinedCount >= safeModeLimits.maxJoinsPerAccount) {
              emit(`${accountLabel} 已达到本轮防冻结上限（${safeModeLimits.maxJoinsPerAccount} 个），这个号先停在这里。`, null, null, true)
              return
            }
          }

          if (stoppedAccountIds.has(account.id)) {
            emit(`${accountLabel} 当前已经停用，后面的目标不再继续跑。`, null, null, true)
            return
          }

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
            let previewEntity: unknown | undefined
            let previewTitle = next.normalized
            if (client && (payload.skipChannelsEnabled || payload.mode === 'join-only')) {
              const preview = await inspectTargetPreview(client, next)
              previewEntity = preview.entity ?? undefined
              previewTitle = preview.groupTitle || previewTitle
              if (payload.skipChannelsEnabled && preview.isBroadcast) {
                finalizeResult({
                  itemId: next.id,
                  raw: next.raw,
                  normalized: next.normalized,
                  status: 'failed',
                  joinCategory: 'channel-skipped',
                  errorMessage: '这是频道，不是群，已经自动跳过。',
                  accountId: account.id,
                  accountLabel,
                  groupTitle: preview.groupTitle,
                  joinedAt: new Date().toISOString(),
                  attempt
                })
                continue
              }
            }

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

            const resultItem: AutoJoinResultItem = {
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
            }

            if (payload.mode === 'join-only') {
              if (joined.status === 'requested') {
                resultItem.joinCategory = 'requested'
                resultItem.errorMessage = '这个群需要管理员通过，先归到需验证。'
              } else if (client) {
                const speakable = await inspectSpeakingAbility(client, ('entity' in joined ? joined.entity : undefined) ?? previewEntity)
                if (speakable === 'muted') {
                  resultItem.joinCategory = 'muted'
                  resultItem.errorMessage = '这个群能进，但当前账号发不了言，已归到禁言群。'
                  if (payload.leaveMutedGroupsEnabled) {
                    try {
                      await leaveJoinedTarget(client, ('entity' in joined ? joined.entity : undefined) ?? previewEntity)
                      resultItem.errorMessage = '这个群能进但发不了言，已归到禁言群，并已自动退群。'
                    } catch {
                      resultItem.errorMessage = '这个群能进但发不了言，已归到禁言群；不过自动退群没成功。'
                    }
                  }
                } else {
                  resultItem.joinCategory = 'speakable'
                  resultItem.errorMessage = '这个群已归到可发言。'
                }
              }
            }

            finalizeResult(resultItem)

            if (needsMessage) {
              if (payload.mode === 'join-and-send' && joined.status !== 'requested') {
                await sendToResolvedTarget(client as TelegramClient, account.id, accountLabel, {
                  id: next.id,
                  raw: next.raw,
                  normalized: next.normalized,
                  kind: next.kind
                }, joined.groupTitle || next.normalized, resultItem)
              } else if (payload.mode === 'join-and-send') {
                finalizeSendState(resultItem, 'skipped', '当前群还在审核中，这次先不发送。')
              }
            }

            if (shouldWaitAfterAttempt(account.id)) {
              const baseDelay = pickDelayMs(safeModeLimits.accountIntervalMin, safeModeLimits.accountIntervalMax)
              const joinDelay = pickDelayMs(safeModeLimits.joinIntervalMin, safeModeLimits.joinIntervalMax)
              const sendDelay = needsMessage && payload.mode === 'join-and-send'
                ? pickDelayMs(safeModeLimits.sendIntervalMin, safeModeLimits.sendIntervalMax)
                : 0
              const totalWaitSeconds = Math.max(1, Math.ceil((baseDelay + joinDelay + sendDelay) / 1000))
              emit(`${accountLabel} 等待 ${totalWaitSeconds} 秒后，继续加入下一个。`, null, totalWaitSeconds, true)
              await sleepForTask(task, baseDelay + joinDelay + sendDelay)
            }
          } catch (error) {
            if (task.cancelled) {
              return
            }

            const waitSeconds = readRequiredWaitSeconds(error)
            if (waitSeconds && payload.autoRetryOnFloodWait && attempt <= Math.max(1, payload.retryLimit + 1)) {
              const configuredRestMs = pickDelayMs(safeModeLimits.floodRestMin, safeModeLimits.floodRestMax)
              const finalWaitMs = Math.max(waitSeconds * 1000, configuredRestMs)
              cooldownUntil.set(account.id, Date.now() + finalWaitMs)
              pushBackItem(account.id, { ...next, attempts: attempt })
              emit(`${accountLabel} 触发限流，先休息 ${Math.ceil(finalWaitMs / 1000)} 秒后继续。`, null, Math.ceil(finalWaitMs / 1000), true)
              continue
            }

            const fatalAccountStateFromError = readFatalAccountStateFromError(error)
            const fatalAccountState = fatalAccountStateFromError ?? (isMissingTargetError(error) ? readFatalAccountStateFromProbe(await this.probeAccountState(account)) : null)

            if (fatalAccountState) {
              if (fatalAccountState.persistedStatus) {
                this.accountRepository.updateStatus([account.id], fatalAccountState.persistedStatus)
              }

              finalizeResult({
                itemId: next.id,
                raw: next.raw,
                normalized: next.normalized,
                status: 'failed',
                errorMessage: fatalAccountState.itemMessage,
                accountId: account.id,
                accountLabel,
                groupTitle: '',
                joinedAt: new Date().toISOString(),
                attempt
              })
              emit(`${accountLabel} ${fatalAccountState.stopMessage}`, null, null, true)
              return
            }

            const riskHoldMessage = payload.safeModeEnabled ? readRiskHoldMessage(error) : null
            if (riskHoldMessage) {
              finalizeResult({
                itemId: next.id,
                raw: next.raw,
                normalized: next.normalized,
                status: 'failed',
                errorMessage: riskHoldMessage,
                accountId: account.id,
                accountLabel,
                groupTitle: '',
                joinedAt: new Date().toISOString(),
                attempt
              })
              emit(`${accountLabel} ${riskHoldMessage}`, null, null, true)
              return
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
              const waitMs = pickDelayMs(safeModeLimits.accountIntervalMin, safeModeLimits.accountIntervalMax)
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

      const pendingStopMessage = payload.safeModeEnabled
        ? '防冻结保护已触发：当前账号都已达到本轮上限或被系统判定有风险，剩余目标已停止。'
        : '没有可用账号继续执行这条加群任务'

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
                errorMessage: pendingStopMessage,
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
              errorMessage: pendingStopMessage,
              accountId: null,
              accountLabel: '',
              groupTitle: '',
              joinedAt: new Date().toISOString(),
              attempt: next.attempts
            })
          }
        }
      }

      if (!task.cancelled && needsMessage && payload.mode === 'join-then-send') {
        const sendCandidates = results.filter((item) => (item.status === 'joined' || item.status === 'already') && typeof item.accountId === 'number')
        if (sendCandidates.length > 0) {
          emit(`加群阶段已完成，开始发送内容（共 ${sendCandidates.length} 个群）。`, null, null, true)
        }

        for (const item of sendCandidates) {
          if (task.cancelled) break
          const accountId = item.accountId
          if (typeof accountId !== 'number') {
            finalizeSendState(item, 'skipped', '没有拿到发送账号，这条先跳过。')
            continue
          }

          let client = clients.get(accountId) ?? null
          if (!client) {
            const account = accountById.get(accountId)
            if (!account) {
              finalizeSendState(item, 'skipped', '没找到对应账号，这条先跳过。')
              continue
            }
            try {
              client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
              clients.set(accountId, client)
            } catch (error) {
              const fatal = readFatalAccountStateFromError(error)
              if (fatal?.persistedStatus) {
                this.accountRepository.updateStatus([accountId], fatal.persistedStatus)
              }
              if (fatal) {
                stoppedAccountIds.add(accountId)
              }
              finalizeSendState(item, 'failed', fatal ? `发送前发现账号状态异常：${fatal.itemMessage}` : `发送前账号登录失效：${formatAutoJoinError(error)}`)
              continue
            }
          }

          if (stoppedAccountIds.has(accountId)) {
            finalizeSendState(item, 'skipped', '这个账号已经停掉了，后面的发送先不继续。')
            continue
          }

          try {
            const sourceItem: AutoJoinPayloadItem = {
              id: item.itemId,
              raw: item.raw,
              normalized: item.normalized,
              kind: item.normalized.startsWith('https://t.me/+') ? 'invite' : 'username'
            }
            await sendToResolvedTarget(client, accountId, item.accountLabel || '当前账号', sourceItem, item.groupTitle || item.normalized, item)
          } catch (error) {
            finalizeSendState(item, 'failed', `发送失败：${formatAutoJoinError(error)}`)
          }

          if (!task.cancelled && sendCandidates.indexOf(item) < sendCandidates.length - 1) {
            const waitMs = pickDelayMs(safeModeLimits.sendIntervalMin, safeModeLimits.sendIntervalMax)
            const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000))
            emit(`${item.accountLabel || '当前账号'} 等待 ${waitSeconds} 秒后继续发送下一个。`, null, waitSeconds, true)
            await sleepForTask(task, waitMs)
          }
        }
      }

      if (!task.cancelled && needsMessage && payload.loopSendEnabled) {
        const loopCandidates = results.filter((item) => (item.status === 'joined' || item.status === 'already') && typeof item.accountId === 'number')
        let round = 2

        if (loopCandidates.length > 0) {
          emit(`首轮群发已完成，后面会按 ${payload.loopSendIntervalMinutes} 分钟间隔继续循环群发。`, null, null, true)
        }

        while (!task.cancelled && loopCandidates.length > 0) {
          const waitMs = Math.max(1, payload.loopSendIntervalMinutes) * 60 * 1000
          emit(`第 ${round} 轮循环群发将在 ${Math.max(1, payload.loopSendIntervalMinutes)} 分钟后开始。`, null, Math.ceil(waitMs / 1000), true)
          await sleepForTask(task, waitMs)
          if (task.cancelled) break

          emit(`开始第 ${round} 轮循环群发（共 ${loopCandidates.length} 个群）。`, null, null, true)

          for (let index = 0; index < loopCandidates.length; index += 1) {
            const item = loopCandidates[index]
            if (task.cancelled) break
            const accountId = item.accountId
            if (typeof accountId !== 'number') {
              finalizeSendState(item, 'skipped', '没有拿到发送账号，这条先跳过。')
              continue
            }

            let client = clients.get(accountId) ?? null
            if (!client) {
              const account = accountById.get(accountId)
              if (!account) {
                finalizeSendState(item, 'skipped', '没找到对应账号，这条先跳过。')
                continue
              }
              try {
                client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
                clients.set(accountId, client)
              } catch (error) {
                const fatal = readFatalAccountStateFromError(error)
                if (fatal?.persistedStatus) {
                  this.accountRepository.updateStatus([accountId], fatal.persistedStatus)
                }
                if (fatal) {
                  stoppedAccountIds.add(accountId)
                }
                finalizeSendState(item, 'failed', fatal ? `发送前发现账号状态异常：${fatal.itemMessage}` : `发送前账号登录失效：${formatAutoJoinError(error)}`)
                continue
              }
            }

            if (stoppedAccountIds.has(accountId)) {
              finalizeSendState(item, 'skipped', '这个账号已经停掉了，后面的发送先不继续。')
              continue
            }

            const sourceItem: AutoJoinPayloadItem = {
              id: item.itemId,
              raw: item.raw,
              normalized: item.normalized,
              kind: item.normalized.startsWith('https://t.me/+') ? 'invite' : 'username'
            }
            await sendToResolvedTarget(client, accountId, item.accountLabel || '当前账号', sourceItem, item.groupTitle || item.normalized, item, `第 ${round} 轮`)

            if (!task.cancelled && index < loopCandidates.length - 1) {
              const perSendWaitMs = pickDelayMs(safeModeLimits.sendIntervalMin, safeModeLimits.sendIntervalMax)
              const perSendWaitSeconds = Math.max(1, Math.ceil(perSendWaitMs / 1000))
              emit(`${item.accountLabel || '当前账号'} 等待 ${perSendWaitSeconds} 秒后继续发送下一个。`, null, perSendWaitSeconds, true)
              await sleepForTask(task, perSendWaitMs)
            }
          }

          round += 1
        }
      }

      const message = task.cancelled
        ? `极速群发已停止，已执行 ${completed} 条。`
        : needsMessage
          ? `极速群发完成：加群成功 ${successCount}，已在群里 ${alreadyCount}，待审核 ${requestedCount}，失败 ${failedCount}，频道跳过 ${channelSkippedCount}；发送成功 ${sendSuccessCount}，跳过 ${sendSkippedCount}，发送失败 ${sendFailedCount}。`
          : `极速群发完成：可发言 ${speakableCount}，需验证 ${requestedCount}，禁言群 ${mutedCount}，已在群里 ${alreadyCount}，失败 ${failedCount}，频道跳过 ${channelSkippedCount}。`

      emit(message, null, null, false)
      return {
        taskId: payload.taskId,
        total,
        successCount,
        alreadyCount,
        requestedCount,
        failedCount,
        speakableCount,
        mutedCount,
        channelSkippedCount,
        sendSuccessCount,
        sendSkippedCount,
        sendFailedCount,
        items: results,
        message,
        stopped: task.cancelled
      }
    } finally {
      await Promise.all(Array.from(task.deletePromises))
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
