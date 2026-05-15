import fs from 'node:fs'
import { execFile, type ChildProcess } from 'node:child_process'
import type { AccountRecord, TwoFactorAction, TwoFactorOperationPhase, TwoFactorOperationPayload, TwoFactorOperationResultItem } from './types'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'

interface TelethonTwoFactorRawResult {
  ok?: boolean
  action?: string | null
  phase?: string | null
  message?: string | null
  reason?: string | null
  email_pattern?: string | null
  next_two_fa?: string | null
}

function readResetWaitMessage(rawMessage: string) {
  const message = rawMessage.trim()
  return message || '已触发忘记密码，正在等待 Telegram 的重置期结束。'
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_twofa_manage.py')
}

function formatTwoFactorError(error: string) {
  const normalized = error.trim()
  const upper = normalized.toUpperCase()
  const lower = normalized.toLowerCase()

  if (upper.includes('TWO_FACTOR_OPERATION_ABORTED_BY_USER')) {
    return '已按停止指令中断当前账号处理。'
  }

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
  if (upper.includes('RESET_PASSWORD_WAIT_')) {
    const waitAt = normalized.split('RESET_PASSWORD_WAIT_')[1]?.trim()
    return waitAt ? `这个账号已经在等待 Telegram 自动重置 2FA，要等到 ${waitAt} 后才能继续。` : '这个账号已经在等待 Telegram 自动重置 2FA。'
  }
  if (upper.includes('RESET_PASSWORD_WAIT')) {
    return '这个账号已经在等待 Telegram 自动重置 2FA。'
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
  private readonly runningProcesses = new Map<number, ChildProcess>()
  private readonly cancelledAccountIds = new Set<number>()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  cancelActiveOperations() {
    for (const [accountId, childProcess] of this.runningProcesses.entries()) {
      this.cancelledAccountIds.add(accountId)
      this.terminateChildProcess(childProcess)
    }
  }

  private terminateChildProcess(childProcess: ChildProcess) {
    try {
      if (!childProcess.killed) {
        childProcess.kill()
      }
    } catch {
      // ignore
    }
  }

  private async runScript(accountId: number, payload: Record<string, unknown>) {
    return await new Promise<TelethonTwoFactorRawResult>((resolve, reject) => {
      let settled = false
      let timedOut = false
      const childProcess = execFile(
        this.pythonExecutable,
        [this.scriptPath, JSON.stringify(payload)],
        {
          cwd: process.cwd(),
          windowsHide: true,
          encoding: 'utf8',
          env: buildTelethonPythonEnv(),
          maxBuffer: 8 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          this.runningProcesses.delete(accountId)
          const cancelled = this.cancelledAccountIds.delete(accountId)

          if (error) {
            if (cancelled) {
              reject(new Error('TWO_FACTOR_OPERATION_ABORTED_BY_USER'))
              return
            }
            if (timedOut) {
              reject(new Error('timeout'))
              return
            }
            const reason = String(stderr || stdout || error.message || 'TWO_FACTOR_OPERATION_FAILED').trim()
            reject(new Error(reason))
            return
          }

          try {
            resolve(JSON.parse(String(stdout).trim()) as TelethonTwoFactorRawResult)
          } catch (parseError) {
            reject(parseError instanceof Error ? parseError : new Error(String(parseError)))
          }
        }
      )

      this.runningProcesses.set(accountId, childProcess)

      const timeoutId = setTimeout(() => {
        timedOut = true
        this.terminateChildProcess(childProcess)
      }, 120000)
    })
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
      const raw = await this.runScript(account.id, {
        action: payload.action,
        phase: payload.phase,
        sessionPath: account.sessionPath,
        currentPassword: payload.currentPassword ?? '',
        newPassword: payload.newPassword ?? '',
        hint: payload.hint ?? '',
        recoveryCode: payload.recoveryCode ?? ''
      })
      const ok = Boolean(raw.ok)
      const emailPattern = typeof raw.email_pattern === 'string' && raw.email_pattern.trim() ? raw.email_pattern.trim() : null
      const nextTwoFA = Object.prototype.hasOwnProperty.call(raw, 'next_two_fa')
        ? (typeof raw.next_two_fa === 'string' ? raw.next_two_fa : null)
        : undefined
      const phase = payload.phase ?? 'apply'
      const message = ok
        ? (payload.action === 'reset-2fa'
          ? readResetWaitMessage(typeof raw.message === 'string' ? raw.message : '')
          : (typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : this.buildSuccessMessage(payload.action, phase, emailPattern)))
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
    return emailPattern ? `忘记密码已触发，恢复验证码会发到 ${emailPattern}` : '忘记密码已触发。'
  }
}
