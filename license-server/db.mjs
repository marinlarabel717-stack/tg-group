import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'license-server', 'data')
const DB_PATH = path.join(DATA_DIR, 'license-db.json')

const EMPTY_DB = {
  counters: {
    licenseId: 0,
    deviceId: 0,
    logId: 0
  },
  licenseKeys: [],
  licenseDevices: [],
  licenseLogs: []
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export class JsonLicenseDatabase {
  constructor(filePath = DB_PATH) {
    this.filePath = filePath
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(EMPTY_DB, null, 2), 'utf8')
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        counters: {
          licenseId: Number(parsed?.counters?.licenseId || 0),
          deviceId: Number(parsed?.counters?.deviceId || 0),
          logId: Number(parsed?.counters?.logId || 0)
        },
        licenseKeys: Array.isArray(parsed?.licenseKeys) ? parsed.licenseKeys : [],
        licenseDevices: Array.isArray(parsed?.licenseDevices) ? parsed.licenseDevices : [],
        licenseLogs: Array.isArray(parsed?.licenseLogs) ? parsed.licenseLogs : []
      }
    } catch {
      return clone(EMPTY_DB)
    }
  }

  write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8')
  }

  transaction(mutator) {
    const data = this.read()
    const result = mutator(data)
    this.write(data)
    return result
  }
}

export function openLicenseDatabase() {
  return new JsonLicenseDatabase(DB_PATH)
}

export { DB_PATH }
