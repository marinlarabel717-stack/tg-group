import { LicenseServerService } from './service.mjs'

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

const cardKey = readArg('key', '')
const limit = Number(readArg('limit', '50'))

const service = new LicenseServerService()
const items = service.listLogs({ cardKey, limit })
console.log(JSON.stringify(items, null, 2))
