import { LicenseServerService } from './service.mjs'

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

const cardKey = readArg('key')
const days = Number(readArg('days', '30'))
const note = readArg('note', '')

if (!cardKey) {
  console.error('缺少 --key，例如: npm run license:extend-card -- --key TEST-2026-0001 --days 30')
  process.exit(1)
}

const service = new LicenseServerService()
const card = service.extendCard({ cardKey, days, note })
console.log(JSON.stringify(card, null, 2))
