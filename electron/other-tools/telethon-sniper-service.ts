import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountCheckProxy } from '../proxy-pool/service'
import type { BatchCreatePostType } from '../../src/types'

const execFileAsync = promisify(execFile)

interface ExecFileFailure extends Error {
  stdout?: string | Buffer
  stderr?: string | Buffer
  code?: string | number | null
  signal?: string | null
  errno?: string | number | null
  killed?: boolean
}

interface TelethonSniperRawResult<T = Record<string, unknown>> {
  ok?: boolean
  reason?: string | null
  result?: T | null
}

export interface TelethonSniperScanItem {
  raw: string
  normalized: string
  kind: 'username' | 'link'
  category: 'valid' | 'occupiable' | 'forbidden'
  reason: string
  entityType: 'user' | 'bot' | 'group' | 'channel' | 'unknown'
  sourceRef: string
  sourceTitle: string
  sourceExcerpt: string
  sourceMessageId: string
  sourceDate: string
}

export interface TelethonSniperScanResult {
  expandedSourceCount: number
  chatlistJoinCount: number
  checkedMessageCount: number
  candidateCount: number
  newSeenMessageKeys: string[]
  items: TelethonSniperScanItem[]
}

interface TelethonSniperScanPayload {
  sessionPath: string
  sourceRefs: string[]
  sourceMessageLimit: number
  includeKeywords: string[]
  excludeKeywords: string[]
  seenMessageKeys: string[]
  handledCandidateKeys: string[]
  joinChatlists?: boolean
  timeoutSeconds?: number
  proxy?: AccountCheckProxy | null
}

export interface TelethonSniperClaimResult {
  claimTargetTitle: string
  claimTargetRef: string
  claimMessage: string
  postSent?: boolean
  postFailureMessage?: string
}

interface TelethonSniperClaimWithPoolPayload {
  sessionPath: string
  carrierRef: string
  normalizedCandidate: string
  timeoutSeconds?: number
  proxy?: AccountCheckProxy | null
}

interface TelethonSniperCreateCarrierPayload {
  sessionPath: string
  normalizedCandidate: string
  accountId: number
  createdIndex: number
  createCarrierTitleTemplate: string
  createCarrierAboutTemplate: string
  postType: BatchCreatePostType
  postText: string
  postImageData: string
  timeoutSeconds?: number
  proxy?: AccountCheckProxy | null
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('other-tools', 'telethon_sniper.py')
}

function readExecText(value: string | Buffer | null | undefined) {
  if (typeof value === 'string') return value.trim()
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim()
  return ''
}

async function writePayloadFile(payload: object) {
  const filePath = path.join(os.tmpdir(), `tg-matrix-sniper-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`)
  await fs.promises.writeFile(filePath, JSON.stringify(payload), 'utf8')
  return filePath
}

function parseTelethonRawResult<T>(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text) as TelethonSniperRawResult<T>
  } catch {
    return null
  }
}

function extractUsefulPythonErrorText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Traceback \(most recent call last\):$/i.test(line))
    .filter((line) => !/^File ".*", line \d+, in .*/i.test(line))

  if (lines.length === 0) return ''

  const lastRuntimeLine = [...lines].reverse().find((line) => /(?:Error|Exception):/i.test(line))
  return (lastRuntimeLine || lines[lines.length - 1]).trim()
}

