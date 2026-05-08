import clsx from 'clsx'
import type { AccountStatus } from '../../types'
import { formatAccountStatus } from '../../lib/ui-text'

const styles: Record<AccountStatus, string> = {
  Online: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  Frozen: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  Limited: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
  Offline: 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20',
  Active: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  Checking: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20'
}

export function StatusBadge({ status }: { status: AccountStatus }) {
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
}
