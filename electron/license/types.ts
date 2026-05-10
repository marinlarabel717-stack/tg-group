export interface StoredLicenseRecord {
  cardKey: string
  licenseToken: string
  expireAt: string | null
  activatedAt: string
  lastValidatedAt: string | null
  offlineGraceUntil: string | null
  machineId: string
  licenseStatus: 'active' | 'expired' | 'disabled' | 'invalid'
}

export interface LicenseSnapshot {
  status: 'missing' | 'valid' | 'expired' | 'invalid' | 'grace'
  canEnter: boolean
  machineId: string
  appVersion: string
  isPackaged: boolean
  devBypassAvailable: boolean
  apiConfigured: boolean
  cardKeyMasked: string | null
  expireAt: string | null
  activatedAt: string | null
  lastValidatedAt: string | null
  offlineGraceUntil: string | null
  message: string
}

export interface LicenseActivateResult {
  ok: boolean
  message: string
  snapshot: LicenseSnapshot
}