function formatTelethonProcessFailure(action: 'scan_sources' | 'claim_with_pool' | 'create_carrier_and_claim', error: unknown) {
  const failure = error as ExecFileFailure
  const stdoutText = readExecText(failure?.stdout)
  const stderrText = readExecText(failure?.stderr)
  const errorMessage = typeof failure?.message === 'string' ? failure.message.trim() : ''
  const parsedFromStdout = parseTelethonRawResult(stdoutText)
  const parsedReason = typeof parsedFromStdout?.reason === 'string' ? parsedFromStdout.reason.trim() : ''
  if (parsedReason) return parsedReason

  const detail = extractUsefulPythonErrorText(stderrText) || extractUsefulPythonErrorText(stdoutText) || extractUsefulPythonErrorText(errorMessage)
  const actionLabel = action === 'create_carrier_and_claim'
    ? '自动建频道并抢注'
    : action === 'claim_with_pool'
      ? '池子改绑抢注'
      : '监听扫描'

  if (/ModuleNotFoundError/i.test(detail)) return `${actionLabel}脚本缺少运行依赖，没成功跑起来。`
  if (/SyntaxError/i.test(detail)) return `${actionLabel}脚本启动失败，代码里有语法问题。`
  if (/No such file|can'?t open file/i.test(detail)) return `${actionLabel}脚本文件没找到，当前环境不完整。`
  if (/timed out|TimeoutError/i.test(detail) || failure?.signal === 'SIGTERM') return `${actionLabel}脚本执行超时了。`
  if (/proxy/i.test(detail) && /(failed|error|refused|unreachable|closed)/i.test(detail)) return `${actionLabel}时代理连接失败了。`
  if (/ENAMETOOLONG/i.test(errorMessage) || failure?.code === 'ENAMETOOLONG' || failure?.errno === 'ENAMETOOLONG') return `${actionLabel}脚本没启动起来：传给脚本的参数太长了。`
  if (/spawn .*ENOENT|ENOENT/i.test(errorMessage) || failure?.code === 'ENOENT' || failure?.errno === 'ENOENT') return `${actionLabel}脚本没启动起来：系统找不到 Python 或脚本文件。`
  if (/EACCES|EPERM/i.test(errorMessage) || failure?.code === 'EACCES' || failure?.code === 'EPERM' || failure?.errno === 'EACCES' || failure?.errno === 'EPERM') return `${actionLabel}脚本没法启动：权限不够或被系统拦住了。`
  if (detail) return `${actionLabel}脚本执行失败：${detail}`
  if (failure?.signal) return `${actionLabel}脚本执行失败：进程被系统中断了（${failure.signal}）。`
  if (failure?.code !== null && failure?.code !== undefined && failure.code !== '') return `${actionLabel}脚本执行失败：进程异常退出（退出码 ${String(failure.code)}）。`
  if (failure?.killed) return `${actionLabel}脚本执行失败：进程被提前终止了。`
  return `${actionLabel}脚本执行失败，没拿到错误正文，但可以确定这次是脚本进程自己异常退出了。`
}

export class TelethonSniperService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async scanSources(payload: TelethonSniperScanPayload) {
    return await this.runAction<TelethonSniperScanResult>('scan_sources', payload, Math.max(20, payload.timeoutSeconds ?? 35))
  }

  async claimWithPool(payload: TelethonSniperClaimWithPoolPayload) {
    return await this.runAction<TelethonSniperClaimResult>('claim_with_pool', payload, Math.max(20, payload.timeoutSeconds ?? 30))
  }

  async createCarrierAndClaim(payload: TelethonSniperCreateCarrierPayload) {
    return await this.runAction<TelethonSniperClaimResult>('create_carrier_and_claim', payload, Math.max(20, payload.timeoutSeconds ?? 40))
  }

  private async runAction<T>(action: 'scan_sources' | 'claim_with_pool' | 'create_carrier_and_claim', payload: object, timeoutSeconds: number): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error('TELETHON_SNIPER_SERVICE_UNAVAILABLE')
    }

    let stdout = ''
    const payloadFile = await writePayloadFile({ action, ...payload, timeoutSeconds })
    try {
      const result = await execFileAsync(this.pythonExecutable, [
        this.scriptPath,
        `@${payloadFile}`
      ], {
        cwd: process.cwd(),
        windowsHide: true,
        timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
        encoding: 'utf8',
        env: buildTelethonPythonEnv()
      })
      stdout = result.stdout
    } catch (error) {
      throw new Error(formatTelethonProcessFailure(action, error))
    } finally {
      await fs.promises.unlink(payloadFile).catch(() => undefined)
    }

    const raw = parseTelethonRawResult<T>(stdout)
    if (!raw) {
      throw new Error(formatTelethonProcessFailure(action, { stdout } as ExecFileFailure))
    }
    if (!raw.ok) {
      throw new Error((typeof raw.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 抢注主链路执行失败')
    }

    return (raw.result ?? {}) as T
  }
}
