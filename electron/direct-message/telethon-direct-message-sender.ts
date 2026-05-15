import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { DirectMessageSendPayload } from '../../src/types'

const execFileAsync = promisify(execFile)

interface TelethonDirectMessageRawResult {
  ok?: boolean
  reason?: string | null
  messageId?: number | null
}

interface TelethonDirectMessageSendPayload {
  sessionPath: string
  targetValue: string
  messageType: DirectMessageSendPayload['messageType']
  messageText: string
  imageUrl: string
  sourceLink: string
  postbotCode: string
  timeoutSeconds?: number
}

interface TelethonDirectMessagePinPayload {
  sessionPath: string
  targetValue: string
  messageId: number
  timeoutSeconds?: number
}

interface TelethonDirectMessageDeletePayload {
  sessionPath: string
  targetValue: string
  messageId: number
  deleteMode: DirectMessageSendPayload['deleteMode']
  timeoutSeconds?: number
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('direct-message', 'telethon_direct_message_send.py')
}

export class TelethonDirectMessageSender {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async send(payload: TelethonDirectMessageSendPayload) {
    const result = await this.runAction('send', { ...payload }, Math.max(20, payload.timeoutSeconds ?? 45))
    return {
      messageId: typeof result.messageId === 'number' && Number.isFinite(result.messageId) ? result.messageId : null
    }
  }

  async pin(payload: TelethonDirectMessagePinPayload) {
    await this.runAction('pin', { ...payload }, Math.max(15, payload.timeoutSeconds ?? 25))
  }

  async delete(payload: TelethonDirectMessageDeletePayload) {
    await this.runAction('delete', { ...payload }, Math.max(15, payload.timeoutSeconds ?? 25))
  }

  private async runAction(action: 'send' | 'pin' | 'delete', payload: Record<string, unknown>, timeoutSeconds: number) {
    if (!this.isAvailable()) {
      throw new Error('TELETHON_DIRECT_MESSAGE_SENDER_UNAVAILABLE')
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

    const raw = JSON.parse(stdout.trim()) as TelethonDirectMessageRawResult
    if (!raw?.ok) {
      throw new Error((typeof raw?.reason === 'string' && raw.reason.trim()) ? raw.reason.trim() : 'Telethon 私信发送失败')
    }

    return raw
  }
}
