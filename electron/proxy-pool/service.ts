import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import net from 'node:net'
import tls from 'node:tls'
import path from 'node:path'
import type { ProxyCheckLogEntry, ProxyCheckState, ProxyIpVersion, ProxyPoolSettings, ProxyPoolState, ProxyRecord, ProxyType } from '../../src/types'

const CHECK_TARGET_HOST = 'api.telegram.org'
const CHECK_TARGET_PORT = 443
const CHECK_TIMEOUT_MS = 8000
const CHECK_CONCURRENCY = 10

interface ParsedProxyLine {
  id: string
  value: string
  type: ProxyType
  ipVersion: ProxyIpVersion
  host: string
  port: number
  username: string | null
  password: string | null
}

interface ProxyCheckResult {
  ok: boolean
  latencyMs: number | null
  errorMessage: string | null
}

interface PersistedProxyPoolData {
  settings?: Partial<ProxyPoolSettings>
  proxies?: ProxyRecord[]
}

function createDefaultSettings(): ProxyPoolSettings {
  return {
    defaultType: 'http',
    ipVersion: 'ipv4',
    randomize: true
  }
}

function createEmptyCheckState(): ProxyCheckState {
  return {
    running: false,
    totalCount: 0,
    checkedCount: 0,
    aliveCount: 0,
    deadCount: 0,
    removedCount: 0,
    logs: [],
    lastUpdatedAt: null
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeSettings(value?: Partial<ProxyPoolSettings>): ProxyPoolSettings {
  return {
    defaultType: value?.defaultType === 'https' || value?.defaultType === 'socks5' ? value.defaultType : 'http',
    ipVersion: value?.ipVersion === 'ipv6' ? 'ipv6' : 'ipv4',
    randomize: value?.randomize ?? true
  }
}

function normalizeProxyRecord(record: ProxyRecord): ProxyRecord {
  return {
    ...record,
    type: record.type === 'https' || record.type === 'socks5' ? record.type : 'http',
    ipVersion: record.ipVersion === 'ipv6' ? 'ipv6' : 'ipv4',
    status: record.status === 'checking' || record.status === 'alive' || record.status === 'dead' ? record.status : 'idle',
    username: record.username ?? null,
    password: record.password ?? null,
    latencyMs: typeof record.latencyMs === 'number' && Number.isFinite(record.latencyMs) ? record.latencyMs : null,
    lastCheckedAt: typeof record.lastCheckedAt === 'string' ? record.lastCheckedAt : null,
    errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : null
  }
}

function buildProxyId(normalizedValue: string) {
  return createHash('sha1').update(normalizedValue).digest('hex')
}

function parseProxyLine(line: string, settings: ProxyPoolSettings): ParsedProxyLine | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null

  let type: ProxyType = settings.defaultType
  let raw = trimmed
  const schemeMatch = raw.match(/^([a-zA-Z0-9+.-]+):\/\//)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme === 'http' || scheme === 'https' || scheme === 'socks5') {
      type = scheme
      raw = raw.slice(schemeMatch[0].length)
    }
  }

  let host = ''
  let port = 0
  let username: string | null = null
  let password: string | null = null

  if (raw.includes('@')) {
    const [authPart, endpointPart] = raw.split('@')
    const authIndex = authPart.indexOf(':')
    username = authIndex >= 0 ? authPart.slice(0, authIndex) : authPart
    password = authIndex >= 0 ? authPart.slice(authIndex + 1) : ''

    const endpointMatch = endpointPart.match(/^\[([^\]]+)\]:(\d+)$/) ?? endpointPart.match(/^([^:]+):(\d+)$/)
    if (!endpointMatch) return null
    host = endpointMatch[1]
    port = Number(endpointMatch[2])
  } else {
    const ipv6Match = raw.match(/^\[([^\]]+)\]:(\d+)(?::([^:]*):?(.*))?$/)
    if (ipv6Match) {
      host = ipv6Match[1]
      port = Number(ipv6Match[2])
      username = ipv6Match[3] ? ipv6Match[3] : null
      password = ipv6Match[4] ? ipv6Match[4] : null
    } else {
      const parts = raw.split(':')
      if (parts.length < 2) return null
      if (parts.length === 2) {
        host = parts[0]
        port = Number(parts[1])
      } else {
        host = parts[0]
        port = Number(parts[1])
        username = parts[2] || null
        password = parts.slice(3).join(':') || null
      }
    }
  }

  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null

  const authPart = username ? `${username}${password ? `:${password}` : ''}@` : ''
  const hostDisplay = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  const normalizedValue = `${type}://${authPart}${hostDisplay}:${port}`

  return {
    id: buildProxyId(normalizedValue),
    value: trimmed,
    type,
    ipVersion: settings.ipVersion,
    host,
    port,
    username,
    password
  }
}

