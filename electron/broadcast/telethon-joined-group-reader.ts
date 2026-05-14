import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import type { BroadcastJoinedGroup } from '../../src/types'

const execFileAsync = promisify(execFile)

interface TelethonJoinedGroupRawResult {
  ok?: boolean
  reason?: string | null
  summary?: string | null
  total?: number | null
  groups?: Array<{
    peerId?: string | null
    title?: string | null
    username?: string | null
    targetRef?: string | null
    memberCount?: number | null
    type?: 'group' | 'supergroup' | null
  }> | null
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
  return resolveRuntimeAssetPath('broadcast', 'telethon_list_joined_groups.py')
}

export class TelethonJoinedGroupReader {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async list(sessionPath: string, timeoutSeconds = 30): Promise<BroadcastJoinedGroup[] | null> {
    if (!this.isAvailable()) return null

    const { stdout } = await execFileAsync(this.pythonExecutable, [this.scriptPath, sessionPath, String(timeoutSeconds)], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Math.max(timeoutSeconds + 5, 15) * 1000,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        ACCOUNT_CHECK_API_ID: process.env.ACCOUNT_CHECK_API_ID || '2040',
        ACCOUNT_CHECK_API_HASH: process.env.ACCOUNT_CHECK_API_HASH || 'b18441a1ff607e10a989891a5462e627'
      }
    })

    const raw = JSON.parse(stdout.trim()) as TelethonJoinedGroupRawResult
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 读取已加入群失败')
    }

    const groups = Array.isArray(raw.groups)
      ? raw.groups.map<BroadcastJoinedGroup>((item) => ({
          peerId: String(item?.peerId ?? '').trim(),
          title: typeof item?.title === 'string' ? item.title.trim() : '',
          username: typeof item?.username === 'string' ? item.username.trim() : '',
          targetRef: typeof item?.targetRef === 'string' ? item.targetRef.trim() : '',
          memberCount: typeof item?.memberCount === 'number' && Number.isFinite(item.memberCount) ? item.memberCount : 0,
          type: item?.type === 'supergroup' ? 'supergroup' : 'group'
        })).filter((item) => item.peerId && item.title)
      : []

    return groups
  }
}
