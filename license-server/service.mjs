import { openLicenseDatabase } from './db.mjs'
import { addDaysIso, maskCardKey, normalizeCardKey, nowIso, randomCardKeyChunk, randomToken, sha256 } from './utils.mjs'

function toTimestamp(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function nextExpiryIso(currentExpireAt, days) {
  const current = toTimestamp(currentExpireAt)
  const base = current && current > Date.now() ? current : Date.now()
  return addDaysIso(days, base)
}

function sanitizeBatchPrefix(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-')
  return normalized.replace(/^-+|-+$/g, '') || 'TG'
}

function buildBatchCardKey(prefix) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `${sanitizeBatchPrefix(prefix)}-${date}-${randomCardKeyChunk(3)}`
}

export class LicenseServerService {
  constructor(db = openLicenseDatabase()) {
    this.db = db
  }

  getLicenseByCardKey(cardKey, data = this.db.read()) {
    return data.licenseKeys.find((item) => item.card_key === normalizeCardKey(cardKey)) || null
  }

  getDevices(licenseId, data = this.db.read()) {
    return data.licenseDevices.filter((item) => item.license_id === licenseId && item.status === 'active')
  }

  getLogsByLicenseId(licenseId, data = this.db.read()) {
    return data.licenseLogs.filter((item) => item.license_id === licenseId).slice().reverse()
  }

  toCardSummary(card, data = this.db.read()) {
    const activeDevices = this.getDevices(card.id, data)
    return {
      id: card.id,
      cardKey: card.card_key,
      cardKeyMasked: maskCardKey(card.card_key),
      status: card.status,
      durationDays: card.duration_days,
      expireAt: card.expire_at,
      maxDevices: card.max_devices,
      activeDeviceCount: activeDevices.length,
      createdAt: card.created_at,
      activatedAt: card.activated_at,
      lastValidatedAt: card.last_validated_at,
      note: card.note || null
    }
  }

  log(data, licenseId, machineId, action, result, message) {
    data.counters.logId += 1
    data.licenseLogs.push({
      id: data.counters.logId,
      license_id: licenseId ?? null,
      machine_id: machineId ?? null,
      action,
      result,
      message: message ?? null,
      created_at: nowIso()
    })
  }

  ensureLicenseUsable(data, license) {
    if (!license) return { ok: false, code: 404, message: '卡密不存在。' }
    if (license.status === 'disabled') return { ok: false, code: 403, message: '卡密已被禁用。' }
    if (license.status === 'expired') return { ok: false, code: 403, message: '卡密已过期。' }
    if (license.expire_at && new Date(license.expire_at).getTime() <= Date.now()) {
      license.status = 'expired'
      return { ok: false, code: 403, message: '卡密已过期。' }
    }
    return { ok: true }
  }

