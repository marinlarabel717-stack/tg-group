import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountCheckProxy } from '../proxy-pool/service'
import type { BatchCreatePostType } from '../../src/types'

const execFileAsync = promisify(execFile)

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

    const { stdout } = await execFileAsync(this.pythonExecutable, [
      this.scriptPath,
      JSON.stringify({ action, ...payload, timeoutSeconds })
    ], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
      encoding: 'utf8',
      env: buildTelethonPythonEnv()
    })

    const raw = JSON.parse(stdout.trim()) as TelethonSniperRawResult<T>
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 抢注主链路执行失败')
    }

    return (raw.result ?? {}) as T
  }
}
