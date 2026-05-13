import { app } from 'electron'
import { createHash } from 'node:crypto'
import os from 'node:os'
import type { AppSettingsStore } from '../app-settings-store'
import type { LicenseActivateResult, LicenseSnapshot, LicenseValidateResult, StoredLicenseRecord } from './types'
import { LicenseStore } from './license-store'

function maskCardKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  return `${trimmed.slice(0, 4)}-****-****-${trimmed.slice(-4)}`
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function buildMachineId() {
  const raw = [os.hostname(), os.platform(), os.arch(), os.release(), String(os.cpus().length)].join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

function normalizeLicenseApiBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return ''
    }
    if (parsed.port === '0') {
      return ''
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

async function postJson<T>(url: string, body: unknown) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `HTTP ${response.status}`)
    }

    return await response.json() as T
  } finally {
    clearTimeout(timer)
  }
}

export class LicenseService {
  private readonly machineId = buildMachineId()

  constructor(
    private readonly store: LicenseStore,
    private readonly appSettingsStore: AppSettingsStore
  ) {}

  private getLicenseApiBaseUrl() {
    const settings = this.appSettingsStore.get()
    const normalized = normalizeLicenseApiBaseUrl(settings.licenseApiBaseUrl)

    if (normalized && normalized !== settings.licenseApiBaseUrl) {
      this.appSettingsStore.update({ licenseApiBaseUrl: normalized })
    }

    if (normalized) {
      return normalized
    }

    const fallback = normalizeLicenseApiBaseUrl('http://tgmatrix.duckdns.org')
    if (fallback && settings.licenseApiBaseUrl !== fallback) {
      this.appSettingsStore.update({ licenseApiBaseUrl: fallback })
    }
    return fallback
  }

  private getOfflineGraceDays() {
    return this.appSettingsStore.get().licenseOfflineGraceDays
  }

  private buildSnapshot(record: StoredLicenseRecord | null, override?: Partial<LicenseSnapshot>): LicenseSnapshot {
    const now = Date.now()
    const expireAt = toTimestamp(record?.expireAt)
    const graceUntil = toTimestamp(record?.offlineGraceUntil)
    const apiBaseUrl = this.getLicenseApiBaseUrl()

    if (!record) {
      return {
        status: 'missing',
        canEnter: false,
        machineId: this.machineId,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        devBypassAvailable: !app.isPackaged,
        apiConfigured: Boolean(apiBaseUrl),
        apiBaseUrl,
        cardKeyMasked: null,
        rememberedCardKey: null,
        expireAt: null,
        activatedAt: null,
        lastValidatedAt: null,
        offlineGraceUntil: null,
        message: apiBaseUrl
          ? '请输入卡密完成激活。'
          : '授权服务地址尚未配置，请先在设置里填写。',
        ...override
      }
    }

    if (record.licenseStatus !== 'active') {
      return {
        status: 'invalid',
        canEnter: false,
        machineId: this.machineId,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        devBypassAvailable: !app.isPackaged,
        apiConfigured: Boolean(apiBaseUrl),
        apiBaseUrl,
        cardKeyMasked: maskCardKey(record.cardKey),
        rememberedCardKey: record.cardKey,
        expireAt: record.expireAt,
        activatedAt: record.activatedAt,
        lastValidatedAt: record.lastValidatedAt,
        offlineGraceUntil: record.offlineGraceUntil,
        message: '当前授权状态无效，请重新激活。',
        ...override
      }
    }

    if (expireAt && expireAt <= now) {
      if (graceUntil && graceUntil > now) {
        return {
          status: 'grace',
          canEnter: true,
          machineId: this.machineId,
          appVersion: app.getVersion(),
          isPackaged: app.isPackaged,
          devBypassAvailable: !app.isPackaged,
          apiConfigured: Boolean(apiBaseUrl),
          apiBaseUrl,
          cardKeyMasked: maskCardKey(record.cardKey),
          rememberedCardKey: record.cardKey,
          expireAt: record.expireAt,
          activatedAt: record.activatedAt,
          lastValidatedAt: record.lastValidatedAt,
          offlineGraceUntil: record.offlineGraceUntil,
          message: '授权已进入离线宽限期，请尽快联网校验。',
          ...override
        }
      }

      return {
        status: 'expired',
        canEnter: false,
        machineId: this.machineId,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        devBypassAvailable: !app.isPackaged,
        apiConfigured: Boolean(apiBaseUrl),
        apiBaseUrl,
        cardKeyMasked: maskCardKey(record.cardKey),
        rememberedCardKey: record.cardKey,
        expireAt: record.expireAt,
        activatedAt: record.activatedAt,
        lastValidatedAt: record.lastValidatedAt,
        offlineGraceUntil: record.offlineGraceUntil,
        message: '授权已过期，请重新激活。',
        ...override
      }
    }

    return {
      status: 'valid',
      canEnter: true,
      machineId: this.machineId,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      devBypassAvailable: !app.isPackaged,
      apiConfigured: Boolean(apiBaseUrl),
      apiBaseUrl,
      cardKeyMasked: maskCardKey(record.cardKey),
      rememberedCardKey: record.cardKey,
      expireAt: record.expireAt,
      activatedAt: record.activatedAt,
      lastValidatedAt: record.lastValidatedAt,
      offlineGraceUntil: record.offlineGraceUntil,
      message: '授权有效。',
      ...override
    }
  }

