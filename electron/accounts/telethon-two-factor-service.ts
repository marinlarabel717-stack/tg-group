import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AccountRecord, TwoFactorAction, TwoFactorOperationPhase, TwoFactorOperationPayload, TwoFactorOperationResultItem } from './types'
import { resolveRuntimeAssetPath } from '../runtime-paths'

const execFileAsync = promisify(execFile)

interface TelethonTwoFactorRawResult {
  ok?: boolean
  action?: string | null
  phase?: string | null
  message?: string | null
  reason?: string | null
  email_pattern?: string | null
  next_two_fa?: string | null
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
  return resolveRuntimeAssetPath('accounts', 'telethon_twofa_manage.py')
}

function formatTwoFactorError(error: string) {
  const normalized = error.trim()
  const upper = normalized.toUpperCase()
  const lower = normalized.toLowerCase()

  if (lower.includes('session_not_authorized') || upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED')) {
    return '当前账号 Session 已失效或未登录，无法执行 2FA 操作。'
  }
  if (upper.includes('PASSWORD_HASH_INVALID')) {
    return '旧 2FA 不正确，Telegram 拒绝了这次操作。'
  }
  if (upper.includes('PASSWORD_MISSING') || upper.includes('SESSION_PASSWORD_NEEDED')) {
    return '这个账号当前需要正确的旧 2FA 才能继续操作。'
  }
  if (upper.includes('PASSWORD_RECOVERY_NA')) {
    return '这个账号没有可用的恢复邮箱，暂时没法走邮箱重置 2FA。'
  }
  if (upper.includes('PASSWORD_RECOVERY_EXPIRED') || upper.includes('EMAIL_HASH_EXPIRED') || upper.includes('EMAIL_VERIFY_EXPIRED')) {
    return '邮箱验证码已经过期，请重新发送后再试。'
  }
  if (upper.includes('CODE_INVALID')) {
    return '邮箱验证码不正确，请核对后重新提交。'
  }
  if (upper.includes('EMAIL_INVALID')) {
    return '恢复邮箱格式不对，Telegram 没有接受。'
  }
  if (upper.includes('FLOOD_WAIT')) {
    const match = upper.match(/FLOOD_WAIT_?(\d+)/)
    if (match?.[1]) {
      return `Telegram 暂时限流了这个账号，需要等待 ${match[1]} 秒后再试。`
    }
    return 'Telegram 暂时限流了这个账号，请稍后再试。'
  }
  if (lower.includes('timeout')) {
    return '这次 2FA 操作超时了，请稍后重试。'
  }

  return normalized || '2FA 操作失败，Telegram 没有返回更明确的原因。'
}

export class TelethonTwoFactorService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  async execute(account: AccountRecord, payload: TwoFactorOperationPayload): Promise<TwoFactorOperationResultItem> {
    if (!this.isAvailable()) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        message: '当前运行环境缺少 2FA Runtime 脚本，暂时没法执行。',
        nextTwoFA: null,
        emailPattern: null
      }
    }

    try {
      const { stdout } = await execFileAsync(
        this.pythonExecutable,
        [this.scriptPath, JSON.stringify({
          action: payload.action,
          phase: payload.phase,
          sessionPath: account.sessionPath,
          currentPassword: payload.currentPassword ?? '',
          newPassword: payload.newPassword ?? '',
          hint: payload.hint ?? '',
          recoveryCode: payload.recoveryCode ?? ''
        })],
        {
          cwd: process.cwd(),
          windowsHide: true,
          timeout: 120000,
          encoding: 'utf8',
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            ACCOUNT_CHECK_API_ID: process.env.ACCOUNT_CHECK_API_ID || '2040',
            ACCOUNT_CHECK_API_HASH: process.env.ACCOUNT_CHECK_API_HASH || 'b18441a1ff607e10a989891a5462e627'
          }
        }
      )

      const raw = JSON.parse(stdout.trim()) as TelethonTwoFactorRawResult
      const ok = Boolean(raw.ok)
      const emailPattern = typeof raw.email_pattern === 'string' && raw.email_pattern.trim() ? raw.email_pattern.trim() : null
      const nextTwoFA = typeof raw.next_two_fa === 'string' ? raw.next_two_fa : null
      const phase = payload.phase ?? 'apply'
      const message = ok
        ? (typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : this.buildSuccessMessage(payload.action, phase, emailPattern))
        : formatTwoFactorError(typeof raw.reason === 'string' ? raw.reason : '')

      return {
        accountId: account.id,
        phone: account.phone,
        success: ok,
        message,
        nextTwoFA,
        emailPattern
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        message: formatTwoFactorError(reason),
        nextTwoFA: null,
        emailPattern: null
      }
    }
  }

  private buildSuccessMessage(action: TwoFactorAction, phase: TwoFactorOperationPhase, emailPattern: string | null) {
    if (action === 'change-2fa') {
      return '新 2FA 已经设置成功。'
    }
    if (action === 'disable-2fa') {
      return '2FA 已经关闭。'
    }
    if (phase === 'request-recovery') {
      return emailPattern ? `邮箱验证码已经发到 ${emailPattern}` : '邮箱验证码已经发出。'
    }
    return '邮箱验证码校验通过，2FA 已经重置成功。'
  }
}