function serializeAuth(username: string | null, password: string | null) {
  if (!username) return null
  return Buffer.from(`${username}:${password ?? ''}`, 'utf8').toString('base64')
}

function readHttpStatusCode(buffer: string) {
  const firstLine = buffer.split(/\r?\n/, 1)[0] || ''
  const match = firstLine.match(/\s(\d{3})\s/)
  return match ? Number(match[1]) : null
}

function checkHttpLikeProxy(proxy: ParsedProxyLine) {
  return new Promise<ProxyCheckResult>((resolve) => {
    const startedAt = Date.now()
    const socket = proxy.type === 'https'
      ? tls.connect({ host: proxy.host, port: proxy.port, servername: proxy.host, rejectUnauthorized: false })
      : net.connect({ host: proxy.host, port: proxy.port })

    let settled = false
    let responseBuffer = ''

    const finish = (result: ProxyCheckResult) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(CHECK_TIMEOUT_MS)

    socket.on('timeout', () => finish({ ok: false, latencyMs: null, errorMessage: '连接超时' }))
    socket.on('error', (error) => finish({ ok: false, latencyMs: null, errorMessage: error.message || '连接失败' }))

    socket.on(proxy.type === 'https' ? 'secureConnect' : 'connect', () => {
      const authHeader = serializeAuth(proxy.username, proxy.password)
      const requestLines = [
        `CONNECT ${CHECK_TARGET_HOST}:${CHECK_TARGET_PORT} HTTP/1.1`,
        `Host: ${CHECK_TARGET_HOST}:${CHECK_TARGET_PORT}`,
        'Proxy-Connection: Keep-Alive'
      ]
      if (authHeader) {
        requestLines.push(`Proxy-Authorization: Basic ${authHeader}`)
      }
      requestLines.push('', '')
      socket.write(requestLines.join('\r\n'))
    })

    socket.on('data', (chunk) => {
      responseBuffer += chunk.toString('utf8')
      if (!responseBuffer.includes('\r\n\r\n')) return
      const statusCode = readHttpStatusCode(responseBuffer)
      if (statusCode === 200) {
        finish({ ok: true, latencyMs: Date.now() - startedAt, errorMessage: null })
        return
      }
      finish({ ok: false, latencyMs: null, errorMessage: statusCode ? `HTTP ${statusCode}` : '代理响应异常' })
    })
  })
}

