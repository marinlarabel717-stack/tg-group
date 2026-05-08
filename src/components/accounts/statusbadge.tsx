import { memo } from 'react'
import clsx from 'clsx'
import type { AccountStatus } from '../../types'
import { formatAccountStatus } from '../../lib/ui-text'

const styles: Record<AccountStatus, string> = {
  alive: 'bg-emerald-500/15 text-emerald-300',
  frozen: 'bg-sky-500/15 text-sky-300',
  banned: 'bg-rose-500/15 text-rose-300',
  limited: 'bg-amber-500/15 text-amber-300',
  temporary_limited: 'bg-orange-500/15 text-orange-300',
  session_expired: 'bg-fuchsia-500/15 text-fuchsia-300',
  multi_ip: 'bg-violet-500/15 text-violet-300',
  timeout_unchecked: 'bg-slate-500/15 text-slate-300',
  checking: 'bg-cyan-500/15 text-cyan-300',
  unknown: 'bg-white/10 text-slate-200'
}

export const StatusBadge = memo(function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em]',
        styles[status]
      )}
    >
      {formatAccountStatus(status)}
    </span>
  )
})
