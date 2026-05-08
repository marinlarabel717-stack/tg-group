import fs from 'node:fs/promises'
import path from 'node:path'
import { inferCountryDisplay, inferPhoneFromText } from '../../../src/lib/phone-country'
import type { AccountJsonProfile, AccountRecord, AccountStatus, ImportAccountsResult, ScanCandidate, UpsertAccountInput } from '../types'
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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function isInsideDirectory(filePath: string, directoryPath: string) {
  const relativePath = path.relative(directoryPath, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

export class AccountImportService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly scanner: FileScanner,
    private readonly jsonTemplateService: JsonTemplateService,
    private readonly managedSessionsDirectory: string
  ) {}

  async importFromPaths(inputPaths: string[]): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanPaths(inputPaths)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths, { mirrorToManagedDirectory: true })
  }

  async importFromFolder(folderPath: string): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanFolder(folderPath)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths, { mirrorToManagedDirectory: true })
  }

  async scanFolder(folderPath: string) {
    return this.scanner.scanFolder(folderPath)
  }

  async syncManagedSessions() {
    await fs.mkdir(this.managedSessionsDirectory, { recursive: true })

    const scanResult = await this.scanner.scanFolder(this.managedSessionsDirectory)
    await this.importScanResult(scanResult.candidates, scanResult.ignoredPaths, { mirrorToManagedDirectory: false })

    const managedAccounts = this.repository.list().filter((account) => isInsideDirectory(account.sessionPath, this.managedSessionsDirectory))
    const missingIds: number[] = []

    for (const account of managedAccounts) {
      if (!(await pathExists(account.sessionPath))) {
        missingIds.push(account.id)
      }
    }

    if (missingIds.length > 0) {
      this.repository.deleteByIds(missingIds)
    }
  }

  async deleteManagedAccounts(accounts: AccountRecord[]) {
    for (const account of accounts) {
      if (account.sessionPath && isInsideDirectory(account.sessionPath, this.managedSessionsDirectory)) {
        await fs.rm(account.sessionPath, { force: true })
      }

      if (account.jsonPath && isInsideDirectory(account.jsonPath, this.managedSessionsDirectory)) {
        await fs.rm(account.jsonPath, { force: true })
      }
    }
  }

  private async mirrorCandidateToManagedDirectory(candidate: ScanCandidate) {
    await fs.mkdir(this.managedSessionsDirectory, { recursive: true })

    const targetSessionPath = path.join(this.managedSessionsDirectory, `${candidate.baseName}.session`)
    const targetJsonPath = path.join(this.managedSessionsDirectory, `${candidate.baseName}.json`)

    if (path.resolve(candidate.sessionPath) !== path.resolve(targetSessionPath)) {
      await fs.copyFile(candidate.sessionPath, targetSessionPath)
    }

    if (candidate.jsonPath) {
      if (path.resolve(candidate.jsonPath) !== path.resolve(targetJsonPath)) {
        await fs.copyFile(candidate.jsonPath, targetJsonPath)
      }
    }

    return {
      ...candidate,
      directory: this.managedSessionsDirectory,
      sessionPath: targetSessionPath,
      jsonPath: (await pathExists(targetJsonPath)) ? targetJsonPath : null
    } satisfies ScanCandidate
  }

  private async importScanResult(
    candidates: Awaited<ReturnType<FileScanner['scanPaths']>>['candidates'],
    ignoredPaths: string[],
    options: { mirrorToManagedDirectory: boolean }
  ) {
    const warnings = [...ignoredPaths.map((item) => `已忽略非账号文件：${item}`)]
    const inputs: UpsertAccountInput[] = []
    let generatedJsonCount = 0

    for (const sourceCandidate of candidates) {
      try {
        const candidate = options.mirrorToManagedDirectory
          ? await this.mirrorCandidateToManagedDirectory(sourceCandidate)
          : sourceCandidate

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
        warnings.push(`导入失败：${sourceCandidate.sessionPath} -> ${reason}`)
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
