import path from 'node:path'
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

function buildDisplayName(firstName: string, lastName: string) {
  return [firstName, lastName].filter(Boolean).join(' ').trim()
}

export class AccountUpdateService {
  buildSuccessProfile(args: {
    account: AccountRecord
    liveUser: unknown
    fullUser: unknown
    spambotReply: string
    status: AccountStatus
    durationMs: number
  }) {
    const now = new Date()
    const liveUserRecord = toPlainObject(args.liveUser)
    const fullUserRecord = toPlainObject(args.fullUser)
    const fullUserInner = toPlainObject(fullUserRecord.fullUser)

    const firstName = pickString(liveUserRecord.firstName, liveUserRecord.first_name, args.account.profile.first_name)
    const lastName = pickString(liveUserRecord.lastName, liveUserRecord.last_name, args.account.profile.last_name)
    const rawUsername = pickString(liveUserRecord.username, args.account.profile.username)
    const phone = pickString(liveUserRecord.phone, args.account.profile.phone, args.account.phone)
    const userId = pickString(liveUserRecord.id, args.account.profile.id, args.account.userId)
    const bio = pickString(fullUserInner.about, args.account.profile.bio)
    const profile = {
      ...args.account.profile,
      id: userId || args.account.profile.id || '',
      phone,
      username: rawUsername || null,
      first_name: firstName || null,
      last_name: lastName || null,
      bio: bio || null,
      has_profile_pic: Boolean(liveUserRecord.photo ?? args.account.profile.has_profile_pic),
      is_premium: Boolean(liveUserRecord.premium ?? args.account.profile.is_premium),
      spamblock: args.status === 'alive' ? 'free' : args.status,
      spambot_reply: args.spambotReply || null,
      session_file: readString(args.account.profile.session_file) || path.basename(args.account.sessionPath, path.extname(args.account.sessionPath)),
      last_connect_date: formatOffsetDate(now),
      last_check_time: toUnixSeconds(now),
      check_status: args.status,
      check_error: null,
      check_duration_ms: args.durationMs
    } satisfies AccountJsonProfile

    return {
      phone,
      username: buildUsername(rawUsername) || buildDisplayName(firstName, lastName),
      userId,
      country: pickString(args.account.profile.country, args.account.country),
      lastCheckTime: now.toISOString(),
      lastOnlineTime: now.toISOString(),
      profile
    }
  }

  buildFailureProfile(args: {
    account: AccountRecord
    status: AccountStatus
    errorMessage: string
    durationMs: number
  }) {
    const now = new Date()
    const profile = {
      ...args.account.profile,
      last_check_time: toUnixSeconds(now),
      check_status: args.status,
      check_error: args.errorMessage || null,
      check_duration_ms: args.durationMs,
      spamblock: args.status === 'timeout' ? args.account.profile.spamblock ?? 'unknown' : args.status,
      spambot_reply: args.account.profile.spambot_reply ?? null
    } satisfies AccountJsonProfile

    return {
      phone: args.account.phone,
      username: args.account.username,
      userId: args.account.userId,
      country: args.account.country,
      lastCheckTime: now.toISOString(),
      lastOnlineTime: args.status === 'alive' ? now.toISOString() : args.account.lastOnlineTime,
      profile
    }
  }
}
