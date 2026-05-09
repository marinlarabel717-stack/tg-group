import type { AccountStatus } from '../types'

export interface SpamBotParseResult {
  status: AccountStatus
  normalizedText: string
  summary: string
  freezeSince?: string | null
  freezeUntil?: string | null
  freezeAppealUrl?: string | null
}

function normalizeTimestamp(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null

  const normalized = trimmed
    .replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?!\s*[+-]\d{2}:?\d{2}|\s*Z)/i, '$1T$2Z')
    .replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?!\s*[+-]\d{2}:?\d{2}|\s*Z)/i, '$1T$2:00Z')
    .replace(/\bUTC\b/i, 'Z')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function extractLabeledDate(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match?.[1]
    if (!value) continue
    const parsed = normalizeTimestamp(value)
    if (parsed) return parsed
  }

  return null
}

function extractFreezeMetadata(replyText: string) {
  const normalizedText = replyText.replace(/\s+/g, ' ').trim()

  const freezeSince = extractLabeledDate(normalizedText, [
    /(?:freeze|frozen)\s*(?:since|from)\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:freeze|frozen|until|to|appeal|https?:\/\/))|$)/i,
    /冻结(?:开始|起始|时间)?\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:冻结|解封|申诉|https?:\/\/))|$)/i
  ])

  const freezeUntil = extractLabeledDate(normalizedText, [
    /(?:freeze|frozen)\s*(?:until|till|to)\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:appeal|https?:\/\/|please|if))|$)/i,
    /(?:unfreeze|release)\s*(?:at|on|time)?\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:appeal|https?:\/\/|please|if))|$)/i,
    /(?:restricted|limited)\s*until\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:appeal|https?:\/\/|please|if))|$)/i,
    /(?:解封|冻结结束|冻结至|到期时间)\s*[:：]?\s*([^。.!\n]+?)(?=(?:\s+(?:申诉|https?:\/\/))|$)/i
  ])

  const freezeAppealUrl = normalizedText.match(/https?:\/\/\S+/i)?.[0] ?? null

  return {
    freezeSince,
    freezeUntil,
    freezeAppealUrl
  }
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
  const metadata = extractFreezeMetadata(replyText)

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedText))) {
      return {
        status: rule.status,
        normalizedText,
        summary: rule.summary,
        freezeSince: rule.status === 'frozen' ? metadata.freezeSince : null,
        freezeUntil: rule.status === 'frozen' ? metadata.freezeUntil : null,
        freezeAppealUrl: rule.status === 'frozen' ? metadata.freezeAppealUrl : null
      }
    }
  }

  return {
    status: 'unknown',
    normalizedText,
    summary: 'SpamBot 回复未命中已知规则',
    freezeSince: null,
    freezeUntil: null,
    freezeAppealUrl: metadata.freezeAppealUrl
  }
}
