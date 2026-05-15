import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../../python-runtime'

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
        env: buildTelethonPythonEnv()
      })

      const parsed = JSON.parse(stdout.trim()) as TelethonFreezeCheckResult
      return parsed
    } catch {
      return null
    }
  }
}
