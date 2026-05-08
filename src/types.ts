export type ModuleKey =
  | 'dashboard'
  | 'accounts'
  | 'automation'
  | 'proxy-pool'
  | 'session-manager'
  | 'logs'

export type AccountStatus = 'Online' | 'Frozen' | 'Limited' | 'Offline' | 'Active' | 'Checking'

export type SessionStatus = 'Healthy' | 'Warning' | 'Expired'

export type ProxyStatus = 'Dedicated' | 'Shared' | 'Rotating' | 'Fallback'

export interface AccountRecord {
  id: string
  phone: string
  country: string
  status: AccountStatus
  username: string
  session: SessionStatus
  proxy: ProxyStatus
  online: boolean
  lastActive: string
  lastSeen: string
}

export interface StatRecord {
  id: string
  label: string
  value: string
  delta: string
  tone: 'primary' | 'success' | 'danger' | 'warning'
}