  activate({ cardKey, machineId, deviceName, appVersion }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      const license = this.getLicenseByCardKey(normalizedCardKey, data)
      const check = this.ensureLicenseUsable(data, license)
      if (!check.ok) {
        this.log(data, license?.id ?? null, machineId, 'activate', 'reject', check.message)
        return { ok: false, statusCode: check.code, body: { ok: false, message: check.message } }
      }

      const now = nowIso()
      const devices = this.getDevices(license.id, data)
      let device = devices.find((item) => item.machine_id === machineId)

      if (!device && devices.length >= license.max_devices) {
        const message = '该卡密已达到绑定设备上限。'
        this.log(data, license.id, machineId, 'activate', 'reject', message)
        return { ok: false, statusCode: 403, body: { ok: false, message } }
      }

      let expireAt = license.expire_at
      if (!expireAt) {
        expireAt = addDaysIso(license.duration_days)
        license.expire_at = expireAt
      }
      license.activated_at = license.activated_at || now
      license.last_validated_at = now
      license.status = 'active'

      const licenseToken = randomToken(24)
      const tokenHash = sha256(licenseToken)

      if (device) {
        device.device_name = deviceName || null
        device.app_version = appVersion || null
        device.token_hash = tokenHash
        device.last_validated_at = now
        device.status = 'active'
      } else {
        data.counters.deviceId += 1
        device = {
          id: data.counters.deviceId,
          license_id: license.id,
          machine_id: machineId,
          device_name: deviceName || null,
          app_version: appVersion || null,
          token_hash: tokenHash,
          status: 'active',
          first_activated_at: now,
          last_validated_at: now
        }
        data.licenseDevices.push(device)
      }

      this.log(data, license.id, machineId, 'activate', 'success', `激活成功：${maskCardKey(normalizedCardKey)}`)
      return {
        ok: true,
        statusCode: 200,
        body: {
          ok: true,
          message: '卡密激活成功。',
          licenseToken,
          expireAt,
          offlineGraceUntil: addDaysIso(3),
          licenseStatus: 'active'
        }
      }
    })
  }

  validate({ cardKey, licenseToken, machineId, deviceName, appVersion }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      const license = this.getLicenseByCardKey(normalizedCardKey, data)
      const check = this.ensureLicenseUsable(data, license)
      if (!check.ok) {
        this.log(data, license?.id ?? null, machineId, 'validate', 'reject', check.message)
        return { ok: false, statusCode: check.code, body: { ok: false, message: check.message, licenseStatus: license?.status ?? 'invalid' } }
      }

      const device = data.licenseDevices.find((item) => item.license_id === license.id && item.machine_id === machineId && item.status === 'active')
      if (!device) {
        const message = '当前设备未绑定该卡密。'
        this.log(data, license.id, machineId, 'validate', 'reject', message)
        return { ok: false, statusCode: 403, body: { ok: false, message, licenseStatus: 'invalid' } }
      }

      if (!licenseToken || sha256(licenseToken) !== device.token_hash) {
        const message = '授权令牌无效，请重新激活。'
        this.log(data, license.id, machineId, 'validate', 'reject', message)
        return { ok: false, statusCode: 403, body: { ok: false, message, licenseStatus: 'invalid', expireAt: license.expire_at } }
      }

      const now = nowIso()
      license.last_validated_at = now
      license.status = 'active'
      device.device_name = deviceName || device.device_name
      device.app_version = appVersion || device.app_version
      device.last_validated_at = now
      this.log(data, license.id, machineId, 'validate', 'success', `校验成功：${maskCardKey(normalizedCardKey)}`)

      return {
        ok: true,
        statusCode: 200,
        body: {
          ok: true,
          message: '授权校验成功。',
          expireAt: license.expire_at,
          offlineGraceUntil: addDaysIso(3),
          licenseStatus: 'active'
        }
      }
    })
  }

  createCard({ cardKey, days = 30, maxDevices = 1, note = '' }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      if (data.licenseKeys.some((item) => item.card_key === normalizedCardKey)) {
        throw new Error('卡密已存在。')
      }
      data.counters.licenseId += 1
      const card = {
        id: data.counters.licenseId,
        card_key: normalizedCardKey,
        status: 'active',
        duration_days: Number(days),
        expire_at: null,
        max_devices: Number(maxDevices),
        created_at: nowIso(),
        activated_at: null,
        last_validated_at: null,
        note: note || null
      }
      data.licenseKeys.push(card)
      this.log(data, card.id, null, 'create-card', 'success', `创建卡密：${maskCardKey(normalizedCardKey)}`)
      return this.toCardSummary(card, data)
    })
  }

  createCardsBatch({ prefix = 'TG', count = 10, days = 30, maxDevices = 1, note = '' }) {
    return this.db.transaction((data) => {
      const total = Math.max(1, Math.min(500, Number(count) || 0))
      const items = []
      const existing = new Set(data.licenseKeys.map((item) => item.card_key))
      for (let i = 0; i < total; i += 1) {
        let normalizedCardKey = ''
        let attempts = 0
        do {
          attempts += 1
          normalizedCardKey = normalizeCardKey(buildBatchCardKey(prefix))
        } while (existing.has(normalizedCardKey) && attempts < 20)
        if (!normalizedCardKey || existing.has(normalizedCardKey)) {
          throw new Error('批量生成卡密时出现重复冲突，请重试。')
        }
        existing.add(normalizedCardKey)
        data.counters.licenseId += 1
        const card = {
          id: data.counters.licenseId,
          card_key: normalizedCardKey,
          status: 'active',
          duration_days: Number(days),
          expire_at: null,
          max_devices: Number(maxDevices),
          created_at: nowIso(),
          activated_at: null,
          last_validated_at: null,
          note: note || null
        }
        data.licenseKeys.push(card)
        this.log(data, card.id, null, 'create-card', 'success', `批量创建卡密：${maskCardKey(normalizedCardKey)}`)
        items.push(this.toCardSummary(card, data))
      }
      return items
    })
  }

  listCards() {
    const data = this.db.read()
    return data.licenseKeys.slice().reverse().map((card) => this.toCardSummary(card, data))
  }

  disableCard({ cardKey, disabled = true, note = '' }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      const license = this.getLicenseByCardKey(normalizedCardKey, data)
      if (!license) {
        throw new Error('卡密不存在。')
      }
      license.status = disabled ? 'disabled' : 'active'
      if (note) {
        license.note = note
      }
      this.log(data, license.id, null, disabled ? 'disable-card' : 'enable-card', 'success', `${disabled ? '禁用' : '启用'}卡密：${maskCardKey(normalizedCardKey)}`)
      return this.toCardSummary(license, data)
    })
  }

  extendCard({ cardKey, days = 30, note = '' }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      const license = this.getLicenseByCardKey(normalizedCardKey, data)
      if (!license) {
        throw new Error('卡密不存在。')
      }
      license.expire_at = nextExpiryIso(license.expire_at, Number(days))
      if (license.status === 'expired' || license.status === 'disabled') {
        license.status = 'active'
      }
      if (note) {
        license.note = note
      }
      this.log(data, license.id, null, 'extend-card', 'success', `延期 ${days} 天：${maskCardKey(normalizedCardKey)}`)
      return this.toCardSummary(license, data)
    })
  }

  resetDevices({ cardKey, note = '' }) {
    return this.db.transaction((data) => {
      const normalizedCardKey = normalizeCardKey(cardKey)
      const license = this.getLicenseByCardKey(normalizedCardKey, data)
      if (!license) {
        throw new Error('卡密不存在。')
      }
      let cleared = 0
      const now = nowIso()
      for (const device of data.licenseDevices) {
        if (device.license_id !== license.id || device.status !== 'active') continue
        device.status = 'revoked'
        device.last_validated_at = now
        cleared += 1
      }
      if (note) {
        license.note = note
      }
      this.log(data, license.id, null, 'reset-devices', 'success', `重置绑定设备 ${cleared} 台：${maskCardKey(normalizedCardKey)}`)
      return {
        ...this.toCardSummary(license, data),
        clearedDevices: cleared
      }
    })
  }

  getCard(cardKey) {
    const data = this.db.read()
    const license = this.getLicenseByCardKey(cardKey, data)
    if (!license) {
      throw new Error('卡密不存在。')
    }
    return {
      ...this.toCardSummary(license, data),
      devices: data.licenseDevices.filter((item) => item.license_id === license.id).slice().reverse(),
      logs: this.getLogsByLicenseId(license.id, data)
    }
  }

  listLogs({ cardKey = '', limit = 50 } = {}) {
    const data = this.db.read()
    let logs = data.licenseLogs.slice().reverse()
    if (cardKey) {
      const license = this.getLicenseByCardKey(cardKey, data)
      if (!license) {
        throw new Error('卡密不存在。')
      }
      logs = logs.filter((item) => item.license_id === license.id)
    }
    return logs.slice(0, Math.max(1, Math.min(500, Number(limit) || 50)))
  }
}
