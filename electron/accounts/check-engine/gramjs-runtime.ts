import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type TelegramModule = typeof import('telegram')
type SessionsModule = typeof import('telegram/sessions')
type AuthKeyModule = typeof import('telegram/crypto/AuthKey')
type HelpersModule = typeof import('telegram/Helpers')

let telegramModuleCache: TelegramModule | null = null
let sessionsModuleCache: SessionsModule | null = null
let authKeyModuleCache: AuthKeyModule | null = null
let helpersModuleCache: HelpersModule | null = null

export function getTelegramModule() {
  telegramModuleCache ??= require('telegram') as TelegramModule
  return telegramModuleCache
}

export function getSessionsModule() {
  sessionsModuleCache ??= require('telegram/sessions') as SessionsModule
  return sessionsModuleCache
}

export function getAuthKeyModule() {
  authKeyModuleCache ??= require('telegram/crypto/AuthKey') as AuthKeyModule
  return authKeyModuleCache
}

export function getHelpersModule() {
  helpersModuleCache ??= require('telegram/Helpers') as HelpersModule
  return helpersModuleCache
}
