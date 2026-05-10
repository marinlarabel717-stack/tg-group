import { LicenseServerService } from './service.mjs'

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

const cardKey = readArg('key')
const note = readArg('note', '')

if (!cardKey) {
  console.error('缺少 --key，例如: npm run license:reset-devices -- --key TEST-2026-0001')
  process.exit(1)
}

const service = new LicenseServerService()
const result = service.resetDevices({ cardKey, note })
console.log(JSON.stringify(result, null, 2))
