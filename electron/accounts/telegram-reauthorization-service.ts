import fs from 'node:fs/promises'
import type { TelegramClient } from 'telegram'
import type { AccountRecord, ReauthorizeOperationPayload, ReauthorizeOperationResultItem, ReauthorizeOperationStatus } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { getSessionsModule, getTelegramModule } from './check-engine/gramjs-runtime'
import { ProxyPoolService } from '../proxy-pool/service'

const { computeCheck } = require('telegram/Password') as { computeCheck: (request: unknown, password: string) => Promise<unknown> }

function splitPasswordCandidates(input: string) {
  return Array.from(new Set(
    input
      .split(/\||\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  ))
}

function formatReauthorizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const upper = message.trim().toUpperCase()
  const lower = message.trim().toLowerCase()

  if (upper.includes('PASSWORD_HASH_INVALID') || upper.includes('PASSWORDHASHINVALIDERROR')) {
    return '旧密码不匹配。'
  }
  if (upper.includes('PASSWORD_MISSING') || upper.includes('SESSION_PASSWORD_NEEDED')) {
    return '这个账号当前需要正确的旧密码才能继续。'
  }
  if (upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED') || lower.includes('not authorized') || lower.includes('unauthorized')) {
    return '当前账号登录已失效，请先重新登录原 Session。'
  }
  if (upper.includes('USER_DEACTIVATED_BAN') || upper.includes('USERDEACTIVATEDBANERROR') || upper.includes('USER_DEACTIVATED') || upper.includes('USERDEACTIVATEDERROR') || upper.includes('PHONE_NUMBER_BANNED')) {
    return '这个账号已被 Telegram 封禁或注销，无法重新授权。'
  }
  if (upper.includes('FLOOD_WAIT')) {
    const match = upper.match(/FLOOD_WAIT_?(\d+)/)
    if (match?.[1]) {
      return `请求过于频繁，请等待 ${match[1]} 秒后再试。`
    }
    return '请求过于频繁，请稍后再试。'
  }
  if (lower.includes('too many requests')) {
    return '请求过于频繁，请稍后再试。'
  }
  if (lower.includes('timeout')) {
    return '重新授权超时了，请稍后重试。'
  }
  if (upper.includes('REAUTHORIZE_LOGIN_TOKEN_NOT_CONFIRMED')) {
    return '新设备授权确认超时了，请稍后重试。'
  }
  if (upper.includes('REAUTHORIZE_EXPORT_LOGIN_TOKEN_FAILED')) {
    return '生成新设备授权令牌失败，请稍后重试。'
  }
  if (upper.includes('AUTH_TOKEN_EXPIRED')) {
    return '新设备授权令牌已过期，请重新试一次。'
  }
  if (upper.includes('REAUTHORIZE_NOT_AUTHORIZED')) {
    return '新设备授权没有完成，请稍后重试。'
  }
  if (upper.includes('REAUTHORIZE_CURRENT_DEVICE_NOT_FOUND')) {
    return '重新授权成功了，但没能确认当前新设备，会话未做批量注销。'
  }

  return message.trim() || '重新授权失败，请稍后再试。'
}

