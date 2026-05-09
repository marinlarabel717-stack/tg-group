import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { AccountRecord, PremiumExpiryReadResult } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager } from './check-engine/telegram-client-manager'

interface TelegramWebAccountState {
  userId: string
  authKeyHex: string
  authKeyFingerprint: string
  dcId: number
}

interface WindowProbeResult {
  hasAuthForm: boolean
  hasMainContent: boolean
}

interface PremiumPageSnapshot {
  url: string
  title: string
  rawText: string
  premiumVisible: boolean
  expiry: string | null
}

const TELEGRAM_WEB_URL = 'https://web.telegram.org/a/'
const TELEGRAM_WEB_BOOT_DELAY_MS = 3000
const TELEGRAM_WEB_PREMIUM_HASH_CANDIDATES = [
  '#settings/premium',
  '#/settings/premium',
  '#telegram-premium',
  '#/telegram-premium',
  '#premium',
  '#/premium'
] as const
const ZERO_SERVER_SALT = '0000000000000000'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function encodeWebAuthPayload(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function randomHex(length: number) {
  const alphabet = '0123456789abcdef'
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return output
}

function normalizeUserId(value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const normalized = value.toString().trim()
    return normalized || ''
  }
  return ''
}

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

function resolvePremiumExpiryFromText(text: string) {
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

function formatPremiumReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('session_revoked') || lower.includes('auth_key_unregistered') || lower.includes('session expired')) {
    return '当前账号 Session 已失效，无法在后台登录 Telegram Web 读取会员时间。'
  }
  if (lower.includes('not authorized') || lower.includes('unauthorized')) {
    return '当前账号 Session 未登录，无法在后台登录 Telegram Web。'
  }
  if (lower.includes('auth_key_duplicated')) {
    return '当前账号存在多 IP / Session 冲突，后台 Telegram Web 读取失败。'
  }
  if (lower.includes('timeout')) {
    return '后台 Telegram Web 读取超时，请稍后重试。'
  }
  return `后台 Telegram Web 读取失败：${message}`
}

export class TelegramDesktopPremiumService {
  private readonly debugDirectory: string

  constructor(
    accountsRootPath: string,
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly preloadPath: string
  ) {
    this.debugDirectory = path.join(accountsRootPath, 'web-premium-debug')
  }

  async readPremiumExpiry(account: AccountRecord): Promise<PremiumExpiryReadResult> {
    await fs.mkdir(this.debugDirectory, { recursive: true })
    const webState = await this.buildWebAccountState(account)
    const partition = `telegram-web-premium-${account.id}-${Date.now()}`
    const window = new BrowserWindow({
      width: 1280,
      height: 920,
      minWidth: 980,
      minHeight: 720,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#08101d',
      title: `${account.phone || '账号'} - Telegram Web Premium`,
      webPreferences: {
        partition,
        preload: this.preloadPath,
        additionalArguments: [`--tg-web-auth=${encodeWebAuthPayload(this.buildWindowPayload(webState))}`],
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false
      }
    })

    const session = window.webContents.session

    try {
      await this.bootstrapAuthenticatedWindow(window, webState)
      const snapshot = await this.readPremiumPage(window)

      if (snapshot.expiry) {
        return {
          ok: true,
          premiumExpiry: snapshot.expiry,
          message: '已从后台 Telegram Web 读取会员到期时间',
          rawText: trimRawText(snapshot.rawText),
          screenshotPath: null
        }
      }

      const screenshotPath = await this.captureDebugScreenshot(window, account.id)
      return {
        ok: false,
        premiumExpiry: null,
        message: '已在后台打开 Telegram Web Premium 页面，但暂未识别到到期时间。',
        rawText: trimRawText(snapshot.rawText),
        screenshotPath
      }
    } catch (error) {
      return {
        ok: false,
        premiumExpiry: null,
        message: formatPremiumReadError(error),
        rawText: null,
        screenshotPath: null
      }
    } finally {
      if (!window.isDestroyed()) {
        window.destroy()
      }
      try {
        await session.clearStorageData()
      } catch {
        // ignore hidden session cleanup failures
      }
    }
  }

