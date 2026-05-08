import { create } from 'zustand'
import type { AccountRecord, ModuleKey, ProxyStatus, SessionStatus, StatRecord } from '../types'

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

const baseStats: StatRecord[] = [
  { id: 'online', label: '存活账号', value: '128', delta: '+12.4%', tone: 'success' },
  { id: 'frozen', label: '冻结账号', value: '07', delta: '-2.1%', tone: 'danger' },
  { id: 'session', label: 'Session 状态', value: '96.8%', delta: '+3.8%', tone: 'primary' },
  { id: 'realtime', label: '实时吞吐', value: '18.4k', delta: '+9.9%', tone: 'warning' }
]

interface AppState {
  activeModule: ModuleKey
  search: string
  notificationCount: number
  userName: string
  stats: StatRecord[]
  accounts: AccountRecord[]
  setModule: (module: ModuleKey) => void
  setSearch: (value: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'dashboard',
  search: '',
  notificationCount: 6,
  userName: '总控席',
  stats: baseStats,
  accounts: mockAccounts,
  setModule: (module) => set({ activeModule: module }),
  setSearch: (value) => set({ search: value })
}))

export const selectFilteredAccounts = (state: AppState) => {
  const query = state.search.toLowerCase().trim()
  if (!query) return state.accounts
  return state.accounts.filter((account) =>
    [account.phone, account.country, account.username, account.status, account.id, account.proxy, account.session]
      .join(' ')
      .toLowerCase()
      .includes(query)
  )
}
