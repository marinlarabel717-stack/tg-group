import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountCheckProxy } from '../proxy-pool/service'
import type { AutoJoinPayloadItem } from '../../src/types'

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

interface TelethonAutoJoinOptions {
  timeoutSeconds?: number
  proxy?: AccountCheckProxy | null
  signal?: AbortSignal
}

export class TelethonAutoJoiner {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async join(sessionPath: string, item: AutoJoinPayloadItem, options: TelethonAutoJoinOptions = {}): Promise<TelethonAutoJoinResult | null> {
    if (!this.isAvailable()) return null

    const timeoutSeconds = options.timeoutSeconds ?? 40

    let stdout: string
    try {
      stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(this.pythonExecutable, [
          this.scriptPath,
          JSON.stringify({
            sessionPath,
            item,
            timeoutSeconds,
            proxy: options.proxy ?? null
          })
        ], {
          cwd: process.cwd(),
          windowsHide: true,
          timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
          encoding: 'utf8',
          env: buildTelethonPythonEnv(),
          signal: options.signal
        }, (error, childStdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve(childStdout)
        })

        if (options.signal?.aborted) {
          child.kill()
        }
      })
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('AUTO_JOIN_STOPPED_BY_USER')
      }
      throw error
    }

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