function checkSocks5Proxy(proxy: ParsedProxyLine) {
  return new Promise<ProxyCheckResult>((resolve) => {
    const startedAt = Date.now()
    const socket = net.connect({ host: proxy.host, port: proxy.port })
    let settled = false
    let stage: 'hello' | 'auth' | 'connect' = 'hello'

    const finish = (result: ProxyCheckResult) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(CHECK_TIMEOUT_MS)

    socket.on('timeout', () => finish({ ok: false, latencyMs: null, errorMessage: '连接超时' }))
    socket.on('error', (error) => finish({ ok: false, latencyMs: null, errorMessage: error.message || '连接失败' }))

    socket.on('connect', () => {
      if (proxy.username) {
        socket.write(Buffer.from([0x05, 0x01, 0x02]))
        return
      }
      socket.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    socket.on('data', (chunk) => {
      if (stage === 'hello') {
        if (chunk.length < 2 || chunk[0] !== 0x05) {
          finish({ ok: false, latencyMs: null, errorMessage: 'SOCKS5 握手失败' })
          return
        }

        const method = chunk[1]
        if (method === 0xff) {
          finish({ ok: false, latencyMs: null, errorMessage: 'SOCKS5 不支持认证方式' })
          return
        }

        if (method === 0x02) {
          stage = 'auth'
          const usernameBuffer = Buffer.from(proxy.username ?? '', 'utf8')
          const passwordBuffer = Buffer.from(proxy.password ?? '', 'utf8')
          socket.write(Buffer.concat([
            Buffer.from([0x01, usernameBuffer.length]),
            usernameBuffer,
            Buffer.from([passwordBuffer.length]),
            passwordBuffer
          ]))
          return
        }

        stage = 'connect'
        const hostBuffer = Buffer.from(CHECK_TARGET_HOST, 'utf8')
        const portBuffer = Buffer.from([(CHECK_TARGET_PORT >> 8) & 0xff, CHECK_TARGET_PORT & 0xff])
        socket.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
          hostBuffer,
          portBuffer
        ]))
        return
      }

      if (stage === 'auth') {
        if (chunk.length < 2 || chunk[1] !== 0x00) {
          finish({ ok: false, latencyMs: null, errorMessage: 'SOCKS5 账号密码认证失败' })
          return
        }

        stage = 'connect'
        const hostBuffer = Buffer.from(CHECK_TARGET_HOST, 'utf8')
        const portBuffer = Buffer.from([(CHECK_TARGET_PORT >> 8) & 0xff, CHECK_TARGET_PORT & 0xff])
        socket.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
          hostBuffer,
          portBuffer
        ]))
        return
      }

      if (chunk.length < 2 || chunk[0] !== 0x05) {
        finish({ ok: false, latencyMs: null, errorMessage: 'SOCKS5 连接响应异常' })
        return
      }

      if (chunk[1] === 0x00) {
        finish({ ok: true, latencyMs: Date.now() - startedAt, errorMessage: null })
        return
      }

      finish({ ok: false, latencyMs: null, errorMessage: `SOCKS5 错误码 ${chunk[1]}` })
    })
  })
}

async function runProxyCheck(proxy: ParsedProxyLine) {
  if (proxy.type === 'socks5') {
    return checkSocks5Proxy(proxy)
  }
  return checkHttpLikeProxy(proxy)
}

function shuffleArray<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = current
  }
  return next
}

export class ProxyPoolService extends EventEmitter {
  private state: ProxyPoolState = {
    proxies: [],
    settings: createDefaultSettings(),
    checkState: createEmptyCheckState()
  }

  constructor(private readonly storagePath: string) {
    super()
  }

