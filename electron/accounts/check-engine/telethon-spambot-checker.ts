import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveRuntimeAssetPath } from '../../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../../python-runtime'
import { parseSpamBotReply } from './spam-bot-parser'
import type { AccountStatus } from '../types'
import type { AccountClientProxyOptions } from './telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './telethon-proxy'

const execFileAsync = promisify(execFile)

export interface TelethonSpamBotCheckResult {
  status: AccountStatus | 'not_logged_in'
  reason?: string | null
  summary: string
  replyText: string
  premium?: boolean | null
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

interface TelethonSpamBotCheckRawResult {
  status?: string | null
  reason?: string | null
  reply_text?: string | null
  premium?: boolean | null
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
  return resolveRuntimeAssetPath('accounts', 'check-engine', 'telethon_spambot_check.py')
}

function buildSummary(status: TelethonSpamBotCheckResult['status'], raw: TelethonSpamBotCheckRawResult, replyText: string) {
  if (replyText) {
    return parseSpamBotReply(replyText).summary
  }

  if (status === 'frozen') return '账号处于冻结状态'
  if (status === 'banned') return '账号已封禁'
  if (status === 'session_expired') return 'Session文件已失效'
  if (status === 'not_logged_in') return 'Session文件已失效'
  if (status === 'timeout') return '未在超时时间内收到 SpamBot 回复'
  return raw.reason?.trim() || 'Telethon SpamBot 检测未返回明确结果'
}

function normalizeStatus(raw: TelethonSpamBotCheckRawResult): TelethonSpamBotCheckResult['status'] {
  const rawStatus = String(raw.status || '').trim().toLowerCase()
  const replyText = typeof raw.reply_text === 'string' ? raw.reply_text.trim() : ''
  const reason = String(raw.reason || '').trim().toLowerCase()

  if (replyText) {
    return parseSpamBotReply(replyText).status
  }

  if (rawStatus === 'frozen') return 'frozen'
  if (rawStatus === 'banned') return 'banned'
  if (rawStatus === 'session_expired') return 'session_expired'
  if (reason.includes('phone_number_banned') || reason.includes('user_deactivated_ban') || reason.includes('user_deactivated')) return 'banned'
  if (rawStatus === 'not_logged_in') return 'not_logged_in'
  if (reason.includes('auth_key_unregistered') || reason.includes('session_revoked') || reason.includes('session_expired')) return 'session_expired'
  if (rawStatus === 'timeout') return 'timeout'
  return 'unknown'
}

export class TelethonSpamBotChecker {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async check(sessionPath: string, timeoutSeconds = 25, proxy?: AccountClientProxyOptions | null): Promise<TelethonSpamBotCheckResult | null> {
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

      const raw = JSON.parse(stdout.trim()) as TelethonSpamBotCheckRawResult
      const replyText = typeof raw.reply_text === 'string' ? raw.reply_text.trim() : ''
      const status = normalizeStatus(raw)

      return {
        status,
        reason: raw.reason ?? null,
        summary: buildSummary(status, raw, replyText),
        replyText,
        premium: typeof raw.premium === 'boolean' ? raw.premium : null,
        user_id: raw.user_id ?? null,
        first_name: raw.first_name ?? null,
        last_name: raw.last_name ?? null,
        username: raw.username ?? null,
        phone: raw.phone ?? null,
        freeze_since_date: raw.freeze_since_date ?? null,
        freeze_until_date: raw.freeze_until_date ?? null,
        freeze_since_text: raw.freeze_since_text ?? null,
        freeze_until_text: raw.freeze_until_text ?? null,
        freeze_appeal_url: raw.freeze_appeal_url ?? null,
      }
    } catch {
      return null
    }
  }
}
