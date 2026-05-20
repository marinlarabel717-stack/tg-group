import fs from 'node:fs'
import { execFile, type ChildProcess } from 'node:child_process'
import type { AccountRecord, ReauthorizeOperationPayload, ReauthorizeOperationResultItem, ReauthorizeOperationStatus } from './types'
import type { SessionLoader } from './check-engine/session-loader'
import type { TelegramClientManager, AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './check-engine/telethon-proxy'
import { ProxyPoolService } from '../proxy-pool/service'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'

interface TelethonReauthorizeRawResult {
  ok?: boolean
  message?: string | null
  reason?: string | null
  matched_password?: string | null
  official_messages_cleared?: boolean
  terminated_authorizations_count?: number
  terminated_web_authorizations_count?: number
  recovery_email_pattern?: string | null
  unconfirmed_recovery_email_pattern?: string | null
  pending_recovery_reset_at?: string | null
  cancelled_recovery_email?: boolean
  declined_recovery_reset?: boolean
}

type ReauthorizeLogLevel = 'info' | 'success' | 'warning' | 'error'

interface ReauthorizeLogger {
  log: (level: ReauthorizeLogLevel, message: string) => void
}

interface ProgressEventPayload {
  level?: ReauthorizeLogLevel
  message?: string
}

const PROGRESS_PREFIX = '__PROGRESS__'

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_reauthorize.py')
}

