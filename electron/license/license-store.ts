import fs from 'node:fs'
import path from 'node:path'
import type { StoredLicenseRecord } from './types'

export class LicenseStore {
  constructor(private readonly filePath: string) {}

  get() {
    try {
      if (!fs.existsSync(this.filePath)) return null
      const raw = fs.readFileSync(this.filePath, 'utf8')
      return JSON.parse(raw) as StoredLicenseRecord
    } catch {
      return null
    }
  }

  set(record: StoredLicenseRecord) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(record, null, 2), 'utf8')
    return record
  }

  clear() {
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
    } catch {
      // ignore clear failures
    }
  }
}

