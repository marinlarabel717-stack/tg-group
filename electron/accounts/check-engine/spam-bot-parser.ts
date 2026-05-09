import type { AccountStatus } from '../types'

export interface SpamBotParseResult {
  status: AccountStatus
  normalizedText: string
  summary: string
}

const RULES: Array<{ status: AccountStatus; summary: string; patterns: RegExp[] }> = [
  {
    status: 'frozen',
    summary: '账号处于冻结状态',
    patterns: [/frozen/i, /freeze state/i, /account frozen/i, /已冻结/i, /冻结/i]
  },
  {
    status: 'multi_ip',
    summary: 'SpamBot 提示存在多 IP / 异地登录风险',
    patterns: [/multiple\s+ip/i, /different\s+ip/i, /many\s+locations/i, /多\s*ip/i, /异地登录/i]
  },
  {
    status: 'banned',
    summary: 'SpamBot 判定该账号已封禁',
    patterns: [/phone number.*banned/i, /this number is banned/i, /账号已封禁/i, /封禁/i]
  },
  {
    status: 'temporary_limited',
    summary: 'SpamBot 判定为临时双向限制',
    patterns: [/temporar(?:y|ily)/i, /for now/i, /暂时.*限制/i, /临时.*双向/i]
  },
  {
    status: 'limited',
    summary: 'SpamBot 判定为双向限制',
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
    summary: 'SpamBot 判定账号当前无发信限制',
    patterns: [/no limits are currently applied/i, /good news/i, /free as a bird/i, /没有限制/i, /一切正常/i]
  }
]

export function parseSpamBotReply(replyText: string): SpamBotParseResult {
  const normalizedText = replyText.replace(/\s+/g, ' ').trim()

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return {
        status: rule.status,
        normalizedText,
        summary: rule.summary
      }
    }
  }

  return {
    status: 'unknown',
    normalizedText,
    summary: 'SpamBot 回复未命中已知规则'
  }
}
