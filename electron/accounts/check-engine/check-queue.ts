import { EventEmitter } from 'node:events'
import type { AccountCheckResult, CheckLogEntry, CheckLogLevel, CheckQueueState } from '../types'
import { AccountCheckEngine } from './check-engine'

interface QueueTask {
  accountId: number
  attempt: number
}

const STATUS_LABELS: Record<AccountCheckResult['status'], string> = {
  alive: '无限制',
  banned: '封禁',
  limited: '双向',
  temporary_limited: '临时双向',
  frozen: '冻结',
  session_expired: 'Session 失效',
  not_logged_in: '未登录',
  multi_ip: '多 IP 登录',
  timeout: '超时',
  checking: '检测中',
  unknown: '未检查'
}

interface CheckQueueOptions {
  concurrency?: number
  timeoutMs?: number
  retryLimit?: number
}

function createInitialState(options: Required<CheckQueueOptions>): CheckQueueState {
  return {
    running: false,
    concurrency: options.concurrency,
    timeoutMs: options.timeoutMs,
    retryLimit: options.retryLimit,
    pendingCount: 0,
    activeCount: 0,
    completedCount: 0,
    failedCount: 0,
    totalCount: 0,
    queuedAccountIds: [],
    activeAccountIds: [],
    logs: [],
    resultSummary: {
      total: 0,
      alive: 0,
      limited: 0,
      temporary_limited: 0,
      frozen: 0,
      banned: 0,
      timeout: 0
    },
    lastUpdatedAt: null
  }
}

export class CheckQueue extends EventEmitter {
  private readonly options: Required<CheckQueueOptions>
  private readonly pending: QueueTask[] = []
  private readonly active = new Map<number, QueueTask>()
  private readonly state: CheckQueueState
  private logSerial = 0

  constructor(private readonly engine: AccountCheckEngine, options: CheckQueueOptions = {}) {
    super()
    this.options = {
      concurrency: options.concurrency ?? 3,
      timeoutMs: options.timeoutMs ?? 25000,
      retryLimit: options.retryLimit ?? 2
    }
    this.state = createInitialState(this.options)
  }

  getState() {
    return {
      ...this.state,
      queuedAccountIds: [...this.state.queuedAccountIds],
      activeAccountIds: [...this.state.activeAccountIds],
      logs: [...this.state.logs]
    }
  }

  clearLogs() {
    this.state.logs = []
    this.state.resultSummary = {
      total: 0,
      alive: 0,
      limited: 0,
      temporary_limited: 0,
      frozen: 0,
      banned: 0,
      timeout: 0
    }
    this.bump()
  }

  enqueue(accountIds: number[]) {
    const uniqueIds = Array.from(new Set(accountIds))
    let addedCount = 0

    if (!this.state.running && this.pending.length === 0 && this.active.size === 0) {
      this.state.completedCount = 0
      this.state.failedCount = 0
      this.state.totalCount = 0
      this.state.logs = []
      this.state.resultSummary = {
        total: 0,
        alive: 0,
        limited: 0,
        temporary_limited: 0,
        frozen: 0,
        banned: 0,
        timeout: 0
      }
      if (uniqueIds.length > 0) {
        this.appendLog('info', null, `已选择 ${uniqueIds.length} 个账号，检查任务进行中，请稍等`)
      }
    }

    for (const accountId of uniqueIds) {
      const alreadyQueued = this.pending.some((task) => task.accountId === accountId)
      const alreadyRunning = this.active.has(accountId)
      if (alreadyQueued || alreadyRunning) continue

      this.pending.push({ accountId, attempt: 0 })
      addedCount += 1
    }

    this.state.totalCount += addedCount
    this.syncCounters()
    void this.drain()
    return this.getState()
  }

  private async drain() {
    while (this.active.size < this.options.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()
      if (!task) break

      this.active.set(task.accountId, task)
      this.syncCounters()
      void this.runTask(task)
    }

    this.syncCounters()
    this.bump()
  }

