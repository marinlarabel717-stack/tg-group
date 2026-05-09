import fs from 'node:fs/promises'
import path from 'node:path'
import { inferCountryDisplay, inferPhoneFromText } from '../../../src/lib/phone-country'
import type { AccountJsonProfile, AccountRecord, AccountStatus } from '../types'
import { formatOffsetDate, toUnixSeconds } from './time'

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'bigint') return value.toString()
  }

  return ''
}

function toPlainObject(value: unknown) {
  if (!value || typeof value !== 'object') return {} as Record<string, unknown>
  return value as Record<string, unknown>
}

function buildUsername(rawUsername: string) {
  if (!rawUsername) return ''
  return rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`
}

export class AccountUpdateService {
  private readonly avatarDirectory: string

  constructor(accountsRootPath: string) {
    this.avatarDirectory = path.join(accountsRootPath, 'avatars')
  }

  private toAvatarDataUrl(value: Buffer | string) {
    if (Buffer.isBuffer(value)) {
      return `data:image/jpeg;base64,${value.toString('base64')}`
    }

    if (typeof value === 'string' && value.trim()) {
      return fs.readFile(value).then((buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`)
    }

    return null
  }

  async buildSuccessProfile(args: {
    account: AccountRecord
    client?: any
    liveUser: unknown
    fullUser: unknown
    spambotReply: string
    status: AccountStatus
    checkMode?: 'account-status' | 'account-survival'
    freezeSince?: string | null
    freezeUntil?: string | null
    freezeAppealUrl?: string | null
    durationMs: number
  }) {
    const now = new Date()
    const liveUserRecord = toPlainObject(args.liveUser)
    const fullUserRecord = toPlainObject(args.fullUser)
    const fullUserInner = toPlainObject(fullUserRecord.fullUser)

    const firstName = pickString(liveUserRecord.firstName, liveUserRecord.first_name, args.account.profile.first_name)
    const lastName = pickString(liveUserRecord.lastName, liveUserRecord.last_name, args.account.profile.last_name)
    const rawUsername = pickString(liveUserRecord.username, args.account.profile.username)
    const phone = inferPhoneFromText(pickString(liveUserRecord.phone, args.account.profile.phone, args.account.phone))
    const userId = pickString(liveUserRecord.id, args.account.profile.id, args.account.userId)
    const bio = pickString(fullUserInner.about, args.account.profile.bio)
    const premiumExpiry = pickString(
      liveUserRecord.premiumUntil,
      liveUserRecord.premium_until,
      liveUserRecord.premium_until_date,
      fullUserInner.premiumUntil,
      fullUserInner.premium_until,
      fullUserInner.premium_until_date,
      args.account.profile.premium_expiry
    )
    const avatar = await this.resolveAvatarPath(args.client, args.account, args.liveUser, userId)

    const profile = {
      ...args.account.profile,
      id: userId || args.account.profile.id || '',
      phone,
      username: rawUsername || null,
      first_name: firstName || null,
      last_name: lastName || null,
      bio: bio || null,
      avatar,
      has_profile_pic: Boolean(liveUserRecord.photo ?? args.account.profile.has_profile_pic),
      is_premium: Boolean(liveUserRecord.premium ?? args.account.profile.is_premium),
      premium_expiry: premiumExpiry || null,
      spamblock: args.status === 'alive' ? 'free' : args.status,
      freeze_since_date: args.status === 'frozen' ? args.freezeSince ?? null : null,
      freeze_until_date: args.status === 'frozen' ? args.freezeUntil ?? null : null,
      freeze_appeal_url: args.status === 'frozen' ? args.freezeAppealUrl ?? null : null,
      spambot_reply: args.spambotReply || null,
      session_file: readString(args.account.profile.session_file) || path.basename(args.account.sessionPath, path.extname(args.account.sessionPath)),
      last_connect_date: formatOffsetDate(now),
      last_check_time: toUnixSeconds(now),
      check_mode: args.checkMode ?? 'account-status',
      check_status: args.status,
      check_error: null,
      check_duration_ms: args.durationMs,
      country: inferCountryDisplay(phone, pickString(args.account.profile.country, args.account.country))
    } satisfies AccountJsonProfile

    return {
      phone,
      username: buildUsername(rawUsername),
      userId,
      country: inferCountryDisplay(phone, pickString(args.account.profile.country, args.account.country)),
      lastCheckTime: now.toISOString(),
      lastOnlineTime: now.toISOString(),
      profile
    }
  }

  private async resolveAvatarPath(
    client: any,
    account: AccountRecord,
    liveUser: unknown,
    userId: string
  ) {
    if (!client?.downloadProfilePhoto) {
      return typeof account.profile.avatar === 'string' ? account.profile.avatar : null
    }

    const existingAvatar = typeof account.profile.avatar === 'string' ? account.profile.avatar : null

    try {
      const downloaded = await client.downloadProfilePhoto('me', {
        isBig: false
      })

      if (downloaded) {
        const dataUrl = await this.toAvatarDataUrl(downloaded)
        if (dataUrl) return dataUrl
      }
    } catch {
      // ignore and fallback below
    }

    try {
      const fallbackDownloaded = await client.downloadProfilePhoto(liveUser, {
        isBig: false
      })

      if (fallbackDownloaded) {
        const dataUrl = await this.toAvatarDataUrl(fallbackDownloaded)
        if (dataUrl) return dataUrl
      }
    } catch {
      // ignore and fallback below
    }

    return existingAvatar
  }

  buildFailureProfile(args: {
    account: AccountRecord
    status: AccountStatus
    checkMode?: 'account-status' | 'account-survival'
    errorMessage: string
    durationMs: number
  }) {
    const now = new Date()
    const profile = {
      ...args.account.profile,
      last_check_time: toUnixSeconds(now),
      check_mode: args.checkMode ?? 'account-status',
      check_status: args.status,
      check_error: args.errorMessage || null,
      check_duration_ms: args.durationMs,
      spamblock: args.status === 'timeout' ? args.account.profile.spamblock ?? 'unknown' : args.status,
      spambot_reply: args.account.profile.spambot_reply ?? null,
      country: inferCountryDisplay(args.account.phone, args.account.country)
    } satisfies AccountJsonProfile

    return {
      phone: inferPhoneFromText(args.account.phone),
      username: args.account.username,
      userId: args.account.userId,
      country: inferCountryDisplay(args.account.phone, args.account.country),
      lastCheckTime: now.toISOString(),
      lastOnlineTime: args.status === 'alive' ? now.toISOString() : args.account.lastOnlineTime,
      profile
    }
  }
}
