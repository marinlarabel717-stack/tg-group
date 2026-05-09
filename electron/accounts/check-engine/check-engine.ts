import type { TelegramClient } from 'telegram'
import type { AccountCheckResult, AccountRecord, CheckResultInput } from '../types'
import type { AccountRepository } from '../services/account-repository'
import { AccountUpdateService } from './account-update-service'
import { CheckResultWriter } from './check-result-writer'
import { SessionLoader } from './session-loader'
import { SpamBotChecker } from './spam-bot-checker'
import { StatusResolver } from './status-resolver'
import { TelegramClientManager } from './telegram-client-manager'

interface CheckLogger {
  (payload: { type: 'login_success'; phone: string } | { type: 'login_failed'; phone: string; reason: string }): void
}

interface AccountCheckEngineOptions {
  timeoutMs?: number
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

export class AccountCheckEngine {
  private readonly timeoutMs: number

  constructor(
    private readonly repository: AccountRepository,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly spamBotChecker: SpamBotChecker,
    private readonly statusResolver: StatusResolver,
    private readonly updateService: AccountUpdateService,
    private readonly resultWriter: CheckResultWriter,
    options: AccountCheckEngineOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 25000
  }

  async run(accountId: number, logger: CheckLogger): Promise<AccountCheckResult> {
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

    let client: TelegramClient | null = null

    try {
      const session = await withStepTimeout(this.sessionLoader.load(account.sessionPath), this.timeoutMs, 'Session 加载')

      client = this.clientManager.createClient(session, account.profile)

      await withStepTimeout(client.connect(), this.timeoutMs, 'Telegram 连接')

      const authorized = await withStepTimeout(client.checkAuthorization(), this.timeoutMs, 'Session 校验')
      const authorizationStatus = this.statusResolver.resolveAuthorization(authorized)
      if (authorizationStatus === 'not_logged_in') {
        const failedPhone = account.phone || account.profile.phone || `账号#${account.id}`
        logger({ type: 'login_failed', phone: String(failedPhone), reason: 'Session 未登录' })
        const durationMs = Date.now() - startedAt
        return this.persistFailure(account, authorizationStatus, 'Session 未登录', durationMs)
      }

      const liveUser = await withStepTimeout(client.getMe(), this.timeoutMs, '账号资料读取')
      const frozenState = await withStepTimeout(this.spamBotChecker.detectFrozenState(client), this.timeoutMs, '冻结状态检测')

      const loginPhone = String((typeof liveUser === 'object' && liveUser && 'phone' in liveUser && typeof (liveUser as { phone?: unknown }).phone === 'string'
        ? (liveUser as { phone?: string }).phone
        : account.phone) || `账号#${account.id}`)
      logger({ type: 'login_success', phone: loginPhone })

      if (frozenState.frozen) {
        const updated = this.updateService.buildSuccessProfile({
          account,
          liveUser,
          fullUser: null,
          spambotReply: '',
          status: 'frozen',
          freezeSince: frozenState.freezeSince,
          freezeUntil: frozenState.freezeUntil,
          freezeAppealUrl: frozenState.freezeAppealUrl,
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
          lastCheckTime: updated.lastCheckTime,
          lastOnlineTime: updated.lastOnlineTime,
          durationMs: Date.now() - startedAt,
          retryable: false
        }
      }

      const fullUser = await withStepTimeout(this.spamBotChecker.getFullProfile(client), this.timeoutMs, '完整资料读取')

      const spamResult = await withStepTimeout(this.spamBotChecker.check(client), this.timeoutMs, 'SpamBot 检测')
      const updated = this.updateService.buildSuccessProfile({
        account,
        liveUser,
        fullUser,
        spambotReply: spamResult.replyText,
        status: spamResult.status,
        freezeSince: spamResult.freezeSince,
        freezeUntil: spamResult.freezeUntil,
        freezeAppealUrl: spamResult.freezeAppealUrl,
        durationMs: Date.now() - startedAt
      })

      const payload: CheckResultInput = {
        id: account.id,
        profile: updated.profile,
        status: spamResult.status,
        phone: updated.phone,
        username: updated.username,
        userId: updated.userId,
        country: updated.country,
        lastCheckTime: updated.lastCheckTime,
        lastOnlineTime: updated.lastOnlineTime
      }

      this.resultWriter.write(payload)

      return {
        accountId: account.id,
        status: spamResult.status,
        profile: updated.profile,
        phone: updated.phone,
        username: updated.username,
        userId: updated.userId,
        country: updated.country,
        lastCheckTime: updated.lastCheckTime,
        lastOnlineTime: updated.lastOnlineTime,
        durationMs: Date.now() - startedAt,
        retryable: false
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const status = this.statusResolver.resolveFromError(error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.persistFailure(account, status, errorMessage, durationMs, this.statusResolver.isRetryable(status, error))
    } finally {
      if (client) {
        await this.clientManager.destroyClient(client)
      }
    }
  }

  private persistFailure(account: AccountRecord, status: AccountCheckResult['status'], errorMessage: string, durationMs: number, retryable = false) {
    const updated = this.updateService.buildFailureProfile({
      account,
      status,
      errorMessage,
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
      lastCheckTime: updated.lastCheckTime,
      lastOnlineTime: updated.lastOnlineTime,
      durationMs,
      retryable,
      errorMessage
    }
  }
}
