const STORAGE_KEYS_TO_CLEAR = [
  'account1',
  'account2',
  'account3',
  'account4',
  'auth_key_fingerprint',
  'current_account',
  'dc',
  'number_of_accounts',
  'previous_account',
  'server_time_offset',
  'user_auth',
  'xt_instance'
]

for (let dcId = 1; dcId <= 5; dcId += 1) {
  STORAGE_KEYS_TO_CLEAR.push(`dc${dcId}_auth_key`)
  STORAGE_KEYS_TO_CLEAR.push(`dc${dcId}_server_salt`)
  STORAGE_KEYS_TO_CLEAR.push(`dc${dcId}_hash`)
}

function parsePayload() {
  const argument = process.argv.find((item) => item.startsWith('--tg-web-auth='))
  if (!argument) return null

  try {
    const encoded = argument.slice('--tg-web-auth='.length)
    const json = Buffer.from(encoded, 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function applyTelegramWebAuth() {
  if (location.hostname !== 'web.telegram.org') return

  const payload = parsePayload()
  if (!payload || typeof payload !== 'object') return

  try {
    const marker = '__tg_group_web_auth_injected__'
    const signature = JSON.stringify(payload.user_auth ?? payload.account1 ?? {})
    if (localStorage.getItem(marker) === signature) {
      return
    }

    for (const key of STORAGE_KEYS_TO_CLEAR) {
      localStorage.removeItem(key)
    }

    for (const [key, value] of Object.entries(payload)) {
      localStorage.setItem(key, JSON.stringify(value))
    }

    localStorage.setItem(marker, signature)
  } catch {
    // ignore preload storage injection errors and let page fall back to normal auth flow
  }
}

applyTelegramWebAuth()