function splitPasswordCandidates(input: string) {
  return Array.from(new Set(
    input
      .split(/\||\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  ))
}

function formatReauthorizeError(error: string) {
  const normalized = error.trim()
  const upper = normalized.toUpperCase()
  const lower = normalized.toLowerCase()

  if (upper.includes('SESSION_NOT_AUTHORIZED') || upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED')) {
    return '当前账号登录已失效，请先重新登录原 Session。'
  }
  if (upper.includes('PASSWORDHASHINVALIDERROR') || upper.includes('PASSWORD_HASH_INVALID')) {
    return '旧密码不匹配。'
  }
  if (upper.includes('PASSWORD_MISSING') || upper.includes('SESSIONPASSWORDNEEDEDERROR') || upper.includes('SESSION_PASSWORD_NEEDED')) {
    return '这个账号当前需要正确的旧密码才能继续。'
  }
  if (upper.includes('PHONECODEINVALIDERROR') || upper.includes('PHONE_CODE_INVALID')) {
    return '官方验证码不正确，请重新试一次。'
  }
  if (upper.includes('PHONECODEEXPIREDERROR') || upper.includes('PHONE_CODE_EXPIRED')) {
    return '官方验证码已过期，请重新获取。'
  }
  if (upper.includes('REAUTHORIZE_VERIFICATION_CODE_NOT_FOUND')) {
    return '旧设备没有等到 Telegram 官方验证码，请稍后重试。'
  }
  if (upper.includes('PHONE_NUMBER_MISSING')) {
    return '这个账号没有读取到手机号，暂时无法重新授权。'
  }
  if (upper.includes('PHONE_NUMBER_BANNED') || upper.includes('USERDEACTIVATEDBANERROR') || upper.includes('USER_DEACTIVATED_BAN') || upper.includes('USERDEACTIVATEDERROR') || upper.includes('USER_DEACTIVATED')) {
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
  if (upper.includes('REAUTHORIZE_NEW_SESSION_MISSING')) {
    return '新设备登录成功了，但新 session 没有落盘成功，请稍后重试。'
  }
  if (upper.includes('GLOBAL_PROXY_REQUIRED')) {
    return '当前已开启全局代理，但没有可用代理，暂时无法重新授权。'
  }

  return normalized || '重新授权失败，请稍后再试。'
}

function resolveStatusFromError(error: string): ReauthorizeOperationStatus {
  const upper = error.trim().toUpperCase()
  const lower = error.trim().toLowerCase()

  if (upper.includes('PASSWORDHASHINVALIDERROR') || upper.includes('PASSWORD_HASH_INVALID') || upper.includes('PASSWORD_MISSING') || upper.includes('SESSIONPASSWORDNEEDEDERROR') || upper.includes('SESSION_PASSWORD_NEEDED')) {
    return 'password_mismatch'
  }
  if (upper.includes('SESSION_NOT_AUTHORIZED') || upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED') || lower.includes('unauthorized')) {
    return 'session_expired'
  }
  return 'failed'
}

export class TelegramReauthorizationService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()
  private readonly runningProcesses = new Map<number, ChildProcess>()

  constructor(
    _sessionLoader: SessionLoader,
    _clientManager: TelegramClientManager,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

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

  private async runScript(accountId: number, payload: Record<string, unknown>, logger?: ReauthorizeLogger) {
    return await new Promise<TelethonReauthorizeRawResult>((resolve, reject) => {
      let settled = false
      let timedOut = false
      let stderrBuffer = ''
      const childProcess = execFile(
        this.pythonExecutable,
        [this.scriptPath, JSON.stringify(payload)],
        {
          cwd: process.cwd(),
          windowsHide: true,
          encoding: 'utf8',
          env: buildTelethonPythonEnv(),
          maxBuffer: 12 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          this.runningProcesses.delete(accountId)

          if (error) {
            if (timedOut) {
              reject(new Error('timeout'))
              return
            }
            const reason = String(stderr || stdout || error.message || 'REAUTHORIZE_FAILED').trim()
            reject(new Error(reason))
            return
          }

          try {
            resolve(JSON.parse(String(stdout).trim()) as TelethonReauthorizeRawResult)
          } catch (parseError) {
            const parseReason = parseError instanceof Error ? parseError.message : String(parseError)
            const fallbackReason = String(stderr || stdout || parseReason || 'REAUTHORIZE_FAILED').trim()
            reject(new Error(fallbackReason))
          }
        }
      )

      this.runningProcesses.set(accountId, childProcess)

      const handleChunk = (chunk: string | Buffer) => {
        stderrBuffer += String(chunk)
        const lines = stderrBuffer.split(/\r?\n/)
        stderrBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith(PROGRESS_PREFIX)) continue
          const rawJson = trimmed.slice(PROGRESS_PREFIX.length)
          try {
            const event = JSON.parse(rawJson) as ProgressEventPayload
            const level = event.level ?? 'info'
            const message = typeof event.message === 'string' ? event.message.trim() : ''
            if (message) {
              logger?.log(level, message)
            }
          } catch {
            // ignore invalid progress lines
          }
        }
      }

      childProcess.stderr?.on('data', handleChunk)

      const timeoutId = setTimeout(() => {
        timedOut = true
        try {
          if (!childProcess.killed) {
            childProcess.kill()
          }
        } catch {
          // ignore
        }
      }, 240000)
    })
  }

  async reauthorize(account: AccountRecord, payload: ReauthorizeOperationPayload, logger?: ReauthorizeLogger): Promise<ReauthorizeOperationResultItem> {
    if (!this.isAvailable()) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        status: 'failed',
        message: '当前运行环境缺少重新授权 Runtime 脚本，暂时没法执行。',
        matchedPassword: null,
        officialMessagesCleared: false,
        terminatedAuthorizationsCount: 0,
        terminatedWebAuthorizationsCount: 0,
        recoveryEmailPattern: null,
        unconfirmedRecoveryEmailPattern: null,
        pendingRecoveryResetAt: null,
        cancelledRecoveryEmail: false,
        declinedRecoveryReset: false
      }
    }

    let proxy: AccountClientProxyOptions | null = null
    try {
      proxy = this.getCurrentProxy()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        status: resolveStatusFromError(reason),
        message: formatReauthorizeError(reason),
        matchedPassword: null,
        officialMessagesCleared: false,
        terminatedAuthorizationsCount: 0,
        terminatedWebAuthorizationsCount: 0,
        recoveryEmailPattern: null,
        unconfirmedRecoveryEmailPattern: null,
        pendingRecoveryResetAt: null,
        cancelledRecoveryEmail: false,
        declinedRecoveryReset: false
      }
    }

    if (!supportsTelethonProxy(proxy)) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        status: 'failed',
        message: '当前代理类型不支持重新授权，请换成 http / socks5 代理后再试。',
        matchedPassword: null,
        officialMessagesCleared: false,
        terminatedAuthorizationsCount: 0,
        terminatedWebAuthorizationsCount: 0,
        recoveryEmailPattern: null,
        unconfirmedRecoveryEmailPattern: null,
        pendingRecoveryResetAt: null,
        cancelledRecoveryEmail: false,
        declinedRecoveryReset: false
      }
    }

    const passwordCandidates = splitPasswordCandidates(payload.oldPasswords)
    const storedPassword = typeof account.profile?.twoFA === 'string' ? account.profile.twoFA.trim() : ''
    if (storedPassword && !passwordCandidates.includes(storedPassword)) {
      passwordCandidates.push(storedPassword)
    }

    try {
      logger?.log('info', '已切换到 Telethon 官方验证码重新授权链路。')
      const proxyPayload = serializeTelethonProxy(proxy)
      const raw = await this.runScript(account.id, {
        sessionPath: account.sessionPath,
        deleteOfficialMessages: payload.deleteOfficialMessages,
        cleanupExpiredRecovery: payload.cleanupExpiredRecovery,
        passwordCandidates,
        timeoutSeconds: 180,
        proxy: proxyPayload ? JSON.parse(proxyPayload) : null
      }, logger)
      const ok = Boolean(raw.ok)
      const reason = typeof raw.reason === 'string' ? raw.reason : ''
      const message = ok
        ? (typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : '重新授权成功。')
        : formatReauthorizeError(reason)

      return {
        accountId: account.id,
        phone: account.phone,
        success: ok,
        status: ok ? 'success' : resolveStatusFromError(reason),
        message,
        matchedPassword: typeof raw.matched_password === 'string' ? raw.matched_password : null,
        officialMessagesCleared: Boolean(raw.official_messages_cleared),
        terminatedAuthorizationsCount: Number(raw.terminated_authorizations_count || 0),
        terminatedWebAuthorizationsCount: Number(raw.terminated_web_authorizations_count || 0),
        recoveryEmailPattern: typeof raw.recovery_email_pattern === 'string' ? raw.recovery_email_pattern : null,
        unconfirmedRecoveryEmailPattern: typeof raw.unconfirmed_recovery_email_pattern === 'string' ? raw.unconfirmed_recovery_email_pattern : null,
        pendingRecoveryResetAt: typeof raw.pending_recovery_reset_at === 'string' ? raw.pending_recovery_reset_at : null,
        cancelledRecoveryEmail: Boolean(raw.cancelled_recovery_email),
        declinedRecoveryReset: Boolean(raw.declined_recovery_reset)
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger?.log('error', `重新授权失败：${formatReauthorizeError(reason)}`)
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        status: resolveStatusFromError(reason),
        message: formatReauthorizeError(reason),
        matchedPassword: null,
        officialMessagesCleared: false,
        terminatedAuthorizationsCount: 0,
        terminatedWebAuthorizationsCount: 0,
        recoveryEmailPattern: null,
        unconfirmedRecoveryEmailPattern: null,
        pendingRecoveryResetAt: null,
        cancelledRecoveryEmail: false,
        declinedRecoveryReset: false
      }
    }
  }
}
