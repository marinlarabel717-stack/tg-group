import { Api, type TelegramClient } from 'telegram'
import type { AccountCheckResult, AccountRecord, CheckResultInput } from '../types'
import type { AccountRepository } from '../services/account-repository'
import { AccountUpdateService } from './account-update-service'
import { CheckResultWriter } from './check-result-writer'
import { SessionLoader } from './session-loader'
import { SpamBotChecker } from './spam-bot-checker'
import { StatusResolver } from './status-resolver'
import { type AccountClientProxyOptions, TelegramClientManager } from './telegram-client-manager'
import { TelethonFreezeChecker } from './telethon-freeze-checker'
import { TelethonSpamBotChecker } from './telethon-spambot-checker'
import { readPremiumExpiryViaClient } from '../telegram-desktop-premium-service'
import { type AccountCheckProxy, ProxyPoolService } from '../../proxy-pool/service'
import type { TelethonFreezeCheckResult } from './telethon-freeze-checker'

interface CheckLogger {
  (payload: { type: 'login_success'; phone: string } | { type: 'login_failed'; phone: string; reason: string }): void
}

interface AccountCheckEngineOptions {
  timeoutMs?: number
}

interface ProxyUsageMeta {
  proxyUsed: boolean
  proxyDisplay: string | null
}

function withStepTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${timeoutMs}ms）`)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function buildProbeSummary(probes: string[]) {
  return probes.length > 0 ? `探针:${probes.join(' > ')}` : ''
}

function buildReplySnippet(replyText: string) {
  const normalized = replyText.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized
}

function normalizeTelethonFreezeDate(value?: number | string | null) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(parsed * 1000).toISOString()
    }

    const normalized = trimmed.replace(' UTC', 'Z')
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }

  return null
}

function readTelethonFreezeSince(result: { freeze_since_date?: number | string | null; freeze_since_text?: string | null } | null | undefined) {
  return normalizeTelethonFreezeDate(result?.freeze_since_date ?? result?.freeze_since_text ?? null)
}

function readTelethonFreezeUntil(result: { freeze_until_date?: number | string | null; freeze_until_text?: string | null } | null | undefined) {
  return normalizeTelethonFreezeDate(result?.freeze_until_date ?? result?.freeze_until_text ?? null)
}

function isGramJsMessageConstructorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes('Could not find a matching Constructor ID') && message.includes('2533211113')
}

export class AccountCheckEngine {
  private readonly timeoutMs: number

  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly telethonFreezeChecker: TelethonFreezeChecker,
    private readonly telethonSpamBotChecker: TelethonSpamBotChecker,
    private readonly clientManager: TelegramClientManager,
    private readonly spamBotChecker: SpamBotChecker,
    private readonly statusResolver: StatusResolver,
    private readonly updateService: AccountUpdateService,
    private readonly resultWriter: CheckResultWriter,
    private readonly proxyPoolService: ProxyPoolService,
    options: AccountCheckEngineOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 25000
  }

  private async applyAccountSurvivalTtl(client: TelegramClient) {
    const result = await client.invoke(new Api.account.SetAccountTTL({
      ttl: new Api.AccountDaysTTL({ days: 730 })
    }))

    if (!result || (typeof result === 'object' && 'className' in result && (result as { className?: string }).className === 'BoolFalse')) {
      throw new Error('账号存活检测失败：无法修改自动注销期限为 24 个月')
    }

    return 730
  }

  private buildProxyUsageMeta(proxy: AccountCheckProxy | null): ProxyUsageMeta {
    if (!proxy) {
      return {
        proxyUsed: false,
        proxyDisplay: null
      }
    }

    return {
      proxyUsed: true,
      proxyDisplay: '已连接代理'
    }
  }

  private toClientProxyOptions(proxy: AccountCheckProxy): AccountClientProxyOptions {
    return {
      type: proxy.type,
      ip: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      ipVersion: proxy.ipVersion
    }
  }

  private pickProxyAttempts() {
    const first = this.proxyPoolService.getAccountCheckProxy()
    if (!first) return [null]

    const second = this.proxyPoolService.getAccountCheckProxy([first.id])
    return second ? [first, second] : [first]
  }

  private createFailureResult(
    account: AccountRecord,
    error: unknown,
    durationMs: number,
    mode: 'account-status' | 'account-survival',
    probes: string[],
    proxyMeta: ProxyUsageMeta
  ) {
    const status = mode === 'account-survival'
      ? this.statusResolver.resolveHealthCheckError(error)
      : this.statusResolver.resolveFromError(error)
    const baseErrorMessage = error instanceof Error ? error.message : String(error)
    const probeSuffix = probes.length > 0 ? ` | ${buildProbeSummary(probes)}` : ''
    const proxySuffix = proxyMeta.proxyDisplay ? ` | 代理:${proxyMeta.proxyDisplay}` : ''
    const errorMessage = `${baseErrorMessage}${probeSuffix}${proxySuffix}`

    return {
      status,
      errorMessage,
      retryable: this.statusResolver.isRetryable(status, error)
    }
  }

  private async buildFrozenResultFromTelethon(
    account: AccountRecord,
    telethonFrozen: TelethonFreezeCheckResult,
    startedAt: number,
    proxyMeta: ProxyUsageMeta,
    source: string,
    checkMode: 'account-status' | 'account-survival' = 'account-status'
  ): Promise<AccountCheckResult> {
    const updated = await this.updateService.buildSuccessProfile({
      account,
      client: null,
      liveUser: {
        id: telethonFrozen.user_id ?? account.userId,
        first_name: telethonFrozen.first_name ?? account.profile.first_name,
        last_name: telethonFrozen.last_name ?? account.profile.last_name,
        username: telethonFrozen.username ?? account.username,
        phone: telethonFrozen.phone ?? account.phone
      },
      fullUser: null,
      spambotReply: '',
      status: 'frozen',
      checkMode,
      freezeSince: readTelethonFreezeSince(telethonFrozen),
      freezeUntil: readTelethonFreezeUntil(telethonFrozen),
      freezeAppealUrl: telethonFrozen.freeze_appeal_url ?? null,
      proxyUsed: proxyMeta.proxyUsed,
      proxyDisplay: proxyMeta.proxyDisplay,
      durationMs: Date.now() - startedAt
    })

    const payload: CheckResultInput = {
      id: account.id,
      profile: updated.profile,
      status: 'frozen',
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime
    }

    this.resultWriter.write(payload)

    return {
      accountId: account.id,
      status: 'frozen',
      profile: {
        ...updated.profile,
        check_error: `${source}${telethonFrozen.reason ? `:${telethonFrozen.reason}` : ''}`
      },
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs: Date.now() - startedAt,
      retryable: false
    }
  }

  private async readPremiumExpiryForPremiumAccount(account: AccountRecord, client: TelegramClient, liveUser: unknown, probes: string[]) {
    const liveUserRecord = typeof liveUser === 'object' && liveUser ? liveUser as { premium?: unknown } : null
    const isPremium = Boolean(liveUserRecord?.premium ?? account.profile.is_premium)

    if (!isPremium) {
      return {
        premiumExpiry: null,
        premiumExpirySource: null,
        premiumExpirySyncedAt: null
      }
    }

    const result = await withStepTimeout(readPremiumExpiryViaClient(client), this.timeoutMs, '会员到期时间读取')
    if (result.ok && result.premiumExpiry) {
      probes.push('Premium 到期时间读取成功')
      return {
        premiumExpiry: result.premiumExpiry,
        premiumExpirySource: 'mtproto-premium-promo',
        premiumExpirySyncedAt: new Date().toISOString()
      }
    }

    probes.push(`Premium 到期时间未命中:${result.message}`)
    return {
      premiumExpiry: null,
      premiumExpirySource: null,
      premiumExpirySyncedAt: null
    }
  }

  private async runTelethonFallbackStatusCheck(
    account: AccountRecord,
    startedAt: number,
    proxyMeta: ProxyUsageMeta,
    probes: string[],
    source: string
  ): Promise<AccountCheckResult> {
    const telethonResult = await withStepTimeout(
      this.telethonFreezeChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)),
      this.timeoutMs,
      'Telethon 状态兜底'
    )

    if (telethonResult?.status === 'frozen') {
      return this.buildFrozenResultFromTelethon(account, telethonResult, startedAt, proxyMeta, source)
    }

    if (telethonResult?.status === 'not_logged_in') {
      return this.persistFailure(
        account,
        'not_logged_in',
        `${source}：GramJS 消息解析异常，Telethon 判定 Session 未登录`,
        Date.now() - startedAt,
        false,
        'account-status',
        proxyMeta
      )
    }

    return this.persistFailure(
      account,
      'unknown',
      `${source}：GramJS 消息解析异常，未成功拿到 SpamBot 回复，当前无法判断双向状态`,
      Date.now() - startedAt,
      false,
      'account-status',
      proxyMeta
    )
  }

  private async buildResultFromTelethonSpamBot(
    account: AccountRecord,
    client: TelegramClient,
    liveUser: unknown,
    startedAt: number,
    proxyMeta: ProxyUsageMeta,
    probes: string[]
  ): Promise<AccountCheckResult> {
    const telethonSpamBot = await withStepTimeout(
      this.telethonSpamBotChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)),
      this.timeoutMs,
      'Telethon SpamBot 检测'
    )

    if (!telethonSpamBot) {
      return this.persistFailure(
        account,
        'unknown',
        'Telethon SpamBot 检测未返回结果，当前无法判断双向状态',
        Date.now() - startedAt,
        false,
        'account-status',
        proxyMeta
      )
    }

    probes.push(`Telethon SpamBot:${telethonSpamBot.status}${telethonSpamBot.reason ? `:${telethonSpamBot.reason}` : ''}`)

    if (telethonSpamBot.status === 'frozen') {
      return this.buildFrozenResultFromTelethon(account, {
        status: 'frozen',
        reason: telethonSpamBot.reason,
        user_id: telethonSpamBot.user_id,
        first_name: telethonSpamBot.first_name,
        last_name: telethonSpamBot.last_name,
        username: telethonSpamBot.username,
        phone: telethonSpamBot.phone,
        freeze_since_date: telethonSpamBot.freeze_since_date,
        freeze_until_date: telethonSpamBot.freeze_until_date,
        freeze_since_text: telethonSpamBot.freeze_since_text,
        freeze_until_text: telethonSpamBot.freeze_until_text,
        freeze_appeal_url: telethonSpamBot.freeze_appeal_url,
      }, startedAt, proxyMeta, 'Telethon SpamBot 检测')
    }

    if (telethonSpamBot.status === 'not_logged_in') {
      return this.persistFailure(
        account,
        'not_logged_in',
        'Telethon SpamBot 检测判定 Session 未登录',
        Date.now() - startedAt,
        false,
        'account-status',
        proxyMeta
      )
    }

    if (telethonSpamBot.status === 'timeout' || telethonSpamBot.status === 'unknown') {
      return this.persistFailure(
        account,
        telethonSpamBot.status,
        `${telethonSpamBot.summary}${telethonSpamBot.reason ? `：${telethonSpamBot.reason}` : ''}`,
        Date.now() - startedAt,
        false,
        'account-status',
        proxyMeta
      )
    }

    const premiumExpiryMeta = await this.readPremiumExpiryForPremiumAccount(account, client, liveUser, probes)
    const updated = await this.updateService.buildSuccessProfile({
      account,
      client,
      liveUser,
      fullUser: null,
      spambotReply: telethonSpamBot.replyText,
      status: telethonSpamBot.status,
      checkMode: 'account-status',
      premiumExpiryOverride: premiumExpiryMeta.premiumExpiry,
      premiumExpirySource: premiumExpiryMeta.premiumExpirySource,
      premiumExpirySyncedAt: premiumExpiryMeta.premiumExpirySyncedAt,
      proxyUsed: proxyMeta.proxyUsed,
      proxyDisplay: proxyMeta.proxyDisplay,
      durationMs: Date.now() - startedAt
    })

    const payload: CheckResultInput = {
      id: account.id,
      profile: updated.profile,
      status: telethonSpamBot.status,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime
    }

    this.resultWriter.write(payload)

    return {
      accountId: account.id,
      status: telethonSpamBot.status,
      profile: updated.profile,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs: Date.now() - startedAt,
      retryable: false
    }
  }

  private async runAccountSurvivalCheck(
    account: AccountRecord,
    client: TelegramClient,
    startedAt: number,
    logger: CheckLogger,
    proxyMeta: ProxyUsageMeta
  ): Promise<AccountCheckResult> {
    const probes: string[] = ['账号存活模式']
    if (proxyMeta.proxyDisplay) probes.push(`代理:${proxyMeta.proxyDisplay}`)

    const authorized = await withStepTimeout(client.checkAuthorization(), this.timeoutMs, 'Session 校验')
    probes.push(`Session 校验${authorized ? '成功' : '失败'}`)
    if (!authorized) {
      const failedPhone = account.phone || account.profile.phone || `账号#${account.id}`
      logger({ type: 'login_failed', phone: String(failedPhone), reason: 'Session 未登录' })
      return this.persistFailure(account, 'banned', '账号存活检测失败：Session 未登录', Date.now() - startedAt, false, 'account-survival', proxyMeta)
    }

    const liveUser = await withStepTimeout(client.getMe(), this.timeoutMs, '账号资料读取')
    if (!liveUser) {
      throw new Error('账号存活检测失败：无法读取账号信息')
    }
    probes.push('账号资料读取成功')

    const loginPhone = String((typeof liveUser === 'object' && liveUser && 'phone' in liveUser && typeof (liveUser as { phone?: unknown }).phone === 'string'
      ? (liveUser as { phone?: string }).phone
      : account.phone) || `账号#${account.id}`)
    logger({ type: 'login_success', phone: loginPhone })

    const ttlDays = await withStepTimeout(this.applyAccountSurvivalTtl(client), this.timeoutMs, '账号存活检测')
    probes.push(`自动注销期限已改为 ${ttlDays} 天`)
    const premiumExpiryMeta = await this.readPremiumExpiryForPremiumAccount(account, client, liveUser, probes)

    const updated = await this.updateService.buildSuccessProfile({
      account,
      client,
      liveUser,
      fullUser: null,
      spambotReply: '',
      status: 'alive',
      checkMode: 'account-survival',
      premiumExpiryOverride: premiumExpiryMeta.premiumExpiry,
      premiumExpirySource: premiumExpiryMeta.premiumExpirySource,
      premiumExpirySyncedAt: premiumExpiryMeta.premiumExpirySyncedAt,
      proxyUsed: proxyMeta.proxyUsed,
      proxyDisplay: proxyMeta.proxyDisplay,
      durationMs: Date.now() - startedAt
    })

    const profile = {
      ...updated.profile,
      account_ttl_days: ttlDays,
      check_mode: 'account-survival' as const
    }

    const payload: CheckResultInput = {
      id: account.id,
      profile,
      status: 'alive',
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime
    }

    this.resultWriter.write(payload)

    return {
      accountId: account.id,
      status: 'alive' as const,
      profile,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs: Date.now() - startedAt,
      retryable: false
    }
  }

  private async runAccountStatusCheck(
    account: AccountRecord,
    client: TelegramClient,
    startedAt: number,
    logger: CheckLogger,
    proxyMeta: ProxyUsageMeta
  ): Promise<AccountCheckResult> {
    const probes: string[] = []
    if (proxyMeta.proxyDisplay) probes.push(`代理:${proxyMeta.proxyDisplay}`)

    const authorized = await withStepTimeout(client.checkAuthorization(), this.timeoutMs, 'Session 校验')
    probes.push(`Session 校验${authorized ? '成功' : '失败'}`)
    const authorizationStatus = this.statusResolver.resolveAuthorization(authorized)
    if (authorizationStatus === 'not_logged_in') {
      const failedPhone = account.phone || account.profile.phone || `账号#${account.id}`
      logger({ type: 'login_failed', phone: String(failedPhone), reason: 'Session 未登录' })
      const durationMs = Date.now() - startedAt
      return this.persistFailure(account, 'banned', 'Session 未登录', durationMs, false, 'account-status', proxyMeta)
    }

    const liveUser = await withStepTimeout(client.getMe(), this.timeoutMs, '账号资料读取')
    probes.push('账号资料读取成功')

    const loginPhone = String((typeof liveUser === 'object' && liveUser && 'phone' in liveUser && typeof (liveUser as { phone?: unknown }).phone === 'string'
      ? (liveUser as { phone?: string }).phone
      : account.phone) || `账号#${account.id}`)
    logger({ type: 'login_success', phone: loginPhone })

    return this.buildResultFromTelethonSpamBot(account, client, liveUser, startedAt, proxyMeta, probes)
  }

  async run(accountId: number, logger: CheckLogger, mode: 'account-status' | 'account-survival' = 'account-status'): Promise<AccountCheckResult> {
    const startedAt = Date.now()
    const account = this.repository.getByIds([accountId])[0]

    if (!account) {
      return {
        accountId,
        status: 'unknown',
        profile: {},
        phone: '',
        username: '',
        userId: '',
        country: '',
        lastCheckTime: new Date().toISOString(),
        lastOnlineTime: null,
        durationMs: 0,
        retryable: false,
        errorMessage: '账号不存在'
      }
    }

    let session
    try {
      session = await withStepTimeout(this.sessionLoader.load(account.sessionPath), this.timeoutMs, 'Session 加载')
    } catch (error) {
      const failure = this.createFailureResult(account, error, Date.now() - startedAt, mode, [], { proxyUsed: false, proxyDisplay: null })
      return this.persistFailure(
        account,
        failure.status,
        failure.errorMessage,
        Date.now() - startedAt,
        failure.retryable,
        mode,
        { proxyUsed: false, proxyDisplay: null }
      )
    }

    const proxyAttempts = this.pickProxyAttempts()
    let finalFailure: ReturnType<AccountCheckEngine['createFailureResult']> | null = null
    let finalProxyMeta: ProxyUsageMeta = { proxyUsed: false, proxyDisplay: null }

    if (mode === 'account-status') {
      try {
        const telethonFrozen = await withStepTimeout(this.telethonFreezeChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)), this.timeoutMs, 'Telethon 冻结预检查')
        if (telethonFrozen?.status === 'frozen') {
          return this.buildFrozenResultFromTelethon(account, telethonFrozen, startedAt, finalProxyMeta, 'Telethon 冻结预检查', mode)
        }
      } catch {
        // ignore precheck failure and continue with main mtproto flow
      }
    }

    for (let index = 0; index < proxyAttempts.length; index += 1) {
      const proxy = proxyAttempts[index]
      const proxyMeta = this.buildProxyUsageMeta(proxy)
      let client: TelegramClient | null = null
      const probes: string[] = ['Session 加载成功']
      if (proxyMeta.proxyDisplay) {
        probes.push(`已分配代理:${proxyMeta.proxyDisplay}`)
      } else {
        probes.push('未使用代理')
      }

      try {
        client = this.clientManager.createClient(session, {
          proxy: proxy ? this.toClientProxyOptions(proxy) : null
        })

        await withStepTimeout(client.connect(), this.timeoutMs, 'Telegram 连接')
        probes.push('Telegram 连接成功')

        if (mode === 'account-survival') {
          return await this.runAccountSurvivalCheck(account, client, startedAt, logger, proxyMeta)
        }

        return await this.runAccountStatusCheck(account, client, startedAt, logger, proxyMeta)
      } catch (error) {
        const failure = this.createFailureResult(account, error, Date.now() - startedAt, mode, probes, proxyMeta)
        finalFailure = failure
        finalProxyMeta = proxyMeta

        const canRetryWithNextProxy = proxyMeta.proxyUsed
          && index === 0
          && proxyAttempts.length > 1
          && failure.retryable

        if (!canRetryWithNextProxy) {
          return this.persistFailure(
            account,
            failure.status,
            failure.errorMessage,
            Date.now() - startedAt,
            failure.retryable,
            mode,
            proxyMeta
          )
        }
      } finally {
        if (client) {
          await this.clientManager.destroyClient(client)
        }
      }
    }

    return this.persistFailure(
      account,
      finalFailure?.status ?? 'unknown',
      finalFailure?.errorMessage ?? '代理重试后仍未获得有效结果',
      Date.now() - startedAt,
      finalFailure?.retryable ?? false,
      mode,
      finalProxyMeta
    )
  }

  private persistFailure(
    account: AccountRecord,
    status: AccountCheckResult['status'],
    errorMessage: string,
    durationMs: number,
    retryable = false,
    mode: 'account-status' | 'account-survival' = 'account-status',
    proxyMeta: ProxyUsageMeta = { proxyUsed: false, proxyDisplay: null }
  ) {
    const updated = this.updateService.buildFailureProfile({
      account,
      status,
      checkMode: mode,
      errorMessage,
      proxyUsed: proxyMeta.proxyUsed,
      proxyDisplay: proxyMeta.proxyDisplay,
      durationMs
    })

    const payload: CheckResultInput = {
      id: account.id,
      profile: updated.profile,
      status,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime
    }

    this.resultWriter.write(payload)

    return {
      accountId: account.id,
      status,
      profile: updated.profile,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs,
      retryable,
      errorMessage
    }
  }
}
