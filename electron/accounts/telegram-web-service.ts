import { BrowserWindow, dialog } from 'electron'
import type { AccountRecord } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { type AccountClientProxyOptions, TelegramClientManager } from './check-engine/telegram-client-manager'
import { type AccountCheckProxy, ProxyPoolService } from '../proxy-pool/service'

interface TelegramWebAccountState {
  userId: string
  authKeyHex: string
  authKeyFingerprint: string
  dcId: number
  date: number
}

interface WindowProbeResult {
  hasAuthForm: boolean
  hasMainContent: boolean
}

const TELEGRAM_WEB_URL = 'https://web.telegram.org/a/'
const TELEGRAM_WEB_BOOT_DELAY_MS = 3000
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

function formatWebLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('session_revoked') || lower.includes('auth_key_unregistered') || lower.includes('session expired')) {
    return '当前账号 Session 已失效，无法直接注入到 Telegram Web。'
  }
  if (lower.includes('not authorized') || lower.includes('unauthorized')) {
    return '当前账号 Session 未登录，无法直接打开已登录的 Telegram Web。'
  }
  if (lower.includes('auth_key_duplicated')) return '当前账号存在多 IP / Session 冲突，Telegram Web 自动注入失败。'
  if (lower.includes('timeout')) return 'Telegram Web 打开超时，请稍后重试。'
  return `Telegram Web 打开失败：${message}`
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

export class TelegramWebService {
  private readonly windows = new Map<number, BrowserWindow>()

  constructor(
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager,
    private readonly preloadPath: string,
    private readonly proxyPoolService: ProxyPoolService
  ) {}

  async openAccountWeb(account: AccountRecord) {
    const current = this.windows.get(account.id)
    if (current && !current.isDestroyed()) {
      current.show()
      current.focus()
      return true
    }

    const attempts = this.pickProxyAttempts()
    let lastError: unknown = null

    for (const proxy of attempts) {
      let window: BrowserWindow | null = null

      try {
        const webState = await this.buildWebAccountState(account, proxy)
        const partition = `telegram-web-${account.id}-${Date.now()}`
        window = new BrowserWindow({
          width: 1280,
          height: 920,
          minWidth: 980,
          minHeight: 720,
          show: false,
          autoHideMenuBar: true,
          backgroundColor: '#08101d',
          title: `${account.phone || '账号'} - Telegram Web`,
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

        await this.configureWindowProxy(window, proxy)
        this.windows.set(account.id, window)

        const cleanup = async () => {
          this.windows.delete(account.id)
          try {
            await window?.webContents.session.clearStorageData()
          } catch {
            // ignore session cleanup failures on close
          }
        }

        window.on('closed', () => {
          void cleanup()
        })

        await window.loadURL(TELEGRAM_WEB_URL)
        await sleep(TELEGRAM_WEB_BOOT_DELAY_MS)
        await this.patchWindowAuthState(window, webState)
        await window.webContents.executeJavaScript('location.reload()')
        await sleep(4000)

        const probe = await this.probeWindow(window)
        if (probe.hasAuthForm && !probe.hasMainContent) {
          await this.patchWindowAuthState(window, webState)
          await window.webContents.executeJavaScript('location.reload()')
        }

        await this.waitForMainContent(window)

        if (!window.isDestroyed()) {
          window.show()
          window.focus()
        }
        return true
      } catch (error) {
        lastError = error
        if (window && !window.isDestroyed()) {
          window.destroy()
        }
      }
    }

    dialog.showErrorBox('Telegram Web 打开失败', formatWebLoginError(lastError))
    return false
  }

  private pickProxyAttempts() {
    const first = this.proxyPoolService.getAccountCheckProxy()
    if (!first) return [null]
    const second = this.proxyPoolService.getAccountCheckProxy([first.id])
    return second ? [first, second] : [first]
  }

  private toClientProxy(proxy: AccountCheckProxy | null): AccountClientProxyOptions | null {
    if (!proxy) return null
    return {
      type: proxy.type,
      ip: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      ipVersion: proxy.ipVersion
    }
  }

  private async configureWindowProxy(window: BrowserWindow, proxy: AccountCheckProxy | null) {
    const session = window.webContents.session
    await session.setProxy(proxy ? {
      proxyRules: `${proxy.type}://${proxy.host.includes(':') && !proxy.host.startsWith('[') ? `[${proxy.host}]` : proxy.host}:${proxy.port}`
    } : { mode: 'direct' })

    if (proxy?.username) {
      window.webContents.on('login', (event, _request, authInfo, callback) => {
        if (!authInfo.isProxy) return
        event.preventDefault()
        callback(proxy.username ?? '', proxy.password ?? '')
      })
    }
  }

  private async buildWebAccountState(account: AccountRecord, proxy: AccountCheckProxy | null): Promise<TelegramWebAccountState> {
    const sourceSession = await this.sessionLoader.load(account.sessionPath)
    const sourceClient = this.clientManager.createClient(sourceSession, {
      proxy: this.toClientProxy(proxy)
    })

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
        dcId,
        date: Math.floor(Date.now() / 1000)
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
      serverSalt: ZERO_SERVER_SALT,
    }
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

      return {
        dc: localStorage.getItem('dc'),
        user_auth: localStorage.getItem('user_auth'),
        auth_key_fingerprint: localStorage.getItem('auth_key_fingerprint'),
        auth_key: localStorage.getItem('dc' + dcId + '_auth_key')
      }
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
