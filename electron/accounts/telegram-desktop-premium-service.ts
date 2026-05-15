import fs from 'node:fs/promises'
import path from 'node:path'
import type { AccountRecord, PremiumExpiryReadResult } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager, type AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { getTelegramModule } from './check-engine/gramjs-runtime'
import { TelethonPremiumReader } from './telethon-premium-reader'
import { ProxyPoolService } from '../proxy-pool/service'

function trimRawText(value?: string | null) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 1600) : null
}

function sanitizeExtractedExpiry(value: string) {
  const trimmed = value.replace(/^[\s:：-]+|[\s。.!！]+$/g, '').trim()
  if (!trimmed) return null

  const patterns = [
    /\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/,
    /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/,
    /\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?/,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/i,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/i
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match?.[0]) return match[0].trim()
  }

  return trimmed.slice(0, 80)
}

export function resolvePremiumExpiryFromText(text: string) {
  if (!text) return null

  const normalized = text.replace(/\u00A0/g, ' ').replace(/\r/g, '')
  const patterns = [
    /(?:it\s+)?expires?\s+on\s*[:：]?\s*([^\n]+)/i,
    /renews?\s+on\s*[:：]?\s*([^\n]+)/i,
    /valid\s+until\s*[:：]?\s*([^\n]+)/i,
    /subscription\s+until\s*[:：]?\s*([^\n]+)/i,
    /到期(?:时间)?\s*[:：]?\s*([^\n]+)/i,
    /有效期至\s*[:：]?\s*([^\n]+)/i,
    /会员(?:将)?于\s*([^\n]+?)\s*到期/i,
    /将于\s*([^\n]+?)\s*到期/i
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const candidate = match?.[1] ? sanitizeExtractedExpiry(match[1]) : null
    if (candidate) return candidate
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/(expires?|renews?|valid until|subscription until|到期|有效期|会员)/i.test(line)) continue

    const candidate = sanitizeExtractedExpiry(`${line} ${lines[index + 1] ?? ''}`)
    if (candidate && candidate !== line) return candidate
  }

  return null
}

export function formatPremiumReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('session_revoked') || lower.includes('auth_key_unregistered') || lower.includes('session expired')) {
    return '当前账号 Session 已失效，无法通过 MTProto 读取会员时间。'
  }
  if (lower.includes('not authorized') || lower.includes('unauthorized')) {
    return '当前账号 Session 未登录，无法通过 MTProto 读取会员时间。'
  }
  if (lower.includes('auth_key_duplicated')) {
    return '当前账号存在多 IP / Session 冲突，MTProto 读取失败。'
  }
  if (lower.includes('timeout')) {
    return 'MTProto 读取会员时间超时，请稍后重试。'
  }
  return `MTProto 读取会员时间失败：${message}`
}

async function maybeWriteDebugText(debugDirectory: string, accountId: number, statusText: string) {
  await fs.mkdir(debugDirectory, { recursive: true })
  const debugPath = path.join(debugDirectory, `premium-promo-${accountId}-${Date.now()}.txt`)
  await fs.writeFile(debugPath, statusText || '', 'utf8')
  return debugPath
}

export async function readPremiumExpiryViaClient(
  client: { invoke: (request: any) => Promise<any> },
  options?: { debugDirectory?: string; accountId?: number }
): Promise<PremiumExpiryReadResult> {
  try {
    const { Api } = getTelegramModule()
    const response = await client.invoke(new Api.help.GetPremiumPromo())
    const statusText = typeof (response as any)?.statusText === 'string' ? (response as any).statusText : ''
    const expiry = resolvePremiumExpiryFromText(statusText)

    if (expiry) {
      return {
        ok: true,
        premiumExpiry: expiry,
        message: '已从 MTProto 的 Premium 状态文本读取到到期时间',
        rawText: trimRawText(statusText),
        screenshotPath: null
      }
    }

    const debugPath = options?.debugDirectory && options.accountId
      ? await maybeWriteDebugText(options.debugDirectory, options.accountId, statusText)
      : null

    return {
      ok: false,
      premiumExpiry: null,
      message: statusText
        ? '已拿到 Premium 状态文本，但暂未从中解析出到期时间。'
        : 'Telegram 当前没有返回可解析的 Premium 状态文本。',
      rawText: trimRawText(statusText),
      screenshotPath: debugPath
    }
  } catch (error) {
    return {
      ok: false,
      premiumExpiry: null,
      message: formatPremiumReadError(error),
      rawText: null,
      screenshotPath: null
    }
  }
}

export class TelegramDesktopPremiumService {
  private readonly debugDirectory: string

  constructor(
    accountsRootPath: string,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly telethonPremiumReader: TelethonPremiumReader,
    private readonly proxyPoolService: ProxyPoolService
  ) {
    this.debugDirectory = path.join(accountsRootPath, 'premium-promo-debug')
  }

  private getCurrentProxy(): AccountClientProxyOptions | null {
    if (!this.proxyPoolService.isEnabled()) {
      return null
    }

    const proxy = this.proxyPoolService.getAccountCheckProxy()
    if (!proxy) {
      throw new Error('GLOBAL_PROXY_REQUIRED')
    }

    return {
      type: proxy.type,
      ip: proxy.host,
      port: proxy.port,
      username: proxy.username ?? null,
      password: proxy.password ?? null,
      ipVersion: proxy.ipVersion
    }
  }

  async readPremiumExpiry(account: AccountRecord): Promise<PremiumExpiryReadResult> {
    const proxy = this.getCurrentProxy()

    if (this.telethonPremiumReader.isAvailable()) {
      const telethonResult = await this.telethonPremiumReader.read(account, proxy)
      if (telethonResult) {
        return telethonResult
      }
    }

    const session = await this.sessionLoader.load(account.sessionPath)
    const client = this.clientManager.createClient(session, { proxy })

    try {
      await client.connect()
      const authorized = await client.isUserAuthorized()
      if (!authorized) {
        throw new Error('not authorized')
      }

      return await readPremiumExpiryViaClient(client, {
        debugDirectory: this.debugDirectory,
        accountId: account.id
      })
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }
}
