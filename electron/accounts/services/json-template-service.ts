import fs from 'node:fs/promises'
import path from 'node:path'
import type { AccountJsonProfile } from '../types'

const DEFAULT_JSON_TEMPLATE: AccountJsonProfile = {
  app_id: 2040,
  app_hash: 'b18441a1ff607e10a989891a5462e627',
  sdk: 'Windows 11 x64',
  device: 'NWQAE',
  app_version: '6.7.8 x64',
  lang_pack: 'en',
  system_lang_pack: 'en-US',
  twoFA: null,
  role: null,
  id: '',
  phone: '',
  username: null,
  date_of_birth: null,
  date_of_birth_integrity: null,
  is_premium: false,
  premium_expiry: null,
  first_name: null,
  last_name: null,
  has_profile_pic: false,
  spamblock: 'unknown',
  spamblock_end_date: null,
  session_file: '',
  stats_spam_count: 0,
  stats_invites_count: 0,
  last_connect_date: null,
  session_created_date: null,
  app_config_hash: null,
  extra_params: null,
  register_time: null,
  last_check_time: null,
  avatar: null,
  sex: null,
  proxy: null,
  ipv6: false
}

function inferPhoneFromBaseName(baseName: string) {
  return /^\d{5,}$/.test(baseName) ? baseName : ''
}

function formatOffsetDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absoluteOffset / 60))
  const offsetMins = pad(absoluteOffset % 60)

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}${offsetMins}`
}

function normalizeProfile(value: unknown): AccountJsonProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_JSON_TEMPLATE }
  }

  return {
    ...DEFAULT_JSON_TEMPLATE,
    ...(value as AccountJsonProfile)
  }
}

export class JsonTemplateService {
  async readProfile(jsonPath: string) {
    const raw = await fs.readFile(jsonPath, 'utf8')
    return normalizeProfile(JSON.parse(raw))
  }

  buildTemplate(sessionPath: string, partial?: AccountJsonProfile): AccountJsonProfile {
    const baseName = path.basename(sessionPath, path.extname(sessionPath))
    const now = new Date()
    const nowUnix = Math.floor(now.getTime() / 1000)
    const normalizedPhone = typeof partial?.phone === 'string' && partial.phone.trim() ? partial.phone.trim() : inferPhoneFromBaseName(baseName)

    return {
      ...DEFAULT_JSON_TEMPLATE,
      ...partial,
      id: partial?.id ?? '',
      phone: normalizedPhone,
      username: partial?.username ?? null,
      date_of_birth: partial?.date_of_birth ?? null,
      date_of_birth_integrity: partial?.date_of_birth_integrity ?? null,
      premium_expiry: partial?.premium_expiry ?? null,
      first_name: partial?.first_name ?? null,
      last_name: partial?.last_name ?? null,
      spamblock: partial?.spamblock ?? 'unknown',
      spamblock_end_date: partial?.spamblock_end_date ?? null,
      session_file: partial?.session_file ?? baseName,
      last_connect_date: partial?.last_connect_date ?? null,
      session_created_date: partial?.session_created_date ?? formatOffsetDate(now),
      app_config_hash: partial?.app_config_hash ?? null,
      extra_params: partial?.extra_params ?? null,
      register_time: partial?.register_time ?? nowUnix,
      last_check_time: partial?.last_check_time ?? nowUnix,
      avatar: partial?.avatar ?? null,
      sex: partial?.sex ?? null,
      proxy: partial?.proxy ?? null,
      ipv6: partial?.ipv6 ?? false
    }
  }

  async ensureJsonForSession(sessionPath: string, existingJsonPath: string | null) {
    if (existingJsonPath) {
      return { jsonPath: existingJsonPath, generated: false }
    }

    const resolvedSessionPath = path.resolve(sessionPath)
    const jsonPath = resolvedSessionPath.replace(/\.session$/i, '.json')
    const template = this.buildTemplate(resolvedSessionPath)

    await fs.writeFile(jsonPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
    return { jsonPath, generated: true }
  }
}
