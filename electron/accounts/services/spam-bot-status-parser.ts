import type { AccountStatus } from '../types'

const RULES: Array<{ status: AccountStatus; patterns: RegExp[] }> = [
  {
    status: 'session_expired',
    patterns: [/auth_key_unregistered/i, /session_(?:expired|revoked|password_needed)/i, /session.*失效/i]
  },
  {
    status: 'multi_ip',
    patterns: [/multiple\s+ip/i, /different\s+ip/i, /many\s+locations/i, /多\s*ip/i, /异地登录/i]
  },
  {
    status: 'banned',
    patterns: [/phone number.*banned/i, /this number is banned/i, /账号已封禁/i, /封禁/i]
  },
  {
    status: 'frozen',
    patterns: [/frozen/i, /read-only/i, /冻结/i, /deactivated/i]
  },
  {
    status: 'temporary_limited',
    patterns: [/temporar(?:y|ily)/i, /for now/i, /暂时.*限制/i, /临时.*双向/i]
  },
  {
    status: 'limited',
    patterns: [
      /limited/i,
      /cannot send messages/i,
      /some phone numbers may not receive your messages/i,
      /双向限制/i,
      /被限制/i
    ]
  },
  {
    status: 'alive',
    patterns: [/no limits are currently applied/i, /good news/i, /free as a bird/i, /没有限制/i, /一切正常/i]
  },
  {
    status: 'timeout_unchecked',
    patterns: [/timeout/i, /timed out/i, /未检测/i, /no response/i]
  }
]

export function parseSpamBotStatus(replyText: string): AccountStatus {
  const normalizedText = replyText.replace(/\s+/g, ' ').trim()

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return rule.status
    }
  }

  return 'unknown'
}
