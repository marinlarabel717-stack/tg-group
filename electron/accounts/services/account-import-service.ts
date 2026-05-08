import path from 'node:path'
import type { AccountJsonProfile, ImportAccountsResult, UpsertAccountInput } from '../types'
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

function inferCountry(profile: AccountJsonProfile) {
  return readStringField(profile, 'country', 'countryCode', 'country_name')
}

function inferPhone(profile: AccountJsonProfile, sessionPath: string) {
  const explicitPhone = readStringField(profile, 'phone', 'tel', 'mobile')
  if (explicitPhone) return explicitPhone

  const baseName = path.basename(sessionPath, path.extname(sessionPath))
  return /^\d{5,}$/.test(baseName) ? baseName : ''
}

function inferUsername(profile: AccountJsonProfile) {
  const username = readStringField(profile, 'username', 'user_name', 'handle')
  return username.startsWith('@') || !username ? username : `@${username}`
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
        inputs.push({
          phone: inferPhone(profile, candidate.sessionPath),
          username: inferUsername(profile),
          userId: inferUserId(profile),
          country: inferCountry(profile),
          sessionPath: candidate.sessionPath,
          jsonPath: ensured.jsonPath,
          status: 'timeout_unchecked',
          lastCheckTime: null,
          lastOnlineTime: null
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
