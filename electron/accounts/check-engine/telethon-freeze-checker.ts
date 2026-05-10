import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../../runtime-paths'

const execFileAsync = promisify(execFile)

export interface TelethonFreezeCheckResult {
  status: 'alive' | 'frozen' | 'not_logged_in' | 'unknown'
  reason?: string | null
  user_id?: number | string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  phone?: string | null
  freeze_since_date?: number | null
  freeze_until_date?: number | null
  freeze_since_text?: string | null
  freeze_until_text?: string | null
  freeze_appeal_url?: string | null
}

function resolvePythonExecutable() {
  const candidates = [
    path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    path.resolve(process.cwd(), '.venv', 'bin', 'python'),
    'python'
  ]

  return candidates.find((candidate) => candidate === 'python' || fs.existsSync(candidate)) ?? 'python'
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'check-engine', 'telethon_freeze_check.py')
}

export class TelethonFreezeChecker {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async check(sessionPath: string, timeoutSeconds = 25): Promise<TelethonFreezeCheckResult | null> {
    if (!this.isAvailable()) return null

    try {
      const { stdout } = await execFileAsync(this.pythonExecutable, [this.scriptPath, sessionPath, String(timeoutSeconds)], {
        cwd: process.cwd(),
        windowsHide: true,
        timeout: Math.max(timeoutSeconds + 5, 10) * 1000,
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          ACCOUNT_CHECK_API_ID: process.env.ACCOUNT_CHECK_API_ID || '2040',
          ACCOUNT_CHECK_API_HASH: process.env.ACCOUNT_CHECK_API_HASH || 'b18441a1ff607e10a989891a5462e627'
        }
      })

      const parsed = JSON.parse(stdout.trim()) as TelethonFreezeCheckResult
      return parsed
    } catch {
      return null
    }
  }
}
