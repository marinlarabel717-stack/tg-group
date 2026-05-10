import { createHash, randomBytes } from 'node:crypto'

export function nowIso() {
  return new Date().toISOString()
}

export function addDaysIso(days, from = Date.now()) {
  return new Date(from + days * 24 * 60 * 60 * 1000).toISOString()
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(size = 32) {
  return randomBytes(size).toString('hex')
}

export function maskCardKey(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  return `${trimmed.slice(0, 4)}-****-****-${trimmed.slice(-4)}`
}

export function json(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

export function normalizeCardKey(value) {
  return String(value || '').trim().toUpperCase()
}

