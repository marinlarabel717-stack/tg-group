import path from 'node:path'
import { inferCountryDisplay, inferPhoneFromText } from '../../../src/lib/phone-country'
import type { AccountJsonProfile, AccountStatus, ImportAccountsResult, UpsertAccountInput } from '../types'
import type { AccountRepository } from './account-repository'
import { FileScanner } from './file-scanner'
import { JsonTemplateService } from './json-template-service'

function readStringField(profile: AccountJsonProfile, ...keys: string[]) {
  for (const key of keys) {
    const value = profile[key]
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number') return String(value)
  }

  return ''
}

function inferCountry(profile: AccountJsonProfile, sessionPath: string) {
  const phone = inferPhone(profile, sessionPath)
  return inferCountryDisplay(phone, readStringField(profile, 'country', 'countryCode', 'country_name'))
}

function parseDateValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    const timestamp = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    if (/^\d+$/.test(trimmed)) {
      return parseDateValue(Number(trimmed))
    }

    const normalized = trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

function inferStatus(profile: AccountJsonProfile): AccountStatus {
  const spamblock = readStringField(profile, 'spamblock').toLowerCase()

  if (!spamblock || spamblock === 'unknown') return 'unknown'
  if (spamblock === 'free') return 'alive'
  if (spamblock.includes('temporary')) return 'temporary_limited'
  if (spamblock.includes('limited') || spamblock.includes('restrict')) return 'limited'
  if (spamblock.includes('ban')) return 'banned'
  if (spamblock.includes('multi') && spamblock.includes('ip')) return 'multi_ip'
  if (spamblock.includes('timeout')) return 'timeout'
  if (spamblock.includes('session')) return 'session_expired'
  if (spamblock.includes('login')) return 'not_logged_in'

  return 'unknown'
}

function inferPhone(profile: AccountJsonProfile, sessionPath: string) {
  const explicitPhone = inferPhoneFromText(readStringField(profile, 'phone', 'tel', 'mobile'))
  if (explicitPhone) return explicitPhone

  const baseName = path.basename(sessionPath, path.extname(sessionPath))
  return inferPhoneFromText(baseName)
}

function inferUsername(profile: AccountJsonProfile) {
  const username = readStringField(profile, 'username', 'user_name', 'handle')
  return username.startsWith('@') || !username ? username : `@${username}`
}

function inferDisplayName(profile: AccountJsonProfile) {
  const firstName = readStringField(profile, 'first_name', 'firstName')
  const lastName = readStringField(profile, 'last_name', 'lastName')
  return [firstName, lastName].filter(Boolean).join(' ').trim()
}

function inferUserId(profile: AccountJsonProfile) {
  return readStringField(profile, 'userId', 'user_id', 'uid', 'id')
}

export class AccountImportService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly scanner: FileScanner,
    private readonly jsonTemplateService: JsonTemplateService
  ) {}

  async importFromPaths(inputPaths: string[]): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanPaths(inputPaths)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths)
  }

  async importFromFolder(folderPath: string): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanFolder(folderPath)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths)
  }

  async scanFolder(folderPath: string) {
    return this.scanner.scanFolder(folderPath)
  }

  private async importScanResult(candidates: Awaited<ReturnType<FileScanner['scanPaths']>>['candidates'], ignoredPaths: string[]) {
    const warnings = [...ignoredPaths.map((item) => `已忽略非账号文件：${item}`)]
    const inputs: UpsertAccountInput[] = []
    let generatedJsonCount = 0

    for (const candidate of candidates) {
      try {
        const ensured = await this.jsonTemplateService.ensureJsonForSession(candidate.sessionPath, candidate.jsonPath)
        if (ensured.generated) generatedJsonCount += 1

        const profile = await this.jsonTemplateService.readProfile(ensured.jsonPath)
        const username = inferUsername(profile)
        const displayName = inferDisplayName(profile)

        inputs.push({
          phone: inferPhone(profile, candidate.sessionPath),
          username: username || displayName,
          userId: inferUserId(profile),
          country: inferCountry(profile, candidate.sessionPath),
          sessionPath: candidate.sessionPath,
          jsonPath: ensured.jsonPath,
          status: inferStatus(profile),
          profile,
          profileSource: 'json_import',
          lastCheckTime: parseDateValue(profile.last_check_time),
          lastOnlineTime: parseDateValue(profile.last_connect_date)
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误'
        warnings.push(`导入失败：${candidate.sessionPath} -> ${reason}`)
      }
    }

    const accounts = inputs.length > 0 ? this.repository.upsertMany(inputs) : this.repository.list()

    return {
      scannedCount: candidates.length,
      importedCount: inputs.length,
      generatedJsonCount,
      skippedCount: Math.max(candidates.length - inputs.length, 0),
      warnings,
      accounts
    }
  }
}
