import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { inferCountryDisplay, inferPhoneFromText } from '../../../src/lib/phone-country'
import type { AccountJsonProfile, AccountRecord, AccountStatus, ImportAccountsResult, ImportProgressPayload, ScanCandidate, UpsertAccountInput } from '../types'
import type { AccountRepository } from './account-repository'
import { FileScanner } from './file-scanner'
import { JsonTemplateService } from './json-template-service'

const FILE_IO_CONCURRENCY = Math.min(
  16,
  Math.max(4, (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length || 4) * 2)
)
const IMPORT_PROGRESS_CHUNK = 200
const EXPORT_PROGRESS_CHUNK = 25
const DELETE_PROGRESS_CHUNK = 25
const IMPORT_DB_WRITE_CHUNK = 200

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
  if (spamblock.includes('geo_restricted') || spamblock.includes('anti-spam systems') || spamblock.includes('harsh response') || spamblock.includes('some phone numbers may trigger') || spamblock.includes('地理位置限制')) return 'geo_restricted'
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

async function moveFile(sourcePath: string, targetPath: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })

  try {
    await fs.rename(sourcePath, targetPath)
    return
  } catch {
    await fs.copyFile(sourcePath, targetPath)
    await fs.rm(sourcePath, { force: true })
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

  async importFromPaths(inputPaths: string[], onProgress?: (payload: ImportProgressPayload) => void): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanPaths(inputPaths)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths, { mirrorToManagedDirectory: true, onProgress })
  }

  async importFromFolder(folderPath: string, onProgress?: (payload: ImportProgressPayload) => void): Promise<ImportAccountsResult> {
    const scanResult = await this.scanner.scanFolder(folderPath)
    return this.importScanResult(scanResult.candidates, scanResult.ignoredPaths, { mirrorToManagedDirectory: true, onProgress })
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

  async deleteManagedAccounts(accounts: AccountRecord[], onProgress?: (payload: ImportProgressPayload) => void) {
    let deletedCount = 0
    const total = accounts.length

    const emitProgress = (phase: ImportProgressPayload['phase'], current: number, message: string) => {
      onProgress?.({
        mode: 'delete',
        phase,
        total,
        current,
        importedCount: deletedCount,
        generatedJsonCount: 0,
        skippedCount: Math.max(total - deletedCount, 0),
        message
      })
    }

    emitProgress('start', 0, total > 0 ? `正在删除账号，准备处理 0 / ${total}` : '正在删除账号')

    const deleteAccountFiles = async (account: AccountRecord) => {
      if (account.sessionPath && isInsideDirectory(account.sessionPath, this.managedSessionsDirectory)) {
        await fs.rm(account.sessionPath, { force: true })
      }

      if (account.jsonPath && isInsideDirectory(account.jsonPath, this.managedSessionsDirectory)) {
        await fs.rm(account.jsonPath, { force: true })
      }
    }

    for (let startIndex = 0; startIndex < accounts.length; startIndex += FILE_IO_CONCURRENCY) {
      const batch = accounts.slice(startIndex, startIndex + FILE_IO_CONCURRENCY)
      await Promise.all(batch.map((account) => deleteAccountFiles(account)))
      deletedCount += batch.length

      if (deletedCount === total || deletedCount === batch.length || deletedCount % DELETE_PROGRESS_CHUNK === 0) {
        emitProgress('progress', deletedCount, `正在删除账号 ${deletedCount} / ${total}`)
      }
    }

    emitProgress('completed', total, total > 0 ? `本次成功删除 ${deletedCount} 个账号` : '删除完成')
  }

  async exportManagedAccounts(accounts: AccountRecord[], targetDirectory: string, onProgress?: (payload: ImportProgressPayload) => void) {
    await fs.mkdir(targetDirectory, { recursive: true })

    let exportedCount = 0
    const total = accounts.length

    const emitProgress = (phase: ImportProgressPayload['phase'], current: number, message: string) => {
      onProgress?.({
        mode: 'export',
        phase,
        total,
        current,
        importedCount: exportedCount,
        generatedJsonCount: 0,
        skippedCount: Math.max(total - exportedCount, 0),
        message
      })
    }

    emitProgress('start', 0, total > 0 ? `正在导出账号，准备处理 0 / ${total}` : '正在导出账号')

    const moveAccountFiles = async (account: AccountRecord) => {
      if (account.sessionPath && await pathExists(account.sessionPath)) {
        const sessionTargetPath = path.join(targetDirectory, path.basename(account.sessionPath))
        await moveFile(account.sessionPath, sessionTargetPath)
      }

      if (account.jsonPath && await pathExists(account.jsonPath)) {
        const jsonTargetPath = path.join(targetDirectory, path.basename(account.jsonPath))
        await moveFile(account.jsonPath, jsonTargetPath)
      }
    }

    for (let startIndex = 0; startIndex < accounts.length; startIndex += FILE_IO_CONCURRENCY) {
      const batch = accounts.slice(startIndex, startIndex + FILE_IO_CONCURRENCY)
      await Promise.all(batch.map((account) => moveAccountFiles(account)))
      exportedCount += batch.length

      if (exportedCount === total || exportedCount === batch.length || exportedCount % EXPORT_PROGRESS_CHUNK === 0) {
        emitProgress('progress', exportedCount, `正在导出账号 ${exportedCount} / ${total}`)
      }
    }

    emitProgress('completed', total, `本次成功导出 ${exportedCount} 个账号`)

    return exportedCount
  }

  private async mirrorCandidateToManagedDirectory(candidate: ScanCandidate) {
    await fs.mkdir(this.managedSessionsDirectory, { recursive: true })

    const targetSessionPath = path.join(this.managedSessionsDirectory, `${candidate.baseName}.session`)
    const targetJsonPath = path.join(this.managedSessionsDirectory, `${candidate.baseName}.json`)

    await Promise.all([
      path.resolve(candidate.sessionPath) !== path.resolve(targetSessionPath)
        ? moveFile(candidate.sessionPath, targetSessionPath)
        : Promise.resolve(),
      candidate.jsonPath && path.resolve(candidate.jsonPath) !== path.resolve(targetJsonPath)
        ? moveFile(candidate.jsonPath, targetJsonPath)
        : Promise.resolve()
    ])

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
    options: { mirrorToManagedDirectory: boolean; onProgress?: (payload: ImportProgressPayload) => void }
  ) {
    const warnings = [...ignoredPaths.map((item) => `已忽略非账号文件：${item}`)]
    let generatedJsonCount = 0
    let completedCount = 0
    let importedCount = 0
    let skippedCount = candidates.length

    const emitProgress = (phase: ImportProgressPayload['phase'], current: number, message: string) => {
      options.onProgress?.({
        mode: 'import',
        phase,
        total: candidates.length,
        current,
        importedCount,
        generatedJsonCount,
        skippedCount,
        message
      })
    }

    emitProgress('start', 0, candidates.length > 0 ? `正在导入账号，准备处理 0 / ${candidates.length}` : '正在导入账号')

    const processCandidate = async (sourceCandidate: ScanCandidate) => {
      try {
        const candidate = options.mirrorToManagedDirectory
          ? await this.mirrorCandidateToManagedDirectory(sourceCandidate)
          : sourceCandidate

        const ensured = await this.jsonTemplateService.ensureJsonForSession(candidate.sessionPath, candidate.jsonPath)
        if (ensured.generated) generatedJsonCount += 1

        const profile = await this.jsonTemplateService.readProfile(ensured.jsonPath)
        const username = inferUsername(profile)

        return {
          phone: inferPhone(profile, candidate.sessionPath),
          username,
          userId: inferUserId(profile),
          country: inferCountry(profile, candidate.sessionPath),
          sessionPath: candidate.sessionPath,
          jsonPath: ensured.jsonPath,
          status: inferStatus(profile),
          profile,
          profileSource: 'json_import',
          lastCheckTime: parseDateValue(profile.last_check_time),
          lastOnlineTime: parseDateValue(profile.last_connect_date)
        } satisfies UpsertAccountInput
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误'
        warnings.push(`导入失败：${sourceCandidate.sessionPath} -> ${reason}`)
        return null
      }
    }

    for (let startIndex = 0; startIndex < candidates.length; startIndex += FILE_IO_CONCURRENCY) {
      const batch = candidates.slice(startIndex, startIndex + FILE_IO_CONCURRENCY)
      const batchResults = await Promise.all(batch.map((candidate) => processCandidate(candidate)))
      const persistedInputs: UpsertAccountInput[] = []

      for (const result of batchResults) {
        completedCount += 1
        if (result) {
          persistedInputs.push(result)
          importedCount += 1
        }
        skippedCount = Math.max(candidates.length - importedCount, 0)

        if (
          completedCount === candidates.length ||
          completedCount === 1 ||
          completedCount % IMPORT_PROGRESS_CHUNK === 0
        ) {
          emitProgress('progress', completedCount, `正在导入账号 ${completedCount} / ${candidates.length}`)
        }
      }

      if (persistedInputs.length > 0) {
        for (let writeIndex = 0; writeIndex < persistedInputs.length; writeIndex += IMPORT_DB_WRITE_CHUNK) {
          const writeBatch = persistedInputs.slice(writeIndex, writeIndex + IMPORT_DB_WRITE_CHUNK)
          this.repository.upsertMany(writeBatch, { returnAccounts: false })
        }
      }
    }

    skippedCount = Math.max(candidates.length - importedCount, 0)
    emitProgress('completed', candidates.length, `本次成功导入 ${importedCount} 个账号`)

    return {
      scannedCount: candidates.length,
      importedCount,
      generatedJsonCount,
      skippedCount,
      warnings: warnings.slice(0, 50)
    }
  }
}
