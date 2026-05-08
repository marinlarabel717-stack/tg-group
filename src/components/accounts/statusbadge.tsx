import { memo } from 'react'
import clsx from 'clsx'
import type { AccountStatus } from '../../types'
import { formatAccountStatus } from '../../lib/ui-text'

const styles: Record<AccountStatus, string> = {
  alive: 'bg-emerald-500/15 text-emerald-300',
  banned: 'bg-rose-500/15 text-rose-300',
  limited: 'bg-amber-500/15 text-amber-300',
  temporary_limited: 'bg-orange-500/15 text-orange-300',
  session_expired: 'bg-fuchsia-500/15 text-fuchsia-300',
  not_logged_in: 'bg-yellow-500/15 text-yellow-300',
  multi_ip: 'bg-violet-500/15 text-violet-300',
  timeout: 'bg-slate-500/15 text-slate-300',
  checking: 'bg-cyan-500/15 text-cyan-300',
  unknown: 'bg-white/10 text-slate-200'
}

export const StatusBadge = memo(function StatusBadge({ status }: { status: AccountStatus }) {
  const label = formatAccountStatus(status)

  return (
    <span
      title={label}
      className={clsx(
        'inline-flex h-6 w-[102px] items-center justify-center overflow-hidden rounded-full px-2 text-center text-[10px] font-semibold tracking-[0.1em] whitespace-nowrap',
        styles[status]
      )}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </span>
  )
})
