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
import { readPremiumExpiryViaClient } from '../telegram-desktop-premium-service'
import { type AccountCheckProxy, formatMaskedProxyLabel, ProxyPoolService } from '../../proxy-pool/service'

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
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(parsed * 1000).toISOString()
    }
  }

  return null
}

export class AccountCheckEngine {
  private readonly timeoutMs: number

  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly telethonFreezeChecker: TelethonFreezeChecker,
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
      proxyDisplay: formatMaskedProxyLabel(proxy)
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
      return this.persistFailure(account, authorizationStatus, 'Session 未登录', durationMs, false, 'account-status', proxyMeta)
    }

    const liveUser = await withStepTimeout(client.getMe(), this.timeoutMs, '账号资料读取')
    probes.push('账号资料读取成功')
    const frozenState = await withStepTimeout(this.spamBotChecker.detectFrozenState(client), this.timeoutMs, '冻结状态检测')
    if (frozenState.errorMessage) {
      probes.push(`冻结探针失败:${frozenState.errorMessage}`)
    } else if (frozenState.frozen) {
      probes.push(`冻结探针命中:${frozenState.reason ?? 'APP_CONFIG'}`)
    } else {
      probes.push('冻结探针未命中')
    }
    if (frozenState.appConfigSummary) {
      probes.push(`AppConfig:${frozenState.appConfigSummary}`)
    }

    const loginPhone = String((typeof liveUser === 'object' && liveUser && 'phone' in liveUser && typeof (liveUser as { phone?: unknown }).phone === 'string'
      ? (liveUser as { phone?: string }).phone
      : account.phone) || `账号#${account.id}`)
    logger({ type: 'login_success', phone: loginPhone })

    if (frozenState.frozen) {
      const telethonFrozen = await withStepTimeout(this.telethonFreezeChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)), this.timeoutMs, 'Telethon 冻结检测')
      if (telethonFrozen?.status) {
        probes.push(`Telethon 冻结补充:${telethonFrozen.status}${telethonFrozen.reason ? `:${telethonFrozen.reason}` : ''}`)
      }
      const premiumExpiryMeta = await this.readPremiumExpiryForPremiumAccount(account, client, liveUser, probes)
      const updated = await this.updateService.buildSuccessProfile({
        account,
        client,
        liveUser,
        fullUser: null,
        spambotReply: '',
        status: 'frozen',
        checkMode: 'account-status',
        freezeSince: normalizeTelethonFreezeDate(telethonFrozen?.freeze_since_date) ?? frozenState.freezeSince,
        freezeUntil: normalizeTelethonFreezeDate(telethonFrozen?.freeze_until_date) ?? frozenState.freezeUntil,
        freezeAppealUrl: telethonFrozen?.freeze_appeal_url ?? frozenState.freezeAppealUrl,
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

    const selfProbe = await withStepTimeout(this.spamBotChecker.probeFrozenBySelfMessage(client), this.timeoutMs, '冻结发送探针')
    if (selfProbe.errorMessage) {
      probes.push(`冻结发送探针失败:${selfProbe.errorMessage}`)
    } else if (selfProbe.frozen) {
      probes.push(`冻结发送探针命中:${selfProbe.reason ?? 'FROZEN_RPC'}`)
    } else {
      probes.push(`冻结发送探针未命中:${selfProbe.reason ?? 'SELF_PROBE_OK'}`)
    }
    if (selfProbe.appConfigSummary) {
      probes.push(`冻结探针AppConfig:${selfProbe.appConfigSummary}`)
    }

    if (selfProbe.frozen) {
      const telethonFrozen = await withStepTimeout(this.telethonFreezeChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)), this.timeoutMs, 'Telethon 冻结检测')
      if (telethonFrozen?.status) {
        probes.push(`Telethon 冻结补充:${telethonFrozen.status}${telethonFrozen.reason ? `:${telethonFrozen.reason}` : ''}`)
      }
      const premiumExpiryMeta = await this.readPremiumExpiryForPremiumAccount(account, client, liveUser, probes)
      const updated = await this.updateService.buildSuccessProfile({
        account,
        client,
        liveUser,
        fullUser: null,
        spambotReply: '',
        status: 'frozen',
        checkMode: 'account-status',
        freezeSince: normalizeTelethonFreezeDate(telethonFrozen?.freeze_since_date) ?? selfProbe.freezeSince,
        freezeUntil: normalizeTelethonFreezeDate(telethonFrozen?.freeze_until_date) ?? selfProbe.freezeUntil,
        freezeAppealUrl: telethonFrozen?.freeze_appeal_url ?? selfProbe.freezeAppealUrl,
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

    const fullUser = await withStepTimeout(this.spamBotChecker.getFullProfile(client), this.timeoutMs, '完整资料读取')
    probes.push('完整资料读取成功')

    const spamResult = await withStepTimeout(this.spamBotChecker.check(client), this.timeoutMs, 'SpamBot 检测')
    probes.push(`SpamBot 检测完成:${spamResult.status}`)
    const telethonFrozen = spamResult.status === 'frozen'
      ? await withStepTimeout(this.telethonFreezeChecker.check(account.sessionPath, Math.ceil(this.timeoutMs / 1000)), this.timeoutMs, 'Telethon 冻结检测')
      : null
    if (telethonFrozen?.status) {
      probes.push(`Telethon 冻结补充:${telethonFrozen.status}${telethonFrozen.reason ? `:${telethonFrozen.reason}` : ''}`)
    }
    const premiumExpiryMeta = await this.readPremiumExpiryForPremiumAccount(account, client, liveUser, probes)
    const updated = await this.updateService.buildSuccessProfile({
      account,
      client,
      liveUser,
      fullUser,
      spambotReply: spamResult.replyText,
      status: spamResult.status as AccountCheckResult['status'],
      checkMode: 'account-status',
      freezeSince: normalizeTelethonFreezeDate(telethonFrozen?.freeze_since_date) ?? spamResult.freezeSince,
      freezeUntil: normalizeTelethonFreezeDate(telethonFrozen?.freeze_until_date) ?? spamResult.freezeUntil,
      freezeAppealUrl: telethonFrozen?.freeze_appeal_url ?? spamResult.freezeAppealUrl,
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
      status: spamResult.status as AccountCheckResult['status'],
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime
    }

    this.resultWriter.write(payload)

    const probeSummary = buildProbeSummary(probes)
    const replySnippet = buildReplySnippet(spamResult.replyText)
    const unknownReason = spamResult.status === 'unknown'
      ? [
          spamResult.summary || 'SpamBot 回复未命中规则',
          replySnippet ? `回复:${replySnippet}` : '',
          probeSummary
        ].filter(Boolean).join(' | ')
      : undefined

    return {
      accountId: account.id,
      status: spamResult.status,
      profile: updated.profile,
      phone: updated.phone,
      username: updated.username,
      userId: updated.userId,
      country: updated.country,
      proxyDisplay: updated.proxyDisplay,
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs: Date.now() - startedAt,
      retryable: false,
      errorMessage: unknownReason
    }
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
