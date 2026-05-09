import { memo } from 'react'
import clsx from 'clsx'
import type { AccountStatus } from '../../types'
import { formatAccountStatus, isGeoRestrictedError } from '../../lib/ui-text'

const styles: Record<AccountStatus, string> = {
  alive: 'bg-emerald-500/15 text-emerald-300',
  banned: 'bg-rose-500/15 text-rose-300',
  limited: 'bg-yellow-500/15 text-yellow-300',
  temporary_limited: 'bg-yellow-500/15 text-yellow-300',
  frozen: 'bg-sky-500/15 text-sky-300',
  session_expired: 'bg-fuchsia-500/15 text-fuchsia-300',
  not_logged_in: 'bg-amber-500/15 text-amber-300',
  multi_ip: 'bg-violet-500/15 text-violet-300',
  timeout: 'bg-slate-500/15 text-slate-300',
  checking: 'bg-cyan-500/15 text-cyan-300',
  unknown: 'bg-white/10 text-slate-200'
}

export const StatusBadge = memo(function StatusBadge({
  status,
  errorMessage,
  checkMode,
  onClick
}: {
  status: AccountStatus
  errorMessage?: string | null
  checkMode?: 'account-status' | 'account-survival' | null
  onClick?: () => void
}) {
  const geoRestricted = status === 'unknown' && isGeoRestrictedError(errorMessage)
  const label = formatAccountStatus(status, errorMessage, checkMode)

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        'inline-flex h-6 w-[102px] items-center justify-center overflow-hidden rounded-full px-2 text-center text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap',
        onClick ? 'cursor-pointer transition hover:brightness-110' : 'cursor-default',
        geoRestricted ? 'bg-amber-400/15 text-amber-200' : styles[status]
      )}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </button>
  )
})
