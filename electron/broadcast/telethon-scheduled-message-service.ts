import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { BroadcastCreativePayload, BroadcastScheduledMessageItem } from '../../src/types'
import type { AccountCheckProxy } from '../proxy-pool/service'

const execFileAsync = promisify(execFile)

interface TelethonScheduledMessageRawResult {
  ok?: boolean
  reason?: string | null
  summary?: string | null
  messageId?: number | null
  items?: BroadcastScheduledMessageItem[] | null
  deletedCount?: number | null
}

interface TelethonScheduledMessageBasePayload {
  sessionPath: string
  timeoutSeconds?: number
  proxy?: AccountCheckProxy | null
}

interface TelethonScheduledMessageListPayload extends TelethonScheduledMessageBasePayload {
  groupRef: string
}

interface TelethonScheduledMessagePushPayload extends TelethonScheduledMessageBasePayload {
  groupRef: string
  creative: BroadcastCreativePayload
  scheduledAt: string
  repeatPeriodSeconds?: number | null
}

interface TelethonScheduledMessageDeletePayload extends TelethonScheduledMessageBasePayload {
  groupRef: string
  messageIds: number[]
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('broadcast', 'telethon_scheduled_messages.py')
}

export class TelethonScheduledMessageService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async list(payload: TelethonScheduledMessageListPayload) {
    const raw = await this.runAction('list', payload, Math.max(20, payload.timeoutSeconds ?? 35))
    const items = Array.isArray(raw.items)
      ? raw.items.map<BroadcastScheduledMessageItem>((item) => ({
          messageId: typeof item?.messageId === 'number' && Number.isFinite(item.messageId) ? item.messageId : 0,
          scheduledAt: typeof item?.scheduledAt === 'string' && item.scheduledAt.trim() ? item.scheduledAt.trim() : null,
          text: typeof item?.text === 'string' ? item.text : '',
          hasMedia: Boolean(item?.hasMedia),
          mediaLabel: typeof item?.mediaLabel === 'string' && item.mediaLabel.trim() ? item.mediaLabel.trim() : '文字',
          hasButtons: Boolean(item?.hasButtons),
          isForwarded: Boolean(item?.isForwarded),
          forwardLabel: typeof item?.forwardLabel === 'string' ? item.forwardLabel : '',
          repeatPeriodSeconds: typeof item?.repeatPeriodSeconds === 'number' && Number.isFinite(item.repeatPeriodSeconds) && item.repeatPeriodSeconds > 0
            ? item.repeatPeriodSeconds
            : null
        })).filter((item) => item.messageId > 0)
      : []

    return {
      total: items.length,
      items,
      message: typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : items.length > 0
          ? `已读取到 ${items.length} 条定时内容。`
          : '这个群当前还没有定时内容。'
    }
  }

  async push(payload: TelethonScheduledMessagePushPayload) {
    const raw = await this.runAction('push', payload, Math.max(25, payload.timeoutSeconds ?? 45))
    return {
      messageId: typeof raw.messageId === 'number' && Number.isFinite(raw.messageId) ? raw.messageId : null
    }
  }

  async delete(payload: TelethonScheduledMessageDeletePayload) {
    const raw = await this.runAction('delete', payload, Math.max(20, payload.timeoutSeconds ?? 30))
    const deletedCount = typeof raw.deletedCount === 'number' && Number.isFinite(raw.deletedCount) ? raw.deletedCount : 0
    return {
      deletedCount,
      message: typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : `已删除 ${deletedCount} 条定时内容。`
    }
  }

  private async runAction(action: 'list' | 'push' | 'delete', payload: object, timeoutSeconds: number) {
    if (!this.isAvailable()) {
      throw new Error('TELETHON_SCHEDULED_MESSAGE_SERVICE_UNAVAILABLE')
    }

    const { stdout } = await execFileAsync(this.pythonExecutable, [
      this.scriptPath,
      JSON.stringify({ action, ...payload, timeoutSeconds })
    ], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Math.max(timeoutSeconds + 5, 20) * 1000,
      encoding: 'utf8',
      env: buildTelethonPythonEnv()
    })

    const raw = JSON.parse(stdout.trim()) as TelethonScheduledMessageRawResult
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 定时群发失败')
    }

    return raw
  }
}
