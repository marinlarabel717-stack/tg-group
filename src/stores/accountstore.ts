import { create } from 'zustand'
import type { AccountRecord, ProxyStatus, SessionStatus } from '../types'

const countries = ['美国', '英国', '新加坡', '德国', '阿联酋', '荷兰', '日本', '加拿大']
const statuses = ['Online', 'Frozen', 'Limited', 'Offline'] as const
const sessions: SessionStatus[] = ['Healthy', 'Warning', 'Expired']
const proxies: ProxyStatus[] = ['Dedicated', 'Shared', 'Rotating', 'Fallback']
const usernames = ['atlas', 'neon', 'vector', 'aurora', 'drift', 'delta', 'zenith', 'pulse']

const mockAccounts: AccountRecord[] = Array.from({ length: 160 }, (_, index) => {
  const status = statuses[index % statuses.length]
  const country = countries[index % countries.length]
  const session = sessions[index % sessions.length]
  const proxy = proxies[index % proxies.length]
  const online = status === 'Online'
  const lastActive = online ? '刚刚在线' : `${(index % 14) + 1} 分钟前`

  return {
    id: `AC-${String(index + 1).padStart(3, '0')}`,
    phone: `+${1 + (index % 8)} ${(200 + index).toString().padStart(3, '0')} 55 ${(1000 + index).toString().slice(-4)}`,
    country,
    status,
    username: `@${usernames[index % usernames.length]}_${index + 1}`,
    session,
    proxy,
    online,
    lastActive,
    lastSeen: lastActive
  }
})

interface AccountState {
  accounts: AccountRecord[]
  searchTerm: string
  setSearchTerm: (value: string) => void
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: mockAccounts,
  searchTerm: '',
  setSearchTerm: (value) => set({ searchTerm: value })
}))

export function filterAccounts(accounts: AccountRecord[], query: string) {
  const keyword = query.toLowerCase().trim()
  if (!keyword) return accounts

  return accounts.filter((account) =>
    [account.phone, account.country, account.username, account.status, account.id, account.proxy, account.session]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  )
}
