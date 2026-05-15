import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AutoJoinPayloadItem } from '../../src/types'

const execFileAsync = promisify(execFile)

interface TelethonAutoJoinRawResult {
  ok?: boolean
  reason?: string | null
  status?: 'joined' | 'already' | 'requested' | null
  groupTitle?: string | null
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('auto-join', 'telethon_auto_join.py')
}

export interface TelethonAutoJoinResult {
  status: 'joined' | 'already' | 'requested'
  groupTitle: string
}

export class TelethonAutoJoiner {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async join(sessionPath: string, item: AutoJoinPayloadItem, timeoutSeconds = 40): Promise<TelethonAutoJoinResult | null> {
    if (!this.isAvailable()) return null

    const { stdout } = await execFileAsync(this.pythonExecutable, [
      this.scriptPath,
      JSON.stringify({
        sessionPath,
        item,
        timeoutSeconds
      })
    ], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
      encoding: 'utf8',
      env: buildTelethonPythonEnv()
    })

    const raw = JSON.parse(stdout.trim()) as TelethonAutoJoinRawResult
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 自动加群失败')
    }

    return {
      status: raw.status === 'already' || raw.status === 'requested' ? raw.status : 'joined',
      groupTitle: typeof raw.groupTitle === 'string' ? raw.groupTitle.trim() : ''
    }
  }
}
