import { BrowserWindow, dialog } from 'electron'
import jsQR from 'jsqr'
import type { AccountRecord } from './types'
import { SessionLoader } from './check-engine/session-loader'
import { TelegramClientManager } from './check-engine/telegram-client-manager'
import { getTelegramModule } from './check-engine/gramjs-runtime'

interface QrRect {
  x: number
  y: number
  width: number
  height: number
}

interface WindowProbeResult {
  hasAuthForm: boolean
  hasMainContent: boolean
  qrRect: QrRect | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeBase64Url(value: string) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='
  return normalized
}

function parseLoginToken(loginUrl: string) {
  const match = /token=([^&]+)/.exec(loginUrl)
  if (!match) return null
  return Buffer.from(normalizeBase64Url(match[1]), 'base64')
}

function decodeCapturedImage(image: Electron.NativeImage) {
  const size = image.getSize()
  if (!size.width || !size.height) return null

  const bitmap = image.toBitmap()
  const rgba = new Uint8ClampedArray(size.width * size.height * 4)

  for (let index = 0; index < size.width * size.height; index += 1) {
    const src = index * 4
    const dst = index * 4
    rgba[dst] = bitmap[src + 2]
    rgba[dst + 1] = bitmap[src + 1]
    rgba[dst + 2] = bitmap[src]
    rgba[dst + 3] = bitmap[src + 3]
  }

  return jsQR(rgba, size.width, size.height)?.data ?? null
}

function formatWebLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('frozen_method_invalid')) return '当前账号已冻结，Telegram Web 无法直接登录。'
  if (lower.includes('session_revoked') || lower.includes('auth_key_unregistered') || lower.includes('session expired')) {
    return '当前账号 Session 已失效，无法直接打开已登录的 Telegram Web。'
  }
  if (lower.includes('not authorized') || lower.includes('unauthorized')) {
    return '当前账号 Session 未登录，无法直接打开已登录的 Telegram Web。'
  }
  if (lower.includes('auth_key_duplicated')) return '当前账号存在多 IP / Session 冲突，Telegram Web 自动登录失败。'
  if (lower.includes('timeout')) return 'Telegram Web 自动登录超时，请稍后重试。'
  return `Telegram Web 自动登录失败：${message}`
}

export class TelegramWebService {
  private readonly windows = new Map<number, BrowserWindow>()

  constructor(
    private readonly sessionLoader: SessionLoader,
    private readonly clientManager: TelegramClientManager
  ) {}

  async openAccountWeb(account: AccountRecord) {
    const current = this.windows.get(account.id)
    if (current && !current.isDestroyed()) {
      current.show()
      current.focus()
      return true
    }

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

    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) {
        window.show()
        window.focus()
      }
    })

    await window.loadURL('https://web.telegram.org/a/')

    void this.autoLogin(window, account).catch((error) => {
      if (!window.isDestroyed()) {
        dialog.showErrorBox('Telegram Web 打开失败', formatWebLoginError(error))
      }
    })

    return true
  }

  private async autoLogin(window: BrowserWindow, account: AccountRecord) {
    const session = await this.sessionLoader.load(account.sessionPath)
    const client = this.clientManager.createClient(session)
    const { Api } = getTelegramModule()
    let lastAcceptedLoginUrl = ''
    let observedAuthForm = false

    try {
      await client.connect()

      const authorized = await client.isUserAuthorized()
      if (!authorized) {
        throw new Error('not authorized')
      }

      for (let attempt = 0; attempt < 90; attempt += 1) {
        if (window.isDestroyed()) return false

        const probe = await this.probeWindow(window)
        observedAuthForm ||= probe.hasAuthForm

        if (probe.hasMainContent || (observedAuthForm && !probe.hasAuthForm)) {
          return true
        }

        const loginUrl = probe.qrRect ? await this.captureLoginUrl(window, probe.qrRect) : null
        if (loginUrl && loginUrl !== lastAcceptedLoginUrl) {
          lastAcceptedLoginUrl = loginUrl
          const token = parseLoginToken(loginUrl)

          if (token) {
            try {
              await client.invoke(new Api.auth.AcceptLoginToken({ token }))
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const lower = message.toLowerCase()

              if (lower.includes('auth_token_expired') || lower.includes('auth_token_already_accepted')) {
                await sleep(600)
                continue
              }

              throw error
            }
          }
        }

        await sleep(900)
      }

      throw new Error('timeout')
    } finally {
      await this.clientManager.destroyClient(client)
    }
  }

  private async probeWindow(window: BrowserWindow): Promise<WindowProbeResult> {
    return window.webContents.executeJavaScript(`(() => {
      const authForm = document.querySelector('#auth-qr-form, .auth-form')
      const svg = document.querySelector('.qr-container svg')
      const box = svg ? svg.getBoundingClientRect() : null

      return {
        hasAuthForm: Boolean(authForm),
        hasMainContent: Boolean(document.querySelector('#Main, #LeftColumn')),
        qrRect: box ? {
          x: Math.max(0, Math.floor(box.left)),
          y: Math.max(0, Math.floor(box.top)),
          width: Math.ceil(box.width),
          height: Math.ceil(box.height)
        } : null
      }
    })()`)
  }

  private async captureLoginUrl(window: BrowserWindow, rect: QrRect) {
    const image = await window.webContents.capturePage(rect)
    const decoded = decodeCapturedImage(image)
    return typeof decoded === 'string' && decoded.startsWith('tg://login?token=') ? decoded : null
  }
}