  private async buildWebAccountState(account: AccountRecord): Promise<TelegramWebAccountState> {
    const sourceSession = await this.sessionLoader.load(account.sessionPath)
    const sourceClient = this.clientManager.createClient(sourceSession)

    try {
      await sourceClient.connect()
      const authorized = await sourceClient.isUserAuthorized()
      if (!authorized) {
        throw new Error('not authorized')
      }

      const me = await sourceClient.getMe()
      const userId = normalizeUserId(me?.id ?? account.userId)
      if (!userId) {
        throw new Error('missing user id')
      }

      const sessionState = sourceSession as any
      const dcId = Number(sessionState?.dcId ?? sessionState?._dcId ?? 0)
      if (!dcId) {
        throw new Error('missing session dc id')
      }

      const authKey = sessionState?.getAuthKey?.(dcId) ?? sessionState?.authKey
      const authKeyHex = authKey?.getKey?.()?.toString('hex')
      if (!authKeyHex) {
        throw new Error('missing session auth key')
      }

      return {
        userId,
        authKeyHex,
        authKeyFingerprint: authKeyHex.slice(0, 8),
        dcId
      }
    } finally {
      await this.clientManager.destroyClient(sourceClient)
    }
  }

  private buildWindowPayload(state: TelegramWebAccountState) {
    return {
      dcId: state.dcId,
      userId: state.userId,
      authKeyHex: state.authKeyHex,
      authKeyFingerprint: state.authKeyFingerprint,
      serverSalt: ZERO_SERVER_SALT
    }
  }

  private async bootstrapAuthenticatedWindow(window: BrowserWindow, state: TelegramWebAccountState) {
    await window.loadURL(TELEGRAM_WEB_URL)
    await sleep(TELEGRAM_WEB_BOOT_DELAY_MS)
    await this.patchWindowAuthState(window, state)
    await window.webContents.executeJavaScript('location.reload()')
    await sleep(4000)

    const probe = await this.probeWindow(window)
    if (probe.hasAuthForm && !probe.hasMainContent) {
      await this.patchWindowAuthState(window, state)
      await window.webContents.executeJavaScript('location.reload()')
      await sleep(3500)
    }

    await this.waitForMainContent(window)
  }

  private async readPremiumPage(window: BrowserWindow) {
    let bestSnapshot = await this.capturePremiumSnapshot(window)
    if (bestSnapshot.expiry) return bestSnapshot

    for (const hash of TELEGRAM_WEB_PREMIUM_HASH_CANDIDATES) {
      await window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`)
      await sleep(2200)
      const snapshot = await this.capturePremiumSnapshot(window)
      if (snapshot.rawText.length > bestSnapshot.rawText.length) {
        bestSnapshot = snapshot
      }
      if (snapshot.expiry) return snapshot
    }

    const navigated = await this.navigateToPremiumViaUi(window)
    if (navigated) {
      await sleep(2600)
      const snapshot = await this.capturePremiumSnapshot(window)
      if (snapshot.rawText.length > bestSnapshot.rawText.length) {
        bestSnapshot = snapshot
      }
      if (snapshot.expiry) return snapshot
    }

    return bestSnapshot
  }

  private async capturePremiumSnapshot(window: BrowserWindow): Promise<PremiumPageSnapshot> {
    const snapshot = await window.webContents.executeJavaScript(`(() => {
      const bodyText = document.body?.innerText || ''
      const text = bodyText.replace(/\u00A0/g, ' ').replace(/\r/g, '')
      const premiumVisible = /(telegram premium|premium|高级会员|会员)/i.test(text)
      return {
        url: location.href,
        title: document.title,
        rawText: text,
        premiumVisible
      }
    })()`) as Omit<PremiumPageSnapshot, 'expiry'>

    return {
      ...snapshot,
      expiry: resolvePremiumExpiryFromText(snapshot.rawText)
    }
  }

  private async navigateToPremiumViaUi(window: BrowserWindow) {
    return window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }
      const textOf = (element) => [
        element.textContent || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || ''
      ].join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
      const clickByPatterns = (patterns) => {
        const elements = Array.from(document.querySelectorAll('button, [role="button"], a, .Button, .ListItem, .MenuItem, .sidebar-left-section-content *'))
        const target = elements.find((element) => visible(element) && patterns.some((pattern) => textOf(element).includes(pattern)))
        if (!(target instanceof HTMLElement)) return false
        target.click()
        return true
      }

      if (clickByPatterns(['telegram premium', 'premium', 'telegram 会员', '会员'])) {
        return true
      }

      if (clickByPatterns(['settings', '设置'])) {
        await sleep(900)
        if (clickByPatterns(['telegram premium', 'premium', 'telegram 会员', '会员'])) {
          return true
        }
      }

      const menuButton = document.querySelector('button[aria-label*="menu" i], button[title*="menu" i], .btn-menu, .menu-button, .Button.smaller.round')
      if (menuButton instanceof HTMLElement) {
        menuButton.click()
        await sleep(700)
      }

      if (clickByPatterns(['settings', '设置'])) {
        await sleep(900)
        if (clickByPatterns(['telegram premium', 'premium', 'telegram 会员', '会员'])) {
          return true
        }
      }

      return false
    })()`) as Promise<boolean>
  }

