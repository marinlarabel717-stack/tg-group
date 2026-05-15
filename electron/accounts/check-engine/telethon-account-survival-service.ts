import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../../python-runtime'
import type { AccountClientProxyOptions } from './telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './telethon-proxy'

const execFileAsync = promisify(execFile)

export interface TelethonAccountSurvivalResult {
  status: 'ok' | 'not_logged_in' | 'unknown'
  reason?: string | null
  user_id?: number | string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  phone?: string | null
  premium?: boolean | null
  ttl_days?: number | null
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'check-engine', 'telethon_account_survival.py')
}

export class TelethonAccountSurvivalService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async run(sessionPath: string, timeoutSeconds = 25, proxy?: AccountClientProxyOptions | null): Promise<TelethonAccountSurvivalResult | null> {
    if (!this.isAvailable()) return null
    if (!supportsTelethonProxy(proxy)) return null

    try {
      const args = [this.scriptPath, sessionPath, String(timeoutSeconds)]
      const proxyArg = serializeTelethonProxy(proxy)
      if (proxyArg) args.push(proxyArg)

      const { stdout } = await execFileAsync(this.pythonExecutable, args, {
        cwd: process.cwd(),
        windowsHide: true,
        timeout: Math.max(timeoutSeconds + 5, 10) * 1000,
        encoding: 'utf8',
        env: buildTelethonPythonEnv()
      })

      return JSON.parse(stdout.trim()) as TelethonAccountSurvivalResult
    } catch {
      return null
    }
  }
}