  async init() {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true })
    try {
      const raw = await fs.readFile(this.storagePath, 'utf8')
      const parsed = JSON.parse(raw) as PersistedProxyPoolData
      this.state.settings = normalizeSettings(parsed.settings)
      this.state.proxies = Array.isArray(parsed.proxies) ? parsed.proxies.map(normalizeProxyRecord) : []
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.toLowerCase().includes('enoent')) {
        console.error('加载代理池失败：', message)
      }
      await this.persist()
    }
  }

  getState() {
    return cloneState(this.state)
  }

  async replaceProxyList(text: string) {
    const lines = text.split(/\r?\n/)
    const unique = new Map<string, ProxyRecord>()
    const now = new Date().toISOString()

    for (const line of lines) {
      const parsed = parseProxyLine(line, this.state.settings)
      if (!parsed) continue
      unique.set(parsed.id, {
        id: parsed.id,
        value: parsed.value,
        type: parsed.type,
        ipVersion: parsed.ipVersion,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        status: 'idle',
        latencyMs: null,
        lastCheckedAt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now
      })
    }

    this.state.proxies = Array.from(unique.values())
    await this.persist()
    this.emitState()
    return this.getState()
  }

  async updateSettings(patch: Partial<ProxyPoolSettings>) {
    this.state.settings = normalizeSettings({ ...this.state.settings, ...patch })
    await this.persist()
    this.emitState()
    return this.getState()
  }

  async clearLogs() {
    this.state.checkState = createEmptyCheckState()
    this.emitState()
    return this.getState()
  }

  async startCheck() {
    if (this.state.checkState.running) return this.getState()

    this.state.checkState = {
      ...createEmptyCheckState(),
      running: true,
      totalCount: this.state.proxies.length,
      lastUpdatedAt: new Date().toISOString()
    }

    this.appendLog('info', `开始检查代理，共 ${this.state.proxies.length} 条。`)
    this.state.proxies = this.state.proxies.map((proxy) => ({
      ...proxy,
      status: 'checking',
      latencyMs: null,
      errorMessage: null,
      updatedAt: new Date().toISOString()
    }))
    this.emitState()

    void this.runCheck()
    return this.getState()
  }

  private async runCheck() {
    const queue = this.state.settings.randomize ? shuffleArray(this.state.proxies) : [...this.state.proxies]
    const deadIds = new Set<string>()
    let cursor = 0

    const worker = async () => {
      while (cursor < queue.length) {
        const currentIndex = cursor
        cursor += 1
        const proxy = queue[currentIndex]
        await this.checkOneProxy(proxy, deadIds)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, Math.max(queue.length, 1)) }, () => worker()))

    if (deadIds.size > 0) {
      this.state.proxies = this.state.proxies.filter((proxy) => !deadIds.has(proxy.id))
      this.appendLog('warning', `已自动删除 ${deadIds.size} 条不可用代理。`)
    }

    this.state.checkState = {
      ...this.state.checkState,
      running: false,
      removedCount: deadIds.size,
      lastUpdatedAt: new Date().toISOString()
    }
    this.appendLog(
      'success',
      `代理检查完成：可用 ${this.state.checkState.aliveCount} 条，不可用 ${this.state.checkState.deadCount} 条。`
    )

    await this.persist()
    this.emitState()
  }

  private async checkOneProxy(proxy: ProxyRecord, deadIds: Set<string>) {
    const parsed = parseProxyLine(proxy.value, this.state.settings)
    if (!parsed) {
      deadIds.add(proxy.id)
      this.applyCheckResult(proxy.id, {
        ok: false,
        latencyMs: null,
        errorMessage: '代理格式无效'
      })
      return
    }

    const result = await runProxyCheck(parsed)
    if (!result.ok) {
      deadIds.add(proxy.id)
    }
    this.applyCheckResult(proxy.id, result)
  }

  private applyCheckResult(proxyId: string, result: ProxyCheckResult) {
    const now = new Date().toISOString()
    this.state.proxies = this.state.proxies.map((proxy) => {
      if (proxy.id !== proxyId) return proxy
      return {
        ...proxy,
        status: result.ok ? 'alive' : 'dead',
        latencyMs: result.latencyMs,
        lastCheckedAt: now,
        errorMessage: result.errorMessage,
        updatedAt: now
      }
    })

    this.state.checkState.checkedCount += 1
    if (result.ok) {
      this.state.checkState.aliveCount += 1
      this.appendLog('success', `代理可用：${this.findProxyValue(proxyId)}${result.latencyMs ? `（${result.latencyMs}ms）` : ''}`, proxyId)
    } else {
      this.state.checkState.deadCount += 1
      this.appendLog('error', `代理不可用：${this.findProxyValue(proxyId)}${result.errorMessage ? `（${result.errorMessage}）` : ''}`, proxyId)
    }

    this.state.checkState.lastUpdatedAt = now
    this.emitState()
  }

  private findProxyValue(proxyId: string) {
    return this.state.proxies.find((item) => item.id === proxyId)?.value ?? proxyId
  }

  private appendLog(level: ProxyCheckLogEntry['level'], message: string, proxyId: string | null = null) {
    const entry: ProxyCheckLogEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      level,
      message,
      createdAt: new Date().toISOString(),
      proxyId
    }
    this.state.checkState.logs = [...this.state.checkState.logs.slice(-399), entry]
  }

  private emitState() {
    this.emit('state', this.getState())
  }

  private async persist() {
    const payload: PersistedProxyPoolData = {
      settings: this.state.settings,
      proxies: this.state.proxies
    }
    await fs.writeFile(this.storagePath, JSON.stringify(payload, null, 2), 'utf8')
  }
}
