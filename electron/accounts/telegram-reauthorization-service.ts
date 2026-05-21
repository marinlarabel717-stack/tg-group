import fs from 'node:fs'
import os from 'node:os'
import { execFile, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
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
  new_password_applied?: boolean
  official_messages_cleared?: boolean
  terminated_authorizations_count?: number
  terminated_web_authorizations_count?: number
  recovery_email_pattern?: string | null
  unconfirmed_recovery_email_pattern?: string | null
  pending_recovery_reset_at?: string | null
  cancelled_recovery_email?: boolean
  declined_recovery_reset?: boolean
  device_model?: string | null
  system_version?: string | null
  app_version?: string | null
  lang_code?: string | null
  system_lang_code?: string | null
}

interface StableDesktopClientProfile {
  deviceModel: string
  systemVersion: string
  appVersion: string
  langCode: string
  systemLangCode: string
}

const WINDOWS_DEVICE_MODEL_VARIANTS = ['Windows PC 64bit', 'Desktop PC 64bit', 'Office PC 64bit', 'Workstation 64bit']
const MAC_DEVICE_MODEL_VARIANTS = ['Mac 64bit', 'Desktop Mac 64bit', 'Mac Workstation 64bit']
const LINUX_DEVICE_MODEL_VARIANTS = ['Linux PC 64bit', 'Desktop Linux 64bit', 'Linux Workstation 64bit']
const GENERIC_DEVICE_MODEL_VARIANTS = ['Desktop 64bit', 'Desktop PC 64bit', 'Workstation 64bit']

type ReauthorizeLogLevel = 'info' | 'success' | 'warning' | 'error'

interface ReauthorizeLogger {
  log: (level: ReauthorizeLogLevel, message: string) => void
}

interface ProgressEventPayload {
  level?: ReauthorizeLogLevel
  message?: string
}

const PROGRESS_PREFIX = '__PROGRESS__'