  private async runTask(task: QueueTask) {
    try {
      const result = await this.engine.run(task.accountId, (payload) => {
        if (payload.type === 'login_success') {
          this.appendLog('success', task.accountId, `${payload.phone} ---- 登录成功`, task.attempt + 1, {
            phone: payload.phone,
            status: null
          })
          return
        }

        this.appendLog('warning', task.accountId, `${payload.phone} ---- 登录失败（${payload.reason}）`, task.attempt + 1, {
          phone: payload.phone,
          status: null
        })
      })
      this.handleResult(task, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const fallbackResult: AccountCheckResult = {
        accountId: task.accountId,
        status: 'unknown',
        profile: {},
        phone: '',
        username: '',
        userId: '',
        country: '',
        lastCheckTime: new Date().toISOString(),
        lastOnlineTime: null,
        durationMs: this.options.timeoutMs,
        retryable: false,
        errorMessage: message
      }
      this.handleResult(task, fallbackResult)
    } finally {
      this.active.delete(task.accountId)
      this.syncCounters()
      await this.drain()
    }
  }

  private normalizeDisplayStatus(status: AccountCheckResult['status']) {
    if (status === 'alive' || status === 'limited' || status === 'temporary_limited' || status === 'frozen' || status === 'banned' || status === 'timeout') {
      return status
    }

    return 'timeout' as const
  }

  private formatFailureReason(result: AccountCheckResult) {
    const raw = (result.errorMessage || '').trim()
    const normalized = raw.toLowerCase()

    if (!raw) {
      if (result.status === 'not_logged_in') return 'Session 未登录'
      if (result.status === 'session_expired') return 'Session 已失效'
      if (result.status === 'multi_ip') return '检测到多 IP 登录'
      if (result.status === 'unknown') return '未拿到有效结果'
      return STATUS_LABELS[result.status]
    }

    if (normalized.includes('session 加载')) return 'Session 加载超时'
    if (normalized.includes('telegram 连接')) return '连接 Telegram 超时'
    if (normalized.includes('session 校验')) return 'Session 校验超时'
    if (normalized.includes('账号资料读取')) return '读取账号资料超时'
    if (normalized.includes('完整资料读取')) return '读取完整资料超时'
    if (normalized.includes('spambot 检测')) return 'SpamBot 检测超时'
    if (normalized.includes('session 未登录')) return 'Session 未登录'
    if (normalized.includes('session revoked') || normalized.includes('session expired') || normalized.includes('auth_key_unregistered')) return 'Session 已失效'
    if (normalized.includes('phone number banned') || normalized.includes('user_deactivated_ban') || normalized.includes('banned')) return '账号已封禁'
    if (normalized.includes('network') || normalized.includes('socket') || normalized.includes('disconnect')) return '网络连接失败'
    if (normalized.includes('timeout') || normalized.includes('timed out')) return '请求超时'

    return raw
  }

  private handleResult(task: QueueTask, result: AccountCheckResult) {
    if (result.retryable && task.attempt + 1 <= this.options.retryLimit) {
      const retryTask = { accountId: task.accountId, attempt: task.attempt + 1 }
      this.pending.push(retryTask)
      this.syncCounters()
      return
    }

    this.state.completedCount += 1

    const displayStatus = this.normalizeDisplayStatus(result.status)
    const phoneLabel = result.phone || `账号#${task.accountId}`
    if (displayStatus === 'timeout') {
      this.state.failedCount += 1
    }
    this.state.resultSummary.total += 1
    this.state.resultSummary[displayStatus] += 1

    const level: CheckLogLevel = displayStatus === 'alive' ? 'success' : displayStatus === 'timeout' ? 'error' : 'warning'
    const reasonSuffix = displayStatus === 'timeout' ? `（${this.formatFailureReason(result)}）` : ''
    this.appendLog(level, task.accountId, `${phoneLabel} ---- ${STATUS_LABELS[displayStatus]}${reasonSuffix}`, task.attempt + 1, {
      phone: result.phone,
      status: displayStatus
    })
  }

  private appendLog(level: CheckLogLevel, accountId: number | null, message: string, attempt?: number, meta?: { phone?: string; status?: AccountCheckResult['status'] | null }) {
    this.logSerial += 1
    const entry: CheckLogEntry = {
      id: `log-${Date.now()}-${this.logSerial}`,
      accountId,
      level,
      message,
      createdAt: new Date().toISOString(),
      attempt,
      phone: meta?.phone,
      status: meta?.status ?? null
    }
    this.state.logs = [...this.state.logs, entry].slice(-200)
    this.bump()
  }

  private syncCounters() {
    const wasRunning = this.state.running
    this.state.pendingCount = this.pending.length
    this.state.activeCount = this.active.size
    this.state.queuedAccountIds = this.pending.map((task) => task.accountId)
    this.state.activeAccountIds = Array.from(this.active.keys())
    this.state.running = this.pending.length > 0 || this.active.size > 0

    if (wasRunning && !this.state.running && this.state.totalCount === this.state.completedCount) {
      this.appendLog('success', null, '本次检测已完成')
      this.appendLog('info', null, `总数量 ${this.state.resultSummary.total}`)
      this.appendLog('info', null, `无限制 ${this.state.resultSummary.alive}`)
      this.appendLog('info', null, `双向 ${this.state.resultSummary.limited}`)
      this.appendLog('info', null, `临时双向 ${this.state.resultSummary.temporary_limited}`)
      this.appendLog('info', null, `冻结 ${this.state.resultSummary.frozen}`)
      this.appendLog('info', null, `封禁 ${this.state.resultSummary.banned}`)
      this.appendLog('info', null, `超时 ${this.state.resultSummary.timeout}`)
    }
  }

  private bump() {
    this.state.lastUpdatedAt = new Date().toISOString()
    this.emit('state', this.getState())
  }
}
