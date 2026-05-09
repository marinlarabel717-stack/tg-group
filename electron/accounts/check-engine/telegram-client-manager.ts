import os from 'node:os'
import type { TelegramClient } from 'telegram'
import type { Session } from 'telegram/sessions'
import { getSessionsModule, getTelegramModule } from './gramjs-runtime'

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
  createClient(session: Session) {
    const config: ClientConfig = { ...DEFAULT_CLIENT_CONFIG }

    const { TelegramClient } = getTelegramModule()
    const { StringSession } = getSessionsModule()

    let normalizedSession: Session = session
    const sessionWithSave = session as any
    if (sessionWithSave && typeof sessionWithSave.save === 'function') {
      normalizedSession = new StringSession(sessionWithSave.save())
    }

    return new TelegramClient(normalizedSession, config.apiId, config.apiHash, {
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