  private async captureDebugScreenshot(window: BrowserWindow, accountId: number) {
    const image = await window.webContents.capturePage()
    const screenshotPath = path.join(this.debugDirectory, `premium-web-${accountId}-${Date.now()}.png`)
    await fs.writeFile(screenshotPath, image.toPNG())
    return screenshotPath
  }

  private async patchWindowAuthState(window: BrowserWindow, state: TelegramWebAccountState) {
    const serverSalt = ZERO_SERVER_SALT === '0000000000000000' ? randomHex(16) : ZERO_SERVER_SALT
    const script = `(() => {
      const dcId = ${JSON.stringify(state.dcId)}
      const authKeyHex = ${JSON.stringify(state.authKeyHex)}
      const fingerprint = ${JSON.stringify(state.authKeyFingerprint)}
      const userId = ${JSON.stringify(state.userId)}
      const serverSalt = ${JSON.stringify(serverSalt)}
      const keysToClear = ['dc', 'server_time_offset', 'xt_instance', 'user_auth', 'auth_key_fingerprint', 'number_of_accounts', 'current_account', 'previous_account', 'tt-multitab_1', 'loglevel', 'k_build', 'kz_version', 'tgme_sync', 'state_id']
      for (let i = 1; i <= 5; i += 1) {
        keysToClear.push('dc' + i + '_auth_key', 'dc' + i + '_server_salt', 'dc' + i + '_hash', 'account' + i)
      }
      for (const key of keysToClear) {
        localStorage.removeItem(key)
      }

      localStorage.setItem('dc', String(dcId))
      localStorage.setItem('dc' + dcId + '_auth_key', '\"' + authKeyHex + '\"')
      localStorage.setItem('dc' + dcId + '_server_salt', '\"' + serverSalt + '\"')
      localStorage.setItem('auth_key_fingerprint', '\"' + fingerprint + '\"')
      localStorage.setItem('user_auth', JSON.stringify({ dcID: dcId, id: String(userId) }))
      localStorage.setItem('k_build', '589')
      localStorage.setItem('kz_version', '\"K\"')
      localStorage.setItem('number_of_accounts', '1')
      localStorage.setItem('server_time_offset', '0')
      localStorage.setItem('tt-multitab_1', '1')
      localStorage.setItem('loglevel', 'SILENT')
      localStorage.setItem('state_id', String(Math.floor(Math.random() * 0xFFFFFFFF) >>> 0))
      localStorage.setItem('xt_instance', JSON.stringify({ id: Math.floor(Math.random() * 1e8), idle: false, time: Date.now() }))
      localStorage.setItem('tgme_sync', JSON.stringify({ canRedirect: true, ts: Math.floor(Date.now() / 1000) }))
    })()`

    await window.webContents.executeJavaScript(script)
  }

  private async waitForMainContent(window: BrowserWindow) {
    let observedAuthForm = false

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (window.isDestroyed()) return false

      const probe = await this.probeWindow(window)
      observedAuthForm ||= probe.hasAuthForm

      if (probe.hasMainContent || (observedAuthForm && !probe.hasAuthForm)) {
        return true
      }

      await sleep(500)
    }

    throw new Error('timeout')
  }

  private async probeWindow(window: BrowserWindow): Promise<WindowProbeResult> {
    return window.webContents.executeJavaScript(`(() => ({
      hasAuthForm: Boolean(document.querySelector('#auth-qr-form, .auth-form, .qr-code, .page-signQR, .page-sign')),
      hasMainContent: Boolean(document.querySelector('#Main, #LeftColumn, .LeftColumn, .chatlist-container, .im_page_wrap, .chat-background, .sidebar-left-section-content'))
    }))()`)
  }
}