function normalizeProgressLog(level: ReauthorizeLogLevel, message: string): { level: ReauthorizeLogLevel; message: string } | null {
  const text = message.trim()
  if (!text) return null

  const rules: Array<{ pattern: RegExp; value: string | null; level?: ReauthorizeLogLevel }> = [
    { pattern: /^步骤 0[:：]/, value: null },
    { pattern: /^步骤 1：旧设备正在读取授权列表。$/, value: null },
    { pattern: /^步骤 1 完成：已清理其它 .* 台设备，只保留当前旧设备。$/, value: '旧设备清场完成。', level: 'success' },
    { pattern: /^步骤 1 完成：当前本来就只有旧设备自己。$/, value: '旧设备无需清场。', level: 'success' },
    { pattern: /^已额外清理 .* 个 Web 授权。$/, value: null },
    { pattern: /^步骤 2：本次新会话使用稳定桌面参数 .*$/, value: null },
    { pattern: /^步骤 2：正在建立新设备会话并请求官方验证码。$/, value: '正在请求官方验证码。', level: 'info' },
    { pattern: /^步骤 2 完成：官方验证码已发送。$/, value: '官方验证码已发送。', level: 'success' },
    { pattern: /^步骤 3：旧设备正在读取 777000 官方验证码消息。$/, value: '正在读取 777000 官方验证码。', level: 'info' },
    { pattern: /^步骤 3 完成：已从旧设备读取到官方验证码 .*。$/, value: '已读取官方验证码。', level: 'success' },
    { pattern: /^步骤 4：新设备正在使用官方验证码登录。$/, value: '正在用官方验证码登录新设备。', level: 'info' },
    { pattern: /^步骤 4 完成：新设备验证码登录成功。$/, value: '新设备验证码登录成功。', level: 'success' },
    { pattern: /^步骤 5：新设备登录需要 2FA，开始尝试 .* 个旧密码候选。$/, value: '需要 2FA，开始校验旧密码。', level: 'warning' },
    { pattern: /^正在尝试第 .* 个旧密码候选。$/, value: null },
    { pattern: /^第 .* 个旧密码候选不匹配。$/, value: null },
    { pattern: /^步骤 5 完成：第 .* 个旧密码候选校验通过。$/, value: '旧密码校验通过。', level: 'success' },
    { pattern: /^步骤 6：新设备账号校验通过。$/, value: '新设备登录校验通过。', level: 'success' },
    { pattern: /^步骤 6：正在把账号 2FA 更新为你填写的新密码。$/, value: '正在设置新密码。', level: 'info' },
    { pattern: /^步骤 6 完成：新密码已设置成功。$/, value: '新密码已设置成功。', level: 'success' },
    { pattern: /^已确认当前账号仍保留 2FA 密码。$/, value: null },
    { pattern: /^当前账号没有检测到 2FA 密码。$/, value: '当前账号没有检测到 2FA 密码。', level: 'warning' },
    { pattern: /^当前仍保留有效恢复邮箱：.*$/, value: null },
    { pattern: /^检测到待确认的旧恢复邮箱：.*$/, value: '检测到待确认的旧恢复邮箱。', level: 'warning' },
    { pattern: /^检测到旧的密码重置等待期：.*$/, value: '检测到旧的密码重置等待期。', level: 'warning' },
    { pattern: /^检测到当前账号没有 2FA 密码.*$/, value: '账号没有 2FA，已跳过恢复方式清理。', level: 'warning' },
    { pattern: /^检测到待确认的恢复邮箱，正在取消这条旧恢复设置。$/, value: '正在取消待确认的恢复邮箱。', level: 'info' },
    { pattern: /^已取消待确认的旧恢复邮箱。$/, value: '待确认恢复邮箱已取消。', level: 'success' },
    { pattern: /^检测到旧的密码重置等待期，正在撤销这条恢复请求。$/, value: '正在撤销旧的密码重置等待期。', level: 'info' },
    { pattern: /^已撤销旧的密码重置等待期。$/, value: '旧的密码重置等待期已撤销。', level: 'success' },
    { pattern: /^没有检测到需要清理的过期恢复方式。$/, value: null },
    { pattern: /^正在清理 Telegram 官方系统消息。$/, value: '正在清理 Telegram 官方系统消息。', level: 'info' },
    { pattern: /^官方系统消息已清理。$/, value: '官方系统消息已清理。', level: 'success' },
    { pattern: /^步骤 7：新设备已确认可用，旧设备准备退出登录。$/, value: '新设备可用，准备让旧设备退出。', level: 'info' },
    { pattern: /^步骤 7 完成：旧设备已退出登录。$/, value: '旧设备已退出登录。', level: 'success' },
    { pattern: /^已备份原 session 文件。$/, value: null },
    { pattern: /^步骤 8 完成：新 session 已写回本地。$/, value: '新 session 已写回本地。', level: 'success' }
  ]

  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue
    if (rule.value === null) return null
    return { level: rule.level ?? level, message: rule.value }
  }

  return { level, message: text }
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_reauthorize.py')
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeLangCode(locale: string) {
  const normalized = locale.replace('_', '-').trim()
  if (!normalized) return 'en'
  return normalized.split('-')[0]?.toLowerCase() || 'en'
}

function normalizeSystemLangCode(locale: string) {
  const normalized = locale.replace('_', '-').trim()
  return normalized || 'en-US'
}

function readStableAccountSeed(account: AccountRecord) {
  return [
    readTrimmedString(account.phone),
    readTrimmedString(account.userId),
    String(account.id)
  ].find(Boolean) || String(account.id)
}

