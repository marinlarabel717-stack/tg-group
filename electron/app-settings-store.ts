import fs from 'node:fs'
import path from 'node:path'

export interface AppSettings {
  checkConcurrency: number
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  checkConcurrency: 3
}

function normalizeConcurrency(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_APP_SETTINGS.checkConcurrency
  return Math.min(20, Math.max(1, Math.trunc(parsed)))
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
        checkConcurrency: normalizeConcurrency(parsed.checkConcurrency)
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
        : { checkConcurrency: normalizeConcurrency(patch.checkConcurrency) })
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }
}