  getSnapshot() {
    return this.buildSnapshot(this.store.get())
  }

  private buildOfflineGraceUntil(now = Date.now()) {
    const days = this.getOfflineGraceDays()
    if (days <= 0) return null
    return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
  }

  private saveRecord(record: StoredLicenseRecord) {
    this.store.set(record)
    return record
  }

  async validate(): Promise<LicenseValidateResult> {
    const record = this.store.get()
    if (!record) {
      return {
        ok: false,
        message: '当前还没有授权记录。',
        snapshot: this.buildSnapshot(null)
      }
    }

    const apiBaseUrl = this.getLicenseApiBaseUrl()
    if (!apiBaseUrl) {
      return {
        ok: false,
        message: '授权服务地址尚未配置，请先在设置里填写。',
        snapshot: this.buildSnapshot(record, { message: '授权服务地址尚未配置，请先在设置里填写。' })
      }
    }

    try {
      const response = await postJson<{
        ok?: boolean
        message?: string
        expireAt?: string | null
        offlineGraceUntil?: string | null
        licenseStatus?: 'active' | 'expired' | 'disabled' | 'invalid'
      }>(`${apiBaseUrl.replace(/\/$/, '')}/api/license/validate`, {
        cardKey: record.cardKey,
        licenseToken: record.licenseToken,
        machineId: this.machineId,
        deviceName: os.hostname(),
        appVersion: app.getVersion()
      })

      if (!response?.ok) {
        const nextRecord: StoredLicenseRecord = {
          ...record,
          expireAt: response?.expireAt ?? record.expireAt,
          offlineGraceUntil: response?.offlineGraceUntil ?? null,
          licenseStatus: response?.licenseStatus ?? 'invalid',
          lastValidatedAt: new Date().toISOString()
        }
        this.saveRecord(nextRecord)
        return {
          ok: false,
          message: response?.message || '授权校验未通过。',
          snapshot: this.buildSnapshot(nextRecord, { message: response?.message || '授权校验未通过。' })
        }
      }

      const nowIso = new Date().toISOString()
      const nextRecord: StoredLicenseRecord = {
        ...record,
        expireAt: response.expireAt ?? record.expireAt,
        offlineGraceUntil: response.offlineGraceUntil ?? this.buildOfflineGraceUntil(),
        lastValidatedAt: nowIso,
        licenseStatus: response.licenseStatus ?? 'active'
      }
      this.saveRecord(nextRecord)
      return {
        ok: true,
        message: response.message || '授权校验成功。',
        snapshot: this.buildSnapshot(nextRecord, { message: response.message || '授权校验成功。' })
      }
    } catch (error) {
      const now = Date.now()
      const graceUntil = toTimestamp(record.offlineGraceUntil)
      if (graceUntil && graceUntil > now) {
        const snapshot = this.buildSnapshot(record, {
          status: 'grace',
          canEnter: true,
          message: '当前无法连接授权服务，已使用离线宽限继续进入。'
        })
        return {
          ok: true,
          message: '当前无法连接授权服务，已使用离线宽限继续进入。',
          snapshot
        }
      }

      return {
        ok: false,
        message: error instanceof Error ? error.message : '授权校验失败。',
        snapshot: this.buildSnapshot(record, {
          status: 'invalid',
          canEnter: false,
          message: error instanceof Error ? error.message : '授权校验失败。'
        })
      }
    }
  }

  async activate(cardKey: string): Promise<LicenseActivateResult> {
    const normalized = cardKey.trim()
    if (!normalized) {
      return {
        ok: false,
        message: '请输入卡密。',
        snapshot: this.getSnapshot()
      }
    }

    const apiBaseUrl = this.getLicenseApiBaseUrl()
    if (!apiBaseUrl) {
      return {
        ok: false,
        message: '授权服务地址尚未配置，请先在设置里填写。',
        snapshot: this.getSnapshot()
      }
    }

    try {
      const response = await postJson<{
        ok?: boolean
        message?: string
        licenseToken?: string
        expireAt?: string | null
        offlineGraceUntil?: string | null
        licenseStatus?: 'active' | 'expired' | 'disabled' | 'invalid'
      }>(`${apiBaseUrl.replace(/\/$/, '')}/api/license/activate`, {
        cardKey: normalized,
        machineId: this.machineId,
        deviceName: os.hostname(),
        appVersion: app.getVersion()
      })

      if (!response?.ok || !response.licenseToken) {
        return {
          ok: false,
          message: response?.message || '卡密激活失败。',
          snapshot: this.getSnapshot()
        }
      }

      const record: StoredLicenseRecord = {
        cardKey: normalized,
        licenseToken: response.licenseToken,
        expireAt: response.expireAt ?? null,
        activatedAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
        offlineGraceUntil: response.offlineGraceUntil ?? this.buildOfflineGraceUntil(),
        machineId: this.machineId,
        licenseStatus: response.licenseStatus ?? 'active'
      }
      this.saveRecord(record)

      const validated = await this.validate()
      return {
        ok: validated.ok,
        message: response.message || validated.message || '卡密激活成功。',
        snapshot: validated.snapshot
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : '卡密激活失败。',
        snapshot: this.getSnapshot()
      }
    }
  }

  clear() {
    this.store.clear()
    return this.getSnapshot()
  }
}
