import os from 'node:os'
import { TelegramClient } from 'telegram'
import type { Session } from 'telegram/sessions'
import type { AccountJsonProfile } from '../types'

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

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export class TelegramClientManager {
  createClient(session: Session, profile: AccountJsonProfile) {
    const config: ClientConfig = {
      apiId: readNumber(profile.app_id, DEFAULT_CLIENT_CONFIG.apiId),
      apiHash: readString(profile.app_hash, DEFAULT_CLIENT_CONFIG.apiHash),
      deviceModel: readString(profile.device ?? profile.sdk, DEFAULT_CLIENT_CONFIG.deviceModel),
      systemVersion: readString(profile.sdk, DEFAULT_CLIENT_CONFIG.systemVersion),
      appVersion: readString(profile.app_version, DEFAULT_CLIENT_CONFIG.appVersion),
      langCode: readString(profile.lang_pack, DEFAULT_CLIENT_CONFIG.langCode),
      systemLangCode: readString(profile.system_lang_pack, DEFAULT_CLIENT_CONFIG.systemLangCode),
      useIPV6: Boolean(profile.ipv6 ?? DEFAULT_CLIENT_CONFIG.useIPV6)
    }

    return new TelegramClient(session, config.apiId, config.apiHash, {
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
