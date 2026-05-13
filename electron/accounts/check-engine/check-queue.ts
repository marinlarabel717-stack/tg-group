import { EventEmitter } from 'node:events'
import type { AccountCheckResult, CheckLogEntry, CheckLogLevel, CheckQueueState } from '../types'
import { AccountCheckEngine } from './check-engine'
import { resolveAccountStatusLabel } from '../../../src/lib/ui-text'

interface QueueTask {
  accountId: number
  attempt: number
  mode: 'account-status' | 'account-survival'
}

const STATUS_LABELS: Record<AccountCheckResult['status'], string> = {
  alive: '无限制',
  banned: '封禁',
  limited: '双向',
  temporary_limited: '临时双向',
  geo_restricted: '地理位置限制',
  frozen: '冻结',
  session_expired: 'Session 失效',
  not_logged_in: '未登录',
  multi_ip: '多 IP 登录',
  timeout: '超时',
  checking: '检测中',
  unknown: '未检查'
}

function formatAccountResultLogLine(payload: {
  phoneLabel: string
  progress: string
  displayLabel: string
  frozenSinceSuffix?: string
  reasonSuffix?: string
}) {
  return `[${payload.phoneLabel}] - [${payload.progress}] - ${payload.displayLabel}${payload.frozenSinceSuffix || ''}${payload.reasonSuffix || ''}`
}

function readSummaryLabel(status: AccountCheckResult['status'], runMode: 'account-status' | 'account-survival') {
  if (status === 'alive') {
    return runMode === 'account-survival' ? '存活' : '无限制'
  }
  if (status === 'limited') return '双向'
  if (status === 'temporary_limited') return '临时双向'
  if (status === 'geo_restricted') return '地理位置限制'
  if (status === 'frozen') return '冻结'
  if (status === 'banned') return '封禁'
  if (status === 'multi_ip') return '多 IP 登录'
  if (status === 'timeout') return '超时'
  return '未知'
}

interface CheckQueueOptions {
  concurrency?: number
  timeoutMs?: number
  retryLimit?: number
}

function createQueueTimeoutResult(task: QueueTask, timeoutMs: number): AccountCheckResult {
  return {
    accountId: task.accountId,
    status: 'timeout',
    profile: {},
    phone: '',
    username: '',
    userId: '',
    country: '',
    lastCheckTime: new Date().toISOString(),
    lastOnlineTime: null,
    durationMs: timeoutMs,
    retryable: false,
    errorMessage: `单个账号检测超过 ${Math.ceil(timeoutMs / 1000)} 秒，已自动判定超时并继续下一个账号`
  }
}

