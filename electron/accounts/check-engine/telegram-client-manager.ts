import os from 'node:os'
import type { TelegramClient } from 'telegram'
import type { Session } from 'telegram/sessions'
import { getSessionsModule, getTelegramModule } from './gramjs-runtime'
import { HttpProxyPromisedNetSockets } from './http-proxy-net-socket'

export interface AccountClientProxyOptions {
  type: 'http' | 'https' | 'socks5'
  ip: string
  port: number
  username?: string | null
  password?: string | null
  ipVersion?: 'ipv4' | 'ipv6'
}

interface ClientConfig {
  apiId: number
  apiHash: string
  deviceModel: string
  systemVersion: string
  appVersion: string
  langCode: string
  systemLangCode: string
  useIPV6: boolean
}

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  apiId: 2040,
  apiHash: 'b18441a1ff607e10a989891a5462e627',
  deviceModel: 'Windows 11 x64',
  systemVersion: os.release(),
  appVersion: '6.7.8 x64',
  langCode: 'en',
  systemLangCode: 'en-US',
  useIPV6: false
}

export class TelegramClientManager {
  createClient(session: Session, options?: { proxy?: AccountClientProxyOptions | null }) {
    const config: ClientConfig = { ...DEFAULT_CLIENT_CONFIG }

    const { TelegramClient } = getTelegramModule()
    const { StringSession } = getSessionsModule()

    let normalizedSession: Session = session
    const sessionWithSave = session as any
    if (sessionWithSave && typeof sessionWithSave.save === 'function') {
      normalizedSession = new StringSession(sessionWithSave.save())
    }

    const proxy = options?.proxy ?? null
    if (proxy?.ipVersion === 'ipv6') {
      config.useIPV6 = true
    }

    const clientOptions: Record<string, unknown> = {
      connectionRetries: 1,
      reconnectRetries: 0,
      requestRetries: 1,
      retryDelay: 500,
      autoReconnect: false,
      timeout: 10,
      floodSleepThreshold: 0,
      deviceModel: config.deviceModel,
      systemVersion: config.systemVersion,
      appVersion: config.appVersion,
      langCode: config.langCode,
      systemLangCode: config.systemLangCode,
      useIPV6: config.useIPV6
    }

    if (proxy) {
      if (proxy.type === 'socks5') {
        clientOptions.proxy = {
          ip: proxy.ip,
          port: proxy.port,
          socksType: 5,
          username: proxy.username ?? undefined,
          password: proxy.password ?? undefined,
          timeout: 8
        }
      } else {
        clientOptions.proxy = {
          ip: proxy.ip,
          port: proxy.port,
          username: proxy.username ?? undefined,
          password: proxy.password ?? undefined,
          timeout: 8,
          protocol: proxy.type
        }
        clientOptions.networkSocket = HttpProxyPromisedNetSockets
      }
    }

    return new TelegramClient(normalizedSession, config.apiId, config.apiHash, {
      ...clientOptions
    })
  }

  async destroyClient(client: TelegramClient) {
    try {
      await client.disconnect()
    } catch {
      // ignore disconnect errors during teardown
    }
  }
}