function hashSeed(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function pickStableVariant<T>(items: T[], seed: string) {
  if (items.length === 0) {
    throw new Error('stable variant candidates are empty')
  }
  return items[hashSeed(seed) % items.length]
}

function resolveDesktopSystemVersion() {
  const platform = os.platform()
  const release = readTrimmedString(os.release())
  const version = readTrimmedString(typeof os.version === 'function' ? os.version() : '')

  if (platform === 'win32') {
    if (version) return version
    return release ? `Windows ${release}` : 'Windows'
  }
  if (platform === 'darwin') {
    return release ? `macOS ${release}` : 'macOS'
  }
  if (platform === 'linux') {
    return release ? `Linux ${release}` : 'Linux'
  }
  return version || release || platform || 'Desktop OS'
}

function resolveDesktopDeviceModel() {
  const arch = os.arch() === 'x64' ? '64bit' : os.arch() === 'ia32' ? '32bit' : os.arch().toUpperCase()
  const platform = os.platform()
  if (platform === 'win32') return `Windows PC ${arch}`
  if (platform === 'darwin') return `Mac ${arch}`
  if (platform === 'linux') return `Linux PC ${arch}`
  return `Desktop ${arch}`
}

function deriveStableDeviceModel(account: AccountRecord) {
  const seed = readStableAccountSeed(account)
  const platform = os.platform()
  if (platform === 'win32') return pickStableVariant(WINDOWS_DEVICE_MODEL_VARIANTS, seed)
  if (platform === 'darwin') return pickStableVariant(MAC_DEVICE_MODEL_VARIANTS, seed)
  if (platform === 'linux') return pickStableVariant(LINUX_DEVICE_MODEL_VARIANTS, seed)
  return pickStableVariant(GENERIC_DEVICE_MODEL_VARIANTS, seed)
}

function buildStableDesktopClientProfile(account: AccountRecord): StableDesktopClientProfile {
  const locale = normalizeSystemLangCode(app.getLocale?.() || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US')
  const appVersion = readTrimmedString(app.getVersion?.()) || '0.0.0'

  return {
    deviceModel: deriveStableDeviceModel(account) || resolveDesktopDeviceModel(),
    systemVersion: resolveDesktopSystemVersion(),
    appVersion: `TG-Matrix ${appVersion}`,
    langCode: normalizeLangCode(locale),
    systemLangCode: locale
  }
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
  if (upper.includes('NEW_PASSWORD_INVALID') || upper.includes('NEW_PASSWORD_EMPTY')) {
    return '新密码格式不正确，请换一个再试。'
  }
  if (upper.includes('REAUTHORIZE_SET_NEW_PASSWORD_FAILED')) {
    return '新密码设置失败，请检查旧密码或稍后重试。'
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
  if (upper.includes('OLD_DEVICE_RESET_FORBIDDEN') || upper.includes('FRESHRESETAUTHORISATIONFORBIDDEN') || lower.includes('current session is too new')) {
    return '当前这台旧设备登录时间太近，Telegram 暂时不让它清理其它设备。本次已停在旧设备清场这一步，没有继续新设备登录，请晚点再试。'
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
            const normalized = normalizeProgressLog(level, message)
            if (normalized) {
              logger?.log(normalized.level, normalized.message)
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
        declinedRecoveryReset: false,
        deviceModel: null,
        systemVersion: null,
        appVersion: null,
        langCode: null,
        systemLangCode: null
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
        declinedRecoveryReset: false,
        deviceModel: null,
        systemVersion: null,
        appVersion: null,
        langCode: null,
        systemLangCode: null
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
        declinedRecoveryReset: false,
        deviceModel: null,
        systemVersion: null,
        appVersion: null,
        langCode: null,
        systemLangCode: null
      }
    }

    const passwordCandidates = splitPasswordCandidates(payload.oldPasswords)
    const nextPassword = readTrimmedString(payload.newPassword)
    const storedPassword = typeof account.profile?.twoFA === 'string' ? account.profile.twoFA.trim() : ''
    if (storedPassword && !passwordCandidates.includes(storedPassword)) {
      passwordCandidates.push(storedPassword)
    }

    try {
      const clientProfile = buildStableDesktopClientProfile(account)
      const proxyPayload = serializeTelethonProxy(proxy)
      const raw = await this.runScript(account.id, {
        sessionPath: account.sessionPath,
        deleteOfficialMessages: payload.deleteOfficialMessages,
        cleanupExpiredRecovery: payload.cleanupExpiredRecovery,
        passwordCandidates,
        newPassword: nextPassword,
        timeoutSeconds: 180,
        proxy: proxyPayload ? JSON.parse(proxyPayload) : null,
        deviceModel: clientProfile.deviceModel,
        systemVersion: clientProfile.systemVersion,
        appVersion: clientProfile.appVersion,
        langCode: clientProfile.langCode,
        systemLangCode: clientProfile.systemLangCode
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
        declinedRecoveryReset: Boolean(raw.declined_recovery_reset),
        deviceModel: typeof raw.device_model === 'string' ? raw.device_model : clientProfile.deviceModel,
        systemVersion: typeof raw.system_version === 'string' ? raw.system_version : clientProfile.systemVersion,
        appVersion: typeof raw.app_version === 'string' ? raw.app_version : clientProfile.appVersion,
        langCode: typeof raw.lang_code === 'string' ? raw.lang_code : clientProfile.langCode,
        systemLangCode: typeof raw.system_lang_code === 'string' ? raw.system_lang_code : clientProfile.systemLangCode
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
        declinedRecoveryReset: false,
        deviceModel: null,
        systemVersion: null,
        appVersion: null,
        langCode: null,
        systemLangCode: null
      }
    }
  }
}
