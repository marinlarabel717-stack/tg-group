import { memo } from 'react'
import clsx from 'clsx'
import type { AccountStatus } from '../../types'
import { formatAccountStatus } from '../../lib/ui-text'

const styles: Record<AccountStatus, string> = {
  Online: 'bg-emerald-500/15 text-emerald-300',
  Frozen: 'bg-sky-500/15 text-sky-300',
  Limited: 'bg-rose-500/15 text-rose-300',
  Offline: 'bg-slate-500/15 text-slate-300',
  Active: 'bg-emerald-500/15 text-emerald-300',
  Checking: 'bg-amber-500/15 text-amber-300'
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
