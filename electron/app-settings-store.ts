import fs from 'node:fs'
import path from 'node:path'

export interface AppSettings {
  checkConcurrency: number
  licenseApiBaseUrl: string
  licenseOfflineGraceDays: number
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  checkConcurrency: 3,
  licenseApiBaseUrl: process.env.LICENSE_API_BASE_URL?.trim() || '',
  licenseOfflineGraceDays: 3
}

function normalizeConcurrency(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_APP_SETTINGS.checkConcurrency
  return Math.min(20, Math.max(1, Math.trunc(parsed)))
}

function normalizeApiBaseUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : DEFAULT_APP_SETTINGS.licenseApiBaseUrl
}

function normalizeOfflineGraceDays(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_APP_SETTINGS.licenseOfflineGraceDays
  return Math.min(30, Math.max(0, Math.trunc(parsed)))
}

export class AppSettingsStore {
  constructor(private readonly filePath: string) {}

  get() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { ...DEFAULT_APP_SETTINGS }
      }

      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        checkConcurrency: normalizeConcurrency(parsed.checkConcurrency),
        licenseApiBaseUrl: normalizeApiBaseUrl(parsed.licenseApiBaseUrl),
        licenseOfflineGraceDays: normalizeOfflineGraceDays(parsed.licenseOfflineGraceDays)
      }
    } catch {
      return { ...DEFAULT_APP_SETTINGS }
    }
  }

  update(patch: Partial<AppSettings>) {
    const next = {
      ...this.get(),
      ...(patch.checkConcurrency === undefined
        ? null
        : { checkConcurrency: normalizeConcurrency(patch.checkConcurrency) }),
      ...(patch.licenseApiBaseUrl === undefined
        ? null
        : { licenseApiBaseUrl: normalizeApiBaseUrl(patch.licenseApiBaseUrl) }),
      ...(patch.licenseOfflineGraceDays === undefined
        ? null
        : { licenseOfflineGraceDays: normalizeOfflineGraceDays(patch.licenseOfflineGraceDays) })
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }
}