function formatFrozenSince(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function createInitialState(options: Required<CheckQueueOptions>): CheckQueueState {
  return {
    running: false,
    runMode: 'account-status',
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
      geo_restricted: 0,
      frozen: 0,
      banned: 0,
      multi_ip: 0,
      timeout: 0,
      unknown: 0
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
  private currentRunMode: 'account-status' | 'account-survival' = 'account-status'

  constructor(private readonly engine: AccountCheckEngine, options: CheckQueueOptions = {}) {
    super()
    this.options = {
      concurrency: options.concurrency ?? 3,
      timeoutMs: options.timeoutMs ?? 60000,
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

  updateOptions(options: CheckQueueOptions) {
    if (options.concurrency !== undefined) {
      this.options.concurrency = Math.min(20, Math.max(1, Math.trunc(options.concurrency)))
      this.state.concurrency = this.options.concurrency
    }

    if (options.timeoutMs !== undefined) {
      this.options.timeoutMs = Math.max(5000, Math.trunc(options.timeoutMs))
      this.state.timeoutMs = this.options.timeoutMs
    }

    if (options.retryLimit !== undefined) {
      this.options.retryLimit = Math.max(0, Math.trunc(options.retryLimit))
      this.state.retryLimit = this.options.retryLimit
    }

    void this.drain()
    this.bump()
    return this.getState()
  }

  clearLogs() {
    this.state.logs = []
    this.state.resultSummary = {
      total: 0,
      alive: 0,
      limited: 0,
      temporary_limited: 0,
      geo_restricted: 0,
      frozen: 0,
      banned: 0,
      multi_ip: 0,
      timeout: 0,
      unknown: 0
    }
    this.state.runMode = this.currentRunMode
    this.bump()
  }

  enqueue(accountIds: number[], mode: 'account-status' | 'account-survival' = 'account-status') {
    const uniqueIds = Array.from(new Set(accountIds))
    let addedCount = 0

    if (!this.state.running && this.pending.length === 0 && this.active.size === 0) {
      this.currentRunMode = mode
      this.state.runMode = mode
      this.state.completedCount = 0
      this.state.failedCount = 0
      this.state.totalCount = 0
      this.state.logs = []
      this.state.resultSummary = {
        total: 0,
        alive: 0,
        limited: 0,
        temporary_limited: 0,
        geo_restricted: 0,
        frozen: 0,
        banned: 0,
        multi_ip: 0,
        timeout: 0,
        unknown: 0
      }
      if (uniqueIds.length > 0) {
        const taskLabel = mode === 'account-survival' ? '账号存活检测' : '账号状态检测'
        this.appendLog('info', null, `已选择 ${uniqueIds.length} 个账号，${taskLabel}任务进行中，请稍等`)
      }
    }

    for (const accountId of uniqueIds) {
      const alreadyQueued = this.pending.some((task) => task.accountId === accountId)
      const alreadyRunning = this.active.has(accountId)
      if (alreadyQueued || alreadyRunning) continue

      this.pending.push({ accountId, attempt: 0, mode })
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
    let settled = false
    try {
      const result = await Promise.race<AccountCheckResult>([
        this.engine.run(task.accountId, (payload) => {
          if (settled || payload.type === 'login_success') {
            return
          }

          if ((payload.reason || '').includes('Session 未登录')) {
            return
          }

          this.appendLog('warning', task.accountId, `${payload.phone} ---- 登录失败（${payload.reason}）`, task.attempt + 1, {
            phone: payload.phone,
            status: null
          })
        }, task.mode),
        new Promise<AccountCheckResult>((resolve) => {
          setTimeout(() => resolve(createQueueTimeoutResult(task, this.options.timeoutMs)), this.options.timeoutMs)
        })
      ])
      settled = true
      this.handleResult(task, result)
    } catch (error) {
      settled = true
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
      settled = true
      this.active.delete(task.accountId)
      this.syncCounters()
      await this.drain()
    }
  }

  private normalizeDisplayStatus(status: AccountCheckResult['status']) {
    if (status === 'alive' || status === 'limited' || status === 'temporary_limited' || status === 'geo_restricted' || status === 'frozen' || status === 'banned' || status === 'multi_ip' || status === 'timeout' || status === 'unknown') {
      return status
    }

    if (status === 'session_expired' || status === 'not_logged_in') {
      return 'banned' as const
    }

    return 'timeout' as const
  }

  private formatFailureReason(result: AccountCheckResult) {
    const raw = (result.errorMessage || '').trim()
    const baseError = raw.includes('| 探针:') ? raw.split('| 探针:')[0]?.trim() ?? raw : raw
    const normalized = baseError.toLowerCase()
    const probeText = raw.includes('| 探针:') ? raw.split('| 探针:')[1]?.trim() ?? '' : ''
    const appendProbeHint = (reason: string) => {
      if (!probeText) return reason
      if (probeText.includes('冻结探针命中')) return `${reason}，但冻结探针已命中`
      if (probeText.includes('冻结探针未命中')) return `${reason}，冻结探针未命中`
      if (probeText.includes('冻结探针失败:')) {
        const detail = probeText.split('冻结探针失败:')[1]?.split('>')[0]?.trim()
        return detail ? `${reason}，冻结探针失败：${detail}` : `${reason}，冻结探针失败`
      }
      return reason
    }

    if (!baseError) {
      if (result.status === 'not_logged_in') return 'Session 未登录'
      if (result.status === 'session_expired') return 'Session 已失效'
      if (result.status === 'multi_ip') return '检测到多 IP 登录'
      if (result.status === 'geo_restricted') return '地理位置限制'
      if (result.status === 'unknown') return '未拿到有效结果'
      return STATUS_LABELS[result.status]
    }

    if (normalized.includes('session 加载')) return appendProbeHint('Session 加载超时')
    if (normalized.includes('telegram 连接')) return appendProbeHint('连接 Telegram 超时')
    if (normalized.includes('session 校验')) return appendProbeHint('Session 校验超时')
    if (normalized.includes('账号资料读取')) return appendProbeHint('读取账号资料超时')
    if (normalized.includes('冻结状态检测')) return appendProbeHint('冻结状态检测超时')
    if (normalized.includes('冻结发送探针')) return appendProbeHint('冻结发送探针超时')
    if (normalized.includes('完整资料读取')) return appendProbeHint('读取完整资料超时')
    if (normalized.includes('spambot 检测')) return appendProbeHint('SpamBot 检测超时')
    if (normalized.includes('session 未登录')) return 'Session 未登录'
    if (normalized.includes('session revoked') || normalized.includes('session expired') || normalized.includes('auth_key_unregistered')) return 'Session 已失效'
    if (normalized.includes('auth_key_duplicated')) return '检测到多 IP 登录'
    if (normalized.includes('phone number banned') || normalized.includes('user_deactivated_ban') || normalized.includes('banned')) return '账号已封禁'
    if (normalized.includes('network') || normalized.includes('socket') || normalized.includes('disconnect')) return appendProbeHint('网络连接失败')
    if (normalized.includes('timeout') || normalized.includes('timed out')) return appendProbeHint('请求超时')
    if (normalized.includes('spambot 回复未命中规则')) {
      const replyText = baseError.includes('回复:') ? baseError.split('回复:')[1]?.split('|')[0]?.trim() ?? '' : ''
      const base = replyText ? `SpamBot 返回未命中规则：${replyText}` : 'SpamBot 返回未命中规则'
      return appendProbeHint(base)
    }

    return appendProbeHint(baseError)
  }

  private handleResult(task: QueueTask, result: AccountCheckResult) {
    if (result.retryable && task.attempt + 1 <= this.options.retryLimit) {
        const retryTask = { accountId: task.accountId, attempt: task.attempt + 1, mode: task.mode }
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
    const displayLabel = resolveAccountStatusLabel(
      displayStatus,
      result.errorMessage,
      task.mode === 'account-survival' ? 'account-survival' : result.profile?.check_mode === 'account-survival' ? 'account-survival' : 'account-status'
    )
    const shouldHideReasonSuffix = displayLabel === '地理位置限制'
    const reasonSuffix = (displayStatus === 'timeout' || displayStatus === 'unknown') && !shouldHideReasonSuffix
      ? `（${this.formatFailureReason(result)}）`
      : ''
    const frozenSince = displayStatus === 'frozen' ? formatFrozenSince(result.profile?.freeze_since_date) : ''
    const frozenSinceSuffix = frozenSince ? `（${frozenSince}）` : ''
    const progressPrefix = `${this.state.completedCount}/${this.state.totalCount}`
    this.appendLog(level, task.accountId, formatAccountResultLogLine({
      phoneLabel,
      progress: progressPrefix,
      displayLabel,
      frozenSinceSuffix,
      reasonSuffix
    }), task.attempt + 1, {
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
      this.appendLog('success', null, '本次检查结果')
      const summaryItems: Array<{ status: AccountCheckResult['status']; count: number }> = [
        { status: 'alive', count: this.state.resultSummary.alive },
        { status: 'limited', count: this.state.resultSummary.limited },
        { status: 'temporary_limited', count: this.state.resultSummary.temporary_limited },
        { status: 'geo_restricted', count: this.state.resultSummary.geo_restricted },
        { status: 'frozen', count: this.state.resultSummary.frozen },
        { status: 'banned', count: this.state.resultSummary.banned },
        { status: 'multi_ip', count: this.state.resultSummary.multi_ip },
        { status: 'timeout', count: this.state.resultSummary.timeout }
      ]

      for (const item of summaryItems) {
        if (item.count <= 0) continue
        const level: CheckLogLevel = item.status === 'alive' ? 'success' : item.status === 'timeout' ? 'error' : 'warning'
        const summaryLabel = readSummaryLabel(item.status, this.currentRunMode)
        this.appendLog(level, null, `${summaryLabel}： ${item.count}`, undefined, { status: item.status })
      }

      this.appendLog('success', null, '任务已完成')
    }
  }

  private bump() {
    this.state.lastUpdatedAt = new Date().toISOString()
    this.emit('state', this.getState())
  }
}
