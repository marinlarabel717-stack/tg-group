import { Api, utils } from 'telegram'
import bigInt from 'big-integer'
import type { TelegramClient } from 'telegram'
import type { AccountRecord } from '../accounts/types'
import type { AccountRepository } from '../accounts/services/account-repository'
import { SessionLoader } from '../accounts/check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from '../accounts/check-engine/telegram-client-manager'
import { ProxyPoolService, type AccountCheckProxy } from '../proxy-pool/service'
import type { SessionManagerActionKind, SessionManagerActionPayload, SessionManagerActionResult, SessionManagerActionResultItem } from '../../src/types'

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
  if (/CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL/i.test(normalized)) return '当前账号在这个会话里受限'
  if (/Too many requests/i.test(normalized)) return '请求过于频繁，请稍后再试'
  return normalized
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
  await client.invoke(new Api.messages.DeleteHistory({
    peer: entity as never,
    maxId: 0,
    justClear: true,
    revoke: false
  }))
  return '已删除当前账号侧的会话。'
}

async function clearHistory(client: TelegramClient, targetRef: string) {
  const entity = await resolvePeerEntity(client, targetRef)
  await client.invoke(new Api.messages.DeleteHistory({
    peer: entity as never,
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

function readActionLabel(action: SessionManagerActionKind) {
  if (action === 'delete-messages') return '删除消息'
  if (action === 'delete-dialog') return '删除对话'
  if (action === 'clear-history') return '删除聊天记录'
  if (action === 'delete-contact') return '删除联系人'
  return '退出群组/频道'
}

export class SessionManagerService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  async runAction(payload: SessionManagerActionPayload): Promise<SessionManagerActionResult> {
    const targetRefs = Array.from(new Set((payload.targetRefs || []).map((item) => item.trim()).filter(Boolean)))
    const accountIds = Array.from(new Set((payload.accountIds || []).filter((item) => Number.isFinite(item))))
    const accounts = this.repository.getByIds(accountIds)
    const results: SessionManagerActionResultItem[] = []
    const messageIds = Array.from(new Set((payload.messageIds || []).map((item) => Math.trunc(item)).filter((item) => Number.isFinite(item) && item > 0)))

    if (accounts.length === 0) {
      throw new Error('请先选择至少一个账号。')
    }
    if (targetRefs.length === 0) {
      throw new Error('请先填写至少一个目标。')
    }

    for (const account of accounts) {
      let client: TelegramClient | null = null
      try {
        client = await ensureAuthorizedClient(account, this.sessionLoader, this.clientManager, this.proxyPoolService)
        for (const targetRef of targetRefs) {
          try {
            const message = payload.action === 'delete-messages'
              ? await deleteMessages(client, targetRef, messageIds)
              : payload.action === 'delete-dialog'
                ? await deleteDialog(client, targetRef)
                : payload.action === 'clear-history'
                  ? await clearHistory(client, targetRef)
                  : payload.action === 'delete-contact'
                    ? await deleteContact(client, targetRef)
                    : await leaveChat(client, targetRef)
            results.push({
              accountId: account.id,
              accountLabel: readAccountLabel(account),
              targetRef,
              success: true,
              message
            })
          } catch (error) {
            results.push({
              accountId: account.id,
              accountLabel: readAccountLabel(account),
              targetRef,
              success: false,
              message: formatSessionManagerError(error)
            })
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
    return {
      action: payload.action,
      total: results.length,
      successCount,
      failedCount,
      items: results,
      message: `${readActionLabel(payload.action)}完成：成功 ${successCount}，失败 ${failedCount}。`
    }
  }
}
