import type { AccountStatus } from '../types'

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.trim()
  }

  return String(error ?? '')
}

export class StatusResolver {
  resolveAuthorization(authorized: boolean): AccountStatus {
    return authorized ? 'checking' : 'not_logged_in'
  }

  resolveFromError(error: unknown): AccountStatus {
    const text = normalizeError(error).toLowerCase()

    if (!text) return 'unknown'
    if (text.includes('auth_key_duplicated')) return 'multi_ip'
    if (text.includes('frozen') || text.includes('freeze_state') || text.includes('freeze')) return 'frozen'
    if (text.includes('frozen_participant_missing')) return 'frozen'
    if (text.includes('phone number banned') || text.includes('user_deactivated_ban') || text.includes('banned')) return 'banned'
    if (text.includes('auth_key_unregistered') || text.includes('session_revoked') || text.includes('session expired')) return 'session_expired'
    if (text.includes('not authorized') || text.includes('unauthorized') || text.includes('auth key') && text.includes('missing')) return 'not_logged_in'
    if (text.includes('timeout') || text.includes('timed out') || text.includes('etimedout')) return 'timeout'
    if (text.includes('multiple ip') || text.includes('different ip') || text.includes('many locations')) return 'multi_ip'

    return 'unknown'
  }

  isRetryable(status: AccountStatus, error?: unknown) {
    if (status === 'timeout') return true

    const text = normalizeError(error).toLowerCase()
    return text.includes('timeout') || text.includes('socket') || text.includes('network') || text.includes('disconnect')
  }
}