function resolveStatusFromError(error: unknown): ReauthorizeOperationStatus {
  const message = error instanceof Error ? error.message : String(error)
  const upper = message.trim().toUpperCase()
  const lower = message.trim().toLowerCase()

  if (upper.includes('PASSWORD_HASH_INVALID') || upper.includes('PASSWORDHASHINVALIDERROR') || upper.includes('PASSWORD_MISSING') || upper.includes('SESSION_PASSWORD_NEEDED')) {
    return 'password_mismatch'
  }
  if (upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED') || lower.includes('not authorized') || lower.includes('unauthorized')) {
    return 'session_expired'
  }
  return 'failed'
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export class TelegramReauthorizationService {
  constructor(
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  private getCurrentProxy(): AccountClientProxyOptions | null {
    if (!this.proxyPoolService.isEnabled()) {
      return null
    }

    const proxy = this.proxyPoolService.getAccountCheckProxy()
    if (!proxy) {
      throw new Error('GLOBAL_PROXY_REQUIRED')
    }

    return {
      type: proxy.type,
      ip: proxy.host,
      port: proxy.port,
      username: proxy.username ?? null,
      password: proxy.password ?? null,
      ipVersion: proxy.ipVersion
    }
  }

  private async verifyPasswordCandidates(client: TelegramClient, candidates: string[]) {
    const { Api } = getTelegramModule()

    for (const candidate of candidates) {
      try {
        const passwordState = await client.invoke(new Api.account.GetPassword())
        const passwordSrpCheck = await computeCheck(passwordState, candidate)
        await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck as never }))
        return candidate
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const upper = message.trim().toUpperCase()
        if (upper.includes('PASSWORD_HASH_INVALID') || upper.includes('PASSWORDHASHINVALIDERROR')) {
          continue
        }
        throw error
      }
    }

    return null
  }

  private async extractLoginToken(client: TelegramClient) {
    const { Api } = getTelegramModule()
    const result = await client.invoke(new Api.auth.ExportLoginToken({
      apiId: Number(client.apiId),
      apiHash: client.apiHash,
      exceptIds: []
    }))

    if (result instanceof Api.auth.LoginToken) {
      return Buffer.from(result.token)
    }
    if (result instanceof Api.auth.LoginTokenMigrateTo) {
      await (client as TelegramClient & { _switchDC: (dcId: number) => Promise<void> })._switchDC(result.dcId)
      return Buffer.from(result.token)
    }
    if (result instanceof Api.auth.LoginTokenSuccess) {
      return null
    }

    throw new Error('REAUTHORIZE_EXPORT_LOGIN_TOKEN_FAILED')
  }

  private async finalizeLogin(client: TelegramClient, passwordCandidates: string[]) {
    const { Api } = getTelegramModule()

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await client.invoke(new Api.auth.ExportLoginToken({
          apiId: Number(client.apiId),
          apiHash: client.apiHash,
          exceptIds: []
        }))

        if (result instanceof Api.auth.LoginTokenSuccess) {
          return null
        }
        if (result instanceof Api.auth.LoginTokenMigrateTo) {
          await (client as TelegramClient & { _switchDC: (dcId: number) => Promise<void> })._switchDC(result.dcId)
          const migratedResult = await client.invoke(new Api.auth.ImportLoginToken({ token: result.token }))
          if (migratedResult instanceof Api.auth.LoginTokenSuccess) {
            return null
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const upper = message.trim().toUpperCase()
        if (upper.includes('SESSION_PASSWORD_NEEDED')) {
          if (passwordCandidates.length === 0) {
            throw new Error('PASSWORD_MISSING')
          }

          const matchedPassword = await this.verifyPasswordCandidates(client, passwordCandidates)
          if (!matchedPassword) {
            throw new Error('PASSWORD_HASH_INVALID')
          }

          return matchedPassword
        }
        throw error
      }

      await sleep(600)
    }

    throw new Error('REAUTHORIZE_LOGIN_TOKEN_NOT_CONFIRMED')
  }

  private async ensureSessionAuthorized(client: TelegramClient, passwordCandidates: string[]) {
    const authorized = await client.isUserAuthorized()
    if (authorized) {
      return null
    }

    if (passwordCandidates.length === 0) {
      throw new Error('PASSWORD_MISSING')
    }

    const matchedPassword = await this.verifyPasswordCandidates(client, passwordCandidates)
    if (!matchedPassword) {
      throw new Error('PASSWORD_HASH_INVALID')
    }

    if (!await client.isUserAuthorized()) {
      throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
    }

    return matchedPassword
  }

  private async clearOfficialServiceMessages(client: TelegramClient) {
    const { Api } = getTelegramModule()
    const servicePeer = await client.getInputEntity('777000')
    await client.invoke(new Api.messages.DeleteHistory({
      peer: servicePeer,
      maxId: 0,
      justClear: true
    }))
  }

  private async logoutOtherAuthorizations(client: TelegramClient) {
    const { Api } = getTelegramModule()
    const authorizationState = await client.invoke(new Api.account.GetAuthorizations())
    const authorizations = Array.isArray(authorizationState.authorizations) ? authorizationState.authorizations : []
    const currentAuthorization = authorizations.find((item) => Boolean(item.current))

    if (!currentAuthorization) {
      throw new Error('REAUTHORIZE_CURRENT_DEVICE_NOT_FOUND')
    }

    let resetCount = 0
    for (const authorization of authorizations) {
      if (authorization.hash === currentAuthorization.hash || authorization.current) {
        continue
      }

      await client.invoke(new Api.account.ResetAuthorization({ hash: authorization.hash }))
      resetCount += 1
    }

    let resetWebCount = 0
    try {
      const webAuthorizationState = await client.invoke(new Api.account.GetWebAuthorizations())
      const webAuthorizations = Array.isArray(webAuthorizationState.authorizations) ? webAuthorizationState.authorizations : []
      if (webAuthorizations.length > 0) {
        await client.invoke(new Api.account.ResetWebAuthorizations())
        resetWebCount = webAuthorizations.length
      }
    } catch {
      resetWebCount = 0
    }

    return {
      resetCount,
      resetWebCount
    }
  }

  private async backupSessionFile(sessionPath: string) {
    const backupPath = `${sessionPath}.bak-${Date.now()}`
    await fs.copyFile(sessionPath, backupPath)
    return backupPath
  }

  async reauthorize(account: AccountRecord, payload: ReauthorizeOperationPayload): Promise<ReauthorizeOperationResultItem> {
    const proxy = this.getCurrentProxy()
    const passwordCandidates = splitPasswordCandidates(payload.oldPasswords)
    const storedPassword = typeof account.profile?.twoFA === 'string' ? account.profile.twoFA.trim() : ''
    if (storedPassword && !passwordCandidates.includes(storedPassword)) {
      passwordCandidates.push(storedPassword)
    }

    const currentSession = await this.sessionLoader.load(account.sessionPath)
    const currentClient = this.clientManager.createClient(currentSession, { proxy })
    const { StringSession } = getSessionsModule()
    const nextClient = this.clientManager.createClient(new StringSession(''), { proxy })
    let matchedPassword: string | null = null
    let officialMessagesCleared = false
    let resetCount = 0
    let resetWebCount = 0

    try {
      const { Api } = getTelegramModule()

      await currentClient.connect()
      const authorized = await currentClient.isUserAuthorized()
      if (!authorized) {
        throw new Error('SESSION_REVOKED')
      }

      const passwordState = await currentClient.invoke(new Api.account.GetPassword())
      const hasPassword = Boolean((passwordState as { hasPassword?: boolean })?.hasPassword)
      if (!hasPassword) {
        passwordCandidates.length = 0
      }

      await nextClient.connect()
      const token = await this.extractLoginToken(nextClient)
      if (token) {
        await currentClient.invoke(new Api.auth.AcceptLoginToken({ token }))
        matchedPassword = await this.finalizeLogin(nextClient, passwordCandidates)
      }

      if (!matchedPassword && hasPassword) {
        matchedPassword = await this.ensureSessionAuthorized(nextClient, passwordCandidates)
      }

      const nextAuthorized = await nextClient.isUserAuthorized()
      if (!nextAuthorized) {
        throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
      }

      await nextClient.getMe()

      const logoutResult = await this.logoutOtherAuthorizations(nextClient)
      resetCount = logoutResult.resetCount
      resetWebCount = logoutResult.resetWebCount

      if (payload.deleteOfficialMessages) {
        try {
          await this.clearOfficialServiceMessages(nextClient)
          officialMessagesCleared = true
        } catch {
          officialMessagesCleared = false
        }
      }

      await this.backupSessionFile(account.sessionPath)
      const nextSession = ((nextClient.session as unknown as { save?: () => unknown }).save?.() as string | undefined)?.trim()
      if (!nextSession) {
        throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
      }
      await fs.writeFile(account.sessionPath, nextSession, 'utf8')

      return {
        accountId: account.id,
        phone: account.phone,
        success: true,
        status: 'success',
        message: payload.deleteOfficialMessages
          ? (officialMessagesCleared
              ? `重新授权成功，已注销其他 ${resetCount} 台设备${resetWebCount > 0 ? `，并清理 ${resetWebCount} 个 Web 授权` : ''}，官方系统消息已清理。`
              : `重新授权成功，已注销其他 ${resetCount} 台设备${resetWebCount > 0 ? `，并清理 ${resetWebCount} 个 Web 授权` : ''}，但官方系统消息清理失败。`)
          : `重新授权成功，已注销其他 ${resetCount} 台设备${resetWebCount > 0 ? `，并清理 ${resetWebCount} 个 Web 授权` : ''}。`,
        matchedPassword,
        officialMessagesCleared,
        terminatedAuthorizationsCount: resetCount,
        terminatedWebAuthorizationsCount: resetWebCount
      }
    } catch (error) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        status: resolveStatusFromError(error),
        message: formatReauthorizeError(error),
        matchedPassword: null,
        officialMessagesCleared: false,
        terminatedAuthorizationsCount: 0,
        terminatedWebAuthorizationsCount: 0
      }
    } finally {
      await this.clientManager.destroyClient(nextClient)
      await this.clientManager.destroyClient(currentClient)
    }
  }
}
