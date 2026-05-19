import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { TelegramClient } from 'telegram'
import type { AccountRecord, ReauthorizeOperationPayload, ReauthorizeOperationResultItem, ReauthorizeOperationStatus } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { getSessionsModule, getTelegramModule } from './check-engine/gramjs-runtime'
import { ProxyPoolService } from '../proxy-pool/service'

const require = createRequire(import.meta.url)
const { computeCheck } = require('telegram/Password') as { computeCheck: (request: unknown, password: string) => Promise<unknown> }

type ReauthorizeLogLevel = 'info' | 'success' | 'warning' | 'error'

interface ReauthorizeLogger {
  log: (level: ReauthorizeLogLevel, message: string) => void
}

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

  private async verifyPasswordCandidates(client: TelegramClient, candidates: string[], logger?: ReauthorizeLogger) {
    const { Api } = getTelegramModule()

    logger?.log('info', `检测到新设备需要 2FA，开始校验 ${candidates.length} 个旧密码候选。`)

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      try {
        logger?.log('info', `正在尝试第 ${index + 1} 个旧密码候选。`)
        const passwordState = await client.invoke(new Api.account.GetPassword())
        const passwordSrpCheck = await computeCheck(passwordState, candidate)
        await client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck as never }))
        logger?.log('success', `第 ${index + 1} 个旧密码候选校验通过。`)
        return candidate
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const upper = message.trim().toUpperCase()
        if (upper.includes('PASSWORD_HASH_INVALID') || upper.includes('PASSWORDHASHINVALIDERROR')) {
          logger?.log('warning', `第 ${index + 1} 个旧密码候选不匹配。`)
          continue
        }
        logger?.log('error', `旧密码校验时出现异常：${formatReauthorizeError(error)}`)
        throw error
      }
    }

    logger?.log('warning', '所有旧密码候选都没有通过。')
    return null
  }

  private async extractLoginToken(client: TelegramClient, logger?: ReauthorizeLogger) {
    const { Api } = getTelegramModule()
    logger?.log('info', '正在为新设备生成登录令牌。')
    const result = await client.invoke(new Api.auth.ExportLoginToken({
      apiId: Number(client.apiId),
      apiHash: client.apiHash,
      exceptIds: []
    }))

    if (result instanceof Api.auth.LoginToken) {
      logger?.log('success', '已生成新设备登录令牌。')
      return Buffer.from(result.token)
    }
    if (result instanceof Api.auth.LoginTokenMigrateTo) {
      logger?.log('info', `登录令牌需要切换到 DC ${result.dcId}，正在切换。`)
      await (client as TelegramClient & { _switchDC: (dcId: number) => Promise<void> })._switchDC(result.dcId)
      logger?.log('success', '切换 DC 完成，已拿到登录令牌。')
      return Buffer.from(result.token)
    }
    if (result instanceof Api.auth.LoginTokenSuccess) {
      logger?.log('success', '新设备已经直接处于已授权状态，无需再次确认令牌。')
      return null
    }

    throw new Error('REAUTHORIZE_EXPORT_LOGIN_TOKEN_FAILED')
  }

  private async finalizeLogin(client: TelegramClient, passwordCandidates: string[], logger?: ReauthorizeLogger) {
    const { Api } = getTelegramModule()

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        logger?.log('info', `正在等待旧设备确认新设备登录（第 ${attempt + 1} 次检查）。`)
        const result = await client.invoke(new Api.auth.ExportLoginToken({
          apiId: Number(client.apiId),
          apiHash: client.apiHash,
          exceptIds: []
        }))

        if (result instanceof Api.auth.LoginTokenSuccess) {
          logger?.log('success', '旧设备已确认，新设备登录完成。')
          return null
        }
        if (result instanceof Api.auth.LoginTokenMigrateTo) {
          logger?.log('info', `登录确认需要切换到 DC ${result.dcId}，正在切换。`)
          await (client as TelegramClient & { _switchDC: (dcId: number) => Promise<void> })._switchDC(result.dcId)
          const migratedResult = await client.invoke(new Api.auth.ImportLoginToken({ token: result.token }))
          if (migratedResult instanceof Api.auth.LoginTokenSuccess) {
            logger?.log('success', '切换 DC 后，新设备登录确认完成。')
            return null
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const upper = message.trim().toUpperCase()
        if (upper.includes('SESSION_PASSWORD_NEEDED')) {
          logger?.log('warning', '新设备登录需要 2FA 旧密码确认。')
          if (passwordCandidates.length === 0) {
            throw new Error('PASSWORD_MISSING')
          }

          const matchedPassword = await this.verifyPasswordCandidates(client, passwordCandidates, logger)
          if (!matchedPassword) {
            throw new Error('PASSWORD_HASH_INVALID')
          }

          return matchedPassword
        }
        logger?.log('error', `等待新设备登录确认时出错：${formatReauthorizeError(error)}`)
        throw error
      }

      await sleep(600)
    }

    throw new Error('REAUTHORIZE_LOGIN_TOKEN_NOT_CONFIRMED')
  }

  private async ensureSessionAuthorized(client: TelegramClient, passwordCandidates: string[], logger?: ReauthorizeLogger) {
    const authorized = await client.isUserAuthorized()
    if (authorized) {
      logger?.log('success', '新设备已处于登录状态，无需补做授权确认。')
      return null
    }

    if (passwordCandidates.length === 0) {
      throw new Error('PASSWORD_MISSING')
    }

    logger?.log('warning', '检测到新设备还未完全授权，继续补做 2FA 确认。')
    const matchedPassword = await this.verifyPasswordCandidates(client, passwordCandidates, logger)
    if (!matchedPassword) {
      throw new Error('PASSWORD_HASH_INVALID')
    }

    if (!await client.isUserAuthorized()) {
      throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
    }

    logger?.log('success', '补做 2FA 后，新设备授权已完成。')
    return matchedPassword
  }

  private async clearOfficialServiceMessages(client: TelegramClient, logger?: ReauthorizeLogger) {
    const { Api } = getTelegramModule()
    logger?.log('info', '正在清理 Telegram 官方系统消息。')
    const servicePeer = await client.getInputEntity('777000')
    await client.invoke(new Api.messages.DeleteHistory({
      peer: servicePeer,
      maxId: 0,
      justClear: true
    }))
    logger?.log('success', '官方系统消息已清理。')
  }

  private async logoutOtherAuthorizations(client: TelegramClient, logger?: ReauthorizeLogger) {
    const { Api } = getTelegramModule()
    logger?.log('info', '正在读取当前账号的设备授权列表。')
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
      logger?.log('info', `已注销 1 台旧设备，当前累计 ${resetCount} 台。`)
    }

    let resetWebCount = 0
    try {
      const webAuthorizationState = await client.invoke(new Api.account.GetWebAuthorizations())
      const webAuthorizations = Array.isArray(webAuthorizationState.authorizations) ? webAuthorizationState.authorizations : []
      if (webAuthorizations.length > 0) {
        await client.invoke(new Api.account.ResetWebAuthorizations())
        resetWebCount = webAuthorizations.length
        logger?.log('info', `已清理 ${resetWebCount} 个 Web 授权。`)
      }
    } catch {
      resetWebCount = 0
    }

    logger?.log('success', `设备授权收口完成：已保留当前新设备，注销 ${resetCount} 台旧设备${resetWebCount > 0 ? `，并清理 ${resetWebCount} 个 Web 授权` : ''}。`)

    return {
      resetCount,
      resetWebCount
    }
  }

  private async backupSessionFile(sessionPath: string, logger?: ReauthorizeLogger) {
    const backupPath = `${sessionPath}.bak-${Date.now()}`
    await fs.copyFile(sessionPath, backupPath)
    logger?.log('info', '已备份原 session 文件。')
    return backupPath
  }

  async reauthorize(account: AccountRecord, payload: ReauthorizeOperationPayload, logger?: ReauthorizeLogger): Promise<ReauthorizeOperationResultItem> {
    const proxy = this.getCurrentProxy()
    const passwordCandidates = splitPasswordCandidates(payload.oldPasswords)
    const storedPassword = typeof account.profile?.twoFA === 'string' ? account.profile.twoFA.trim() : ''
    if (storedPassword && !passwordCandidates.includes(storedPassword)) {
      passwordCandidates.push(storedPassword)
    }

    logger?.log('info', '开始建立旧设备会话。')
    if (storedPassword) {
      logger?.log('info', '检测到账号本地已保存旧密码，会一起参与兜底校验。')
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
      logger?.log('success', '旧设备会话连接成功。')
      const authorized = await currentClient.isUserAuthorized()
      if (!authorized) {
        throw new Error('SESSION_REVOKED')
      }
      logger?.log('success', '旧设备登录状态正常。')

      const passwordState = await currentClient.invoke(new Api.account.GetPassword())
      const hasPassword = Boolean((passwordState as { hasPassword?: boolean })?.hasPassword)
      if (!hasPassword) {
        passwordCandidates.length = 0
        logger?.log('info', '当前账号没有开启 2FA，新设备无需旧密码确认。')
      } else {
        logger?.log('info', `当前账号已开启 2FA，本次共准备了 ${passwordCandidates.length} 个旧密码候选。`)
      }

      await nextClient.connect()
      logger?.log('success', '新设备会话已建立。')
      const token = await this.extractLoginToken(nextClient, logger)
      if (token) {
        logger?.log('info', '正在让旧设备确认新设备登录。')
        await currentClient.invoke(new Api.auth.AcceptLoginToken({ token }))
        logger?.log('success', '旧设备已提交登录确认。')
        matchedPassword = await this.finalizeLogin(nextClient, passwordCandidates, logger)
      }

      if (!matchedPassword && hasPassword) {
        matchedPassword = await this.ensureSessionAuthorized(nextClient, passwordCandidates, logger)
      }

      const nextAuthorized = await nextClient.isUserAuthorized()
      if (!nextAuthorized) {
        throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
      }

      await nextClient.getMe()
      logger?.log('success', '新设备账号资料校验通过。')

      const logoutResult = await this.logoutOtherAuthorizations(nextClient, logger)
      resetCount = logoutResult.resetCount
      resetWebCount = logoutResult.resetWebCount

      if (payload.deleteOfficialMessages) {
        try {
          await this.clearOfficialServiceMessages(nextClient, logger)
          officialMessagesCleared = true
        } catch {
          officialMessagesCleared = false
          logger?.log('warning', '官方系统消息清理失败，已跳过，不影响重新授权结果。')
        }
      }

      await this.backupSessionFile(account.sessionPath, logger)
      const nextSession = ((nextClient.session as unknown as { save?: () => unknown }).save?.() as string | undefined)?.trim()
      if (!nextSession) {
        throw new Error('REAUTHORIZE_NOT_AUTHORIZED')
      }
      await fs.writeFile(account.sessionPath, nextSession, 'utf8')
      logger?.log('success', '新 session 已写回本地，重新授权完成。')

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
      logger?.log('error', `重新授权失败：${formatReauthorizeError(error)}`)
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
