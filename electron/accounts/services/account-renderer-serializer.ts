import type { AccountJsonProfile, AccountRecord } from '../types'

function pickProfileField(profile: AccountJsonProfile | null | undefined, key: string) {
  return profile?.[key]
}

export function serializeAccountProfileForRenderer(profile: AccountJsonProfile | null | undefined): AccountJsonProfile {
  return {
    first_name: pickProfileField(profile, 'first_name') as string | null | undefined,
    last_name: pickProfileField(profile, 'last_name') as string | null | undefined,
    username: pickProfileField(profile, 'username') as string | null | undefined,
    twoFA: pickProfileField(profile, 'twoFA') as string | null | undefined,
    has_profile_pic: pickProfileField(profile, 'has_profile_pic') as boolean | undefined,
    avatar: pickProfileField(profile, 'avatar') as string | null | undefined,
    is_premium: pickProfileField(profile, 'is_premium') as boolean | undefined,
    premium_expiry: pickProfileField(profile, 'premium_expiry') as string | number | null | undefined,
    premium_until: pickProfileField(profile, 'premium_until') as string | number | null | undefined,
    premium_until_date: pickProfileField(profile, 'premium_until_date') as string | number | null | undefined,
    premiumUntil: pickProfileField(profile, 'premiumUntil') as string | number | null | undefined,
    proxy: pickProfileField(profile, 'proxy') as boolean | string | null | undefined,
    freeze_since_date: pickProfileField(profile, 'freeze_since_date') as string | number | null | undefined,
    freeze_until_date: pickProfileField(profile, 'freeze_until_date') as string | number | null | undefined,
    freeze_appeal_url: pickProfileField(profile, 'freeze_appeal_url') as string | null | undefined,
    check_mode: pickProfileField(profile, 'check_mode') as 'account-status' | 'account-survival' | null | undefined,
    check_error: pickProfileField(profile, 'check_error') as string | null | undefined,
    check_status: pickProfileField(profile, 'check_status') as AccountRecord['status'] | undefined,
    check_duration_ms: pickProfileField(profile, 'check_duration_ms') as number | undefined,
    last_connect_date: pickProfileField(profile, 'last_connect_date') as string | null | undefined,
    bio: pickProfileField(profile, 'bio') as string | null | undefined,
    hasProfilePhoto: pickProfileField(profile, 'hasProfilePhoto') as boolean | undefined
  }
}

export function serializeAccountForRenderer(account: AccountRecord): AccountRecord {
  return {
    ...account,
    profile: serializeAccountProfileForRenderer(account.profile)
  }
}

export function serializeAccountsForRenderer(accounts: AccountRecord[]) {
  return accounts.map(serializeAccountForRenderer)
}
