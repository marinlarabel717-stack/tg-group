import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountRecord } from './types'

const execFileAsync = promisify(execFile)

export interface TelegramWebAccountState {
  userId: string
  authKeyHex: string
  authKeyFingerprint: string
  dcId: number
  date: number
}

interface TelethonWebStateRawResult {
  ok?: boolean
  reason?: string | null
  user_id?: string | number | null
  auth_key_hex?: string | null
  dc_id?: number | null
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_read_web_state.py')
}

function normalizeUserId(value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const normalized = value.toString().trim()
    return normalized || ''
  }
  return ''
}

export class TelethonWebStateReader {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async read(account: AccountRecord): Promise<TelegramWebAccountState | null> {
    if (!this.isAvailable()) return null

    const fallbackUserId = normalizeUserId(account.userId || account.profile.id)

    const { stdout } = await execFileAsync(this.pythonExecutable, [
      this.scriptPath,
      JSON.stringify({
        sessionPath: account.sessionPath,
        fallbackUserId
      })
    ], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: 30000,
      encoding: 'utf8',
      env: buildTelethonPythonEnv()
    })

    const raw = JSON.parse(stdout.trim()) as TelethonWebStateRawResult
    if (!raw?.ok) {
      throw new Error(typeof raw?.reason === 'string' ? raw.reason : 'Telethon Web state 读取失败')
    }

    const userId = normalizeUserId(raw.user_id ?? fallbackUserId)
    const authKeyHex = typeof raw.auth_key_hex === 'string' ? raw.auth_key_hex.trim() : ''
    const dcId = Number(raw.dc_id ?? 0)

    if (!userId) {
      throw new Error('missing user id')
    }
    if (!authKeyHex) {
      throw new Error('missing session auth key')
    }
    if (!dcId) {
      throw new Error('missing session dc id')
    }

    return {
      userId,
      authKeyHex,
      authKeyFingerprint: authKeyHex.slice(0, 8),
      dcId,
      date: Math.floor(Date.now() / 1000)
    }
  }
}
