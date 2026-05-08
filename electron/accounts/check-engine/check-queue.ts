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
    this.bump()
  }

  enqueue(accountIds: number[]) {
    const uniqueIds = Array.from(new Set(accountIds))
    let addedCount = 0

    if (!this.state.running && this.pending.length === 0 && this.active.size === 0) {
      this.state.completedCount = 0
      this.state.failedCount = 0
      this.state.totalCount = 0
    }

    for (const accountId of uniqueIds) {
      const alreadyQueued = this.pending.some((task) => task.accountId === accountId)
      const alreadyRunning = this.active.has(accountId)
      if (alreadyQueued || alreadyRunning) continue

      this.pending.push({ accountId, attempt: 0 })
      addedCount += 1
      this.appendLog('info', accountId, '已加入检查队列')
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
      this.appendLog('info', task.accountId, `开始检测（第 ${task.attempt + 1} 次）`, task.attempt + 1)
      this.syncCounters()
      void this.runTask(task)
    }

    this.syncCounters()
    this.bump()
  }

  private async runTask(task: QueueTask) {
    try {
      const result = await this.engine.run(task.accountId, (message) => this.appendLog('info', task.accountId, message, task.attempt + 1))
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

  private handleResult(task: QueueTask, result: AccountCheckResult) {
    if (result.retryable && task.attempt + 1 <= this.options.retryLimit) {
      const retryTask = { accountId: task.accountId, attempt: task.attempt + 1 }
      this.pending.push(retryTask)
      this.appendLog('warning', task.accountId, `检测失败，准备重试：${result.errorMessage ?? STATUS_LABELS[result.status]}`, task.attempt + 1, {
        phone: result.phone,
        status: result.status
      })
      this.syncCounters()
      return
    }

    this.state.completedCount += 1

    const phoneLabel = result.phone || `账号#${task.accountId}`
    if (result.status === 'timeout' || result.status === 'unknown') {
      this.state.failedCount += 1
      this.appendLog('error', task.accountId, `${phoneLabel} ---- ${STATUS_LABELS[result.status]}${result.errorMessage ? ` - ${result.errorMessage}` : ''}`, task.attempt + 1, {
        phone: result.phone,
        status: result.status
      })
    } else {
      const level: CheckLogLevel = result.status === 'alive' ? 'success' : 'warning'
      this.appendLog(level, task.accountId, `${phoneLabel} ---- ${STATUS_LABELS[result.status]}`, task.attempt + 1, {
        phone: result.phone,
        status: result.status
      })
    }
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
    this.state.logs = [entry, ...this.state.logs].slice(0, 200)
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
      this.appendLog('success', null, '本轮批量检测已完成')
    }
  }

  private bump() {
    this.state.lastUpdatedAt = new Date().toISOString()
    this.emit('state', this.getState())
  }
}
