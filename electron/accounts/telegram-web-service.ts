import { BrowserWindow, dialog } from 'electron'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import type { AccountRecord } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager } from './check-engine/telegram-client-manager'

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

const TELEGRAM_WEB_URL = 'https://web.telegram.org/k/'
const TELEGRAM_WEB_API_ID = 1025907
const TELEGRAM_WEB_API_HASH = '452b0359b988148995f22ff0f4229750'
const TELEGRAM_WEB_BASE_DC_ID = 2
const TELEGRAM_WEB_BOOT_DELAY_MS = 3000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    private readonly preloadPath: string
  ) {}

  async openAccountWeb(account: AccountRecord) {
    const current = this.windows.get(account.id)
    if (current && !current.isDestroyed()) {
      current.show()
      current.focus()
      return true
    }

    try {
      const webState = await this.buildWebAccountState(account)
      const partition = `telegram-web-${account.id}-${Date.now()}`
      const window = new BrowserWindow({
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
          additionalArguments: ['--tg-web-auth=e30'],
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: false,
          backgroundThrottling: false
        }
      })

      this.windows.set(account.id, window)

      const cleanup = async () => {
        this.windows.delete(account.id)
        try {
          await window.webContents.session.clearStorageData()
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
      await this.waitForMainContent(window)

      if (!window.isDestroyed()) {
        window.show()
        window.focus()
      }
      return true
    } catch (error) {
      dialog.showErrorBox('Telegram Web 打开失败', formatWebLoginError(error))
      return false
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

      const dcOption = await this.resolveDcOption(sourceClient, TELEGRAM_WEB_BASE_DC_ID)
      const exported = await sourceClient.invoke(new Api.auth.ExportAuthorization({
        dcId: TELEGRAM_WEB_BASE_DC_ID
      }))

      const webSession = new StringSession('')
      webSession.setDC(TELEGRAM_WEB_BASE_DC_ID, dcOption.ipAddress, dcOption.port)
      const webClient = new TelegramClient(webSession, TELEGRAM_WEB_API_ID, TELEGRAM_WEB_API_HASH, {
        connectionRetries: 1,
        reconnectRetries: 0,
        requestRetries: 1,
        retryDelay: 500,
        autoReconnect: false,
        timeout: 10,
        floodSleepThreshold: 0,
        useIPV6: false
      })

      try {
        await webClient.connect()
        await webClient.invoke(new Api.auth.ImportAuthorization({
          id: exported.id,
          bytes: exported.bytes
        }))

        const authKeyHex = webSession.getAuthKey(TELEGRAM_WEB_BASE_DC_ID)?.getKey()?.toString('hex')
        if (!authKeyHex) {
          throw new Error('missing imported web auth key')
        }

        return {
          userId,
          authKeyHex,
          authKeyFingerprint: authKeyHex.slice(0, 8),
          dcId: TELEGRAM_WEB_BASE_DC_ID,
          date: Math.floor(Date.now() / 1000)
        }
      } finally {
        await webClient.disconnect().catch(() => undefined)
      }
    } finally {
      await this.clientManager.destroyClient(sourceClient)
    }
  }

  private async resolveDcOption(client: TelegramClient, dcId: number) {
    const config = await client.invoke(new Api.help.GetConfig())
    const dcOption = config.dcOptions.find((option) => (
      option.id === dcId &&
      !option.ipv6 &&
      !option.mediaOnly &&
      !option.tcpoOnly
    ))

    if (!dcOption) {
      throw new Error(`missing dc option for ${dcId}`)
    }

    return dcOption
  }

  private async patchWindowAuthState(window: BrowserWindow, state: TelegramWebAccountState) {
    const patch = {
      userId: Number(state.userId),
      date: state.date,
      dcId: state.dcId,
      authKeyHex: state.authKeyHex,
      authKeyFingerprint: state.authKeyFingerprint
    }

    await window.webContents.executeJavaScript(`(() => {
      const existing = JSON.parse(localStorage.getItem('account1') || '{}')
      const next = {
        ...existing,
        userId: ${JSON.stringify(patch.userId)},
        date: ${JSON.stringify(patch.date)},
        dcId: ${JSON.stringify(patch.dcId)},
        auth_key_fingerprint: ${JSON.stringify(patch.authKeyFingerprint)},
        dc2_auth_key: ${JSON.stringify(patch.authKeyHex)},
        dc2_server_salt: existing.dc2_server_salt || '0000000000000000'
      }
      localStorage.setItem('account1', JSON.stringify(next))
      localStorage.setItem('current_account', '1')
      localStorage.setItem('number_of_accounts', '1')
      return true
    })()`)
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
      hasAuthForm: Boolean(document.querySelector('#auth-qr-form, .auth-form')),
      hasMainContent: Boolean(document.querySelector('#Main, #LeftColumn, .LeftColumn, .chatlist-container'))
    }))()`)
  }
}
