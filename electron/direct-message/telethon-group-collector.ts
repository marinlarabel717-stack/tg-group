import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import type { GroupCollectorMode, GroupCollectorRole } from '../../src/types'

const execFileAsync = promisify(execFile)

interface TelethonGroupCollectorRawUser {
  id?: number | string | null
  username?: string | null
  phone?: string | null
  first_name?: string | null
  last_name?: string | null
  bot?: boolean | null
  premium?: boolean | null
  has_avatar?: boolean | null
  role?: GroupCollectorRole | 'member' | null
  status_bucket?: string | null
  status_label?: string | null
}

interface TelethonGroupCollectorRawResult {
  ok?: boolean
  reason?: string | null
  summary?: string | null
  total?: number | null
  matched?: number | null
  filtered?: number | null
  users?: TelethonGroupCollectorRawUser[] | null
}

export interface TelethonCollectedUser {
  id: string
  username: string
  phone: string
  firstName: string
  lastName: string
  bot: boolean
  premium: boolean
  hasAvatar: boolean
  role: GroupCollectorRole | 'member'
  statusBucket: string
  statusLabel: string
}

export interface TelethonGroupCollectorResult {
  total: number
  users: TelethonCollectedUser[]
  summary: string
}

interface TelethonGroupCollectorPayload {
  sessionPath: string
  source: string
  mode: GroupCollectorMode
  participantLimit?: number
  historyLimit?: number
  historyDays?: number
  timeoutSeconds?: number
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
  return resolveRuntimeAssetPath('direct-message', 'telethon_group_collect.py')
}

export class TelethonGroupCollector {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async collect(payload: TelethonGroupCollectorPayload): Promise<TelethonGroupCollectorResult | null> {
    if (!this.isAvailable()) return null

    const timeoutSeconds = Math.max(15, payload.timeoutSeconds ?? 45)
    const args = [
      this.scriptPath,
      payload.sessionPath,
      JSON.stringify({
        source: payload.source,
        mode: payload.mode,
        participantLimit: payload.participantLimit ?? null,
        historyLimit: payload.historyLimit ?? null,
        historyDays: payload.historyDays ?? null,
        timeoutSeconds
      })
    ]

    const { stdout } = await execFileAsync(this.pythonExecutable, args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        ACCOUNT_CHECK_API_ID: process.env.ACCOUNT_CHECK_API_ID || '2040',
        ACCOUNT_CHECK_API_HASH: process.env.ACCOUNT_CHECK_API_HASH || 'b18441a1ff607e10a989891a5462e627'
      }
    })

    const raw = JSON.parse(stdout.trim()) as TelethonGroupCollectorRawResult
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 采集失败')
    }

    const users = Array.isArray(raw.users)
      ? raw.users.map<TelethonCollectedUser>((item) => ({
          id: String(item.id ?? '').trim(),
          username: typeof item.username === 'string' ? item.username.trim() : '',
          phone: typeof item.phone === 'string' ? item.phone.trim() : '',
          firstName: typeof item.first_name === 'string' ? item.first_name.trim() : '',
          lastName: typeof item.last_name === 'string' ? item.last_name.trim() : '',
          bot: Boolean(item.bot),
          premium: Boolean(item.premium),
          hasAvatar: Boolean(item.has_avatar),
          role: item.role === 'owner' || item.role === 'admin' ? item.role : 'member',
          statusBucket: typeof item.status_bucket === 'string' ? item.status_bucket.trim() : 'unknown',
          statusLabel: typeof item.status_label === 'string' ? item.status_label.trim() : '未知'
        })).filter((item) => item.id)
      : []

    return {
      total: Number.isFinite(raw.total) ? Number(raw.total) : users.length,
      users,
      summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : ''
    }
  }
}
