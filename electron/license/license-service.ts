import { app } from 'electron'
import { createHash } from 'node:crypto'
import os from 'node:os'
import type { LicenseActivateResult, LicenseSnapshot, StoredLicenseRecord } from './types'
import { LicenseStore } from './license-store'

const LICENSE_API_BASE_URL = (process.env.LICENSE_API_BASE_URL || '').trim()

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

  constructor(private readonly store: LicenseStore) {}

  getSnapshot(): LicenseSnapshot {
    const record = this.store.get()
    const now = Date.now()
    const expireAt = toTimestamp(record?.expireAt)
    const graceUntil = toTimestamp(record?.offlineGraceUntil)

    if (!record) {
      return {
        status: 'missing',
        canEnter: false,
        machineId: this.machineId,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        devBypassAvailable: !app.isPackaged,
        apiConfigured: Boolean(LICENSE_API_BASE_URL),
        cardKeyMasked: null,
        expireAt: null,
        activatedAt: null,
        lastValidatedAt: null,
        offlineGraceUntil: null,
        message: LICENSE_API_BASE_URL
          ? '请输入卡密完成激活。'
          : '授权服务地址尚未配置，当前仅完成本地授权骨架。'
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
        apiConfigured: Boolean(LICENSE_API_BASE_URL),
        cardKeyMasked: maskCardKey(record.cardKey),
        expireAt: record.expireAt,
        activatedAt: record.activatedAt,
        lastValidatedAt: record.lastValidatedAt,
        offlineGraceUntil: record.offlineGraceUntil,
        message: '当前授权状态无效，请重新激活。'
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
          apiConfigured: Boolean(LICENSE_API_BASE_URL),
          cardKeyMasked: maskCardKey(record.cardKey),
          expireAt: record.expireAt,
          activatedAt: record.activatedAt,
          lastValidatedAt: record.lastValidatedAt,
          offlineGraceUntil: record.offlineGraceUntil,
          message: '授权已进入离线宽限期，请尽快联网校验。'
        }
      }

      return {
        status: 'expired',
        canEnter: false,
        machineId: this.machineId,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        devBypassAvailable: !app.isPackaged,
        apiConfigured: Boolean(LICENSE_API_BASE_URL),
        cardKeyMasked: maskCardKey(record.cardKey),
        expireAt: record.expireAt,
        activatedAt: record.activatedAt,
        lastValidatedAt: record.lastValidatedAt,
        offlineGraceUntil: record.offlineGraceUntil,
        message: '授权已过期，请重新激活。'
      }
    }

    return {
      status: 'valid',
      canEnter: true,
      machineId: this.machineId,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      devBypassAvailable: !app.isPackaged,
      apiConfigured: Boolean(LICENSE_API_BASE_URL),
      cardKeyMasked: maskCardKey(record.cardKey),
      expireAt: record.expireAt,
      activatedAt: record.activatedAt,
      lastValidatedAt: record.lastValidatedAt,
      offlineGraceUntil: record.offlineGraceUntil,
      message: '授权有效。'
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

    if (!LICENSE_API_BASE_URL) {
      return {
        ok: false,
        message: '授权服务地址尚未配置，下一步接入卡密服务端后即可激活。',
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
      }>(`${LICENSE_API_BASE_URL.replace(/\/$/, '')}/api/license/activate`, {
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
        offlineGraceUntil: response.offlineGraceUntil ?? null,
        machineId: this.machineId,
        licenseStatus: response.licenseStatus ?? 'active'
      }
      this.store.set(record)

      return {
        ok: true,
        message: response.message || '卡密激活成功。',
        snapshot: this.getSnapshot()
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

