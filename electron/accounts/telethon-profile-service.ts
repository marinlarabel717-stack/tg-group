import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomInt } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { nativeImage } from 'electron'
import type { AccountRecord, ProfileOperationPayload, ProfileOperationResultItem } from './types'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './check-engine/telethon-proxy'

const execFileAsync = promisify(execFile)
const RANDOM_NAME_ALPHABET = 'abcdefghjklmnpqrstuvwxyz'
const RANDOM_AVATAR_EMOJIS = ['😀', '😎', '🥳', '🤖', '🦊', '🐼', '🐯', '🐸', '🐧', '🐻', '🦁', '🐨', '🐙', '🦄', '🍀', '🌈', '⚡', '🔥', '⭐', '🌙', '🍓', '🍉', '🎧', '🎮', '🚀', '💎', '🎯', '🧠']
const RANDOM_AVATAR_BACKGROUNDS = [
  ['#273B7A', '#4B6BFF'],
  ['#114B5F', '#1A936F'],
  ['#5B2A86', '#A4508B'],
  ['#1D3557', '#457B9D'],
  ['#6B2737', '#D95D39'],
  ['#2A2F4F', '#917FB3'],
  ['#1F3C88', '#39A2DB'],
  ['#2D4059', '#EA5455'],
  ['#355C7D', '#6C5B7B'],
  ['#0F3460', '#533483']
] as const
const RANDOM_BIO_OPENERS = ['常驻 Telegram', '长期在线', '白天在线较多', '看到消息会尽快回复', '平时主要处理社群事务', '习惯先看重点再回复']
const RANDOM_BIO_FOCUS = ['合作沟通', '账号整理', '频道运营', '群组管理', '项目协作', '资源对接', '广告安排', '社群维护']
const RANDOM_BIO_TONES = ['回复会慢一点，但都会看。', '请直接带上关键信息。', '工作消息优先处理。', '有事可以直接留言。', '只聊有效内容。', '欢迎直接联系。']

interface PreparedProfileOperationInput {
  value: string
  firstName: string
  lastName: string
  avatarPath: string
  cleanupPaths: string[]
}

interface TelethonProfileRawResult {
  ok?: boolean
  message?: string | null
  reason?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  bio?: string | null
  has_profile_photo?: boolean | null
}

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_profile_manage.py')
}

function randomPick<T>(items: readonly T[]) {
  return items[randomInt(0, items.length)]
}

function buildRandomLetters(length: number, alphabet: string) {
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[randomInt(0, alphabet.length)]
  }
  return output
}

function shuffleString(value: string) {
  const chars = value.split('')
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1)
    ;[chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]]
  }
  return chars.join('')
}

function toTitleCase(value: string) {
  if (!value) return value
  return value[0].toUpperCase() + value.slice(1)
}

function createSvgAvatarMarkup(emoji: string, colors: readonly [string, string]) {
  const escapedEmoji = Array.from(emoji)
    .map((character) => `&#x${character.codePointAt(0)?.toString(16) ?? '2b50'};`)
    .join('')

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx="156" fill="url(#bg)" />
      <circle cx="256" cy="256" r="190" fill="rgba(255,255,255,0.10)" />
      <text x="256" y="284" text-anchor="middle" font-size="232" font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${escapedEmoji}</text>
    </svg>
  `.trim()
}

function createFallbackAvatarMarkup(colors: readonly [string, string]) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx="156" fill="url(#bg)" />
      <circle cx="256" cy="256" r="156" fill="rgba(255,255,255,0.12)" />
      <circle cx="212" cy="224" r="18" fill="rgba(255,255,255,0.88)" />
      <circle cx="300" cy="224" r="18" fill="rgba(255,255,255,0.88)" />
      <path d="M184 314c23 24 51 36 72 36s49-12 72-36" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="22" stroke-linecap="round" />
    </svg>
  `.trim()
}

function buildRandomNickname() {
  const first = toTitleCase(buildRandomLetters(randomInt(4, 8), RANDOM_NAME_ALPHABET))
  const last = toTitleCase(buildRandomLetters(randomInt(5, 9), RANDOM_NAME_ALPHABET))
  return {
    firstName: first,
    lastName: last,
    display: `${first} ${last}`
  }
}

function buildRandomBio() {
  const opener = randomPick(RANDOM_BIO_OPENERS)
  const focus = randomPick(RANDOM_BIO_FOCUS)
  const tone = randomPick(RANDOM_BIO_TONES)
  return `${opener}，主要处理${focus}，${tone}`
}

function buildRandomUsername() {
  const totalLength = randomInt(8, 13)
  const digitCount = randomInt(2, Math.min(5, totalLength - 3) + 1)
  const letterCount = totalLength - digitCount
  const leadingLetter = String.fromCharCode(97 + randomInt(0, 26))
  const tail = buildRandomLetters(Math.max(0, letterCount - 1), 'abcdefghijklmnopqrstuvwxyz') + buildRandomLetters(digitCount, '0123456789')
  const shuffled = shuffleString(tail)
  return `${leadingLetter}${shuffled}`.slice(0, totalLength)
}

async function ensureDirectory(targetPath: string) {
  await fs.promises.mkdir(targetPath, { recursive: true })
}

function resolveAvatarMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

async function toAvatarDataUrl(filePath: string) {
  const buffer = await fs.promises.readFile(filePath)
  return `data:${resolveAvatarMimeType(filePath)};base64,${buffer.toString('base64')}`
}

function formatProfileError(error: string) {
  const normalized = error.trim()
  const upper = normalized.toUpperCase()
  const lower = normalized.toLowerCase()

  if (lower.includes('session_not_authorized') || upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED')) {
    return '当前账号 Session 已失效或未登录，无法更新个人资料。'
  }
  if (upper.includes('USERNAME_OCCUPIED')) {
    return '这个随机用户名撞重复了，Telegram 没有接受。'
  }
  if (upper.includes('USERNAME_INVALID')) {
    return '这个用户名格式不对，Telegram 没有接受。'
  }
  if (upper.includes('USERNAME_NOT_MODIFIED') || upper.includes('ABOUT_NOT_MODIFIED') || upper.includes('FIRSTNAME_NOT_MODIFIED')) {
    return '资料没有变化，Telegram 没有执行更新。'
  }
  if (upper.includes('PHOTO_INVALID') || upper.includes('IMAGE_PROCESS_FAILED')) {
    return '头像图片格式不对或 Telegram 无法处理这张图片。'
  }
  if (upper.includes('RANDOM_AVATAR_RENDER_FAILED')) {
    return '随机头像生成失败了，请稍后再试；如果还是不行，先用自定义头像。'
  }
  if (upper.includes('FLOOD_WAIT')) {
    const match = upper.match(/FLOOD_WAIT_?(\d+)/)
    if (match?.[1]) {
      return `Telegram 暂时限流了这个账号，需要等待 ${match[1]} 秒后再试。`
    }
    return 'Telegram 暂时限流了这个账号，请稍后再试。'
  }
  if (lower.includes('timeout')) {
    return '更新个人资料超时了，请稍后重试。'
  }

  return normalized || '更新个人资料失败，Telegram 没有返回更明确的原因。'
}

function isRetryableRandomUsernameError(error: string) {
  const upper = error.toUpperCase()
  return upper.includes('USERNAME_OCCUPIED') || upper.includes('USERNAME_INVALID')
}

export class TelethonProfileService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()
  private readonly tempDirectory = path.join(os.tmpdir(), 'tg-matrix-profile-assets')

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  private async createRandomAvatarFile() {
    await ensureDirectory(this.tempDirectory)
    const colors = randomPick(RANDOM_AVATAR_BACKGROUNDS)
    let pngBuffer: Buffer | null = null

    for (const emoji of [randomPick(RANDOM_AVATAR_EMOJIS), randomPick(RANDOM_AVATAR_EMOJIS)]) {
      const svg = createSvgAvatarMarkup(emoji, colors)
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
      const image = nativeImage.createFromDataURL(dataUrl)
      if (!image.isEmpty()) {
        const nextBuffer = image.toPNG()
        if (nextBuffer.length > 1024) {
          pngBuffer = nextBuffer
          break
        }
      }
    }

    if (!pngBuffer) {
      const fallbackSvg = createFallbackAvatarMarkup(colors)
      const fallbackImage = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(fallbackSvg, 'utf8').toString('base64')}`)
      if (!fallbackImage.isEmpty()) {
        const fallbackBuffer = fallbackImage.toPNG()
        if (fallbackBuffer.length > 1024) {
          pngBuffer = fallbackBuffer
        }
      }
    }

    if (!pngBuffer) {
      throw new Error('RANDOM_AVATAR_RENDER_FAILED')
    }

    const filePath = path.join(this.tempDirectory, `avatar-${Date.now()}-${randomInt(1000, 9999)}.png`)
    await fs.promises.writeFile(filePath, pngBuffer)
    return filePath
  }

  private async prepareInput(payload: ProfileOperationPayload): Promise<PreparedProfileOperationInput> {
    const action = payload.action
    const cleanupPaths: string[] = []
    let value = typeof payload.value === 'string' ? payload.value.trim() : ''
    let firstName = ''
    let lastName = ''
    let avatarPath = typeof payload.avatarPath === 'string' ? payload.avatarPath.trim() : ''

    if (action === 'random-profile' || action === 'random-nickname') {
      const generated = buildRandomNickname()
      value = generated.display
      firstName = generated.firstName
      lastName = generated.lastName
    }

    if (action === 'random-username') {
      value = buildRandomUsername()
    }

    if (action === 'random-profile' || action === 'random-bio') {
      value = buildRandomBio()
    }

    if (action === 'random-profile' || action === 'random-avatar') {
      avatarPath = await this.createRandomAvatarFile()
      cleanupPaths.push(avatarPath)
    }

    if ((action === 'custom-nickname' || action === 'custom-username' || action === 'custom-bio') && !value) {
      throw new Error('请先填写要批量更新的内容。')
    }

    if (action === 'custom-nickname') {
      firstName = value
      lastName = ''
    }

    if (action === 'custom-avatar' && !avatarPath) {
      throw new Error('请先选择要上传的头像图片。')
    }

    return { value, firstName, lastName, avatarPath, cleanupPaths }
  }

  private async executeOnce(account: AccountRecord, payload: ProfileOperationPayload, proxy?: AccountClientProxyOptions | null) {
    const prepared = await this.prepareInput(payload)
    try {
      const proxyPayload = serializeTelethonProxy(proxy)
      const { stdout } = await execFileAsync(this.pythonExecutable, [
        this.scriptPath,
        JSON.stringify({
          sessionPath: account.sessionPath,
          action: payload.action,
          value: prepared.value,
          firstName: prepared.firstName,
          lastName: prepared.lastName,
          avatarPath: prepared.avatarPath,
          proxy: proxyPayload ? JSON.parse(proxyPayload) : null
        })
      ], {
        cwd: process.cwd(),
        windowsHide: true,
        timeout: 120000,
        encoding: 'utf8',
        env: buildTelethonPythonEnv()
      })

      const raw = JSON.parse(stdout.trim()) as TelethonProfileRawResult
      return { raw, prepared }
    } catch (error) {
      throw error
    }
  }

  async execute(account: AccountRecord, payload: ProfileOperationPayload, proxy?: AccountClientProxyOptions | null): Promise<ProfileOperationResultItem> {
    if (!this.isAvailable()) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        message: '当前运行环境缺少个人资料 Runtime 脚本，暂时没法执行。'
      }
    }

    if (!supportsTelethonProxy(proxy)) {
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        message: '当前代理类型暂不支持个人资料更新，请先切到 HTTP / HTTPS / SOCKS5 代理后再试。'
      }
    }

    const maxAttempts = payload.action === 'random-username' ? 6 : 1
    let lastReason = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let prepared: PreparedProfileOperationInput | null = null
      try {
        const result = await this.executeOnce(account, payload, proxy)
        prepared = result.prepared
        const raw = result.raw
        if (!raw?.ok) {
          lastReason = typeof raw?.reason === 'string' ? raw.reason : ''
          if (payload.action === 'random-username' && attempt < maxAttempts && isRetryableRandomUsernameError(lastReason)) {
            continue
          }
          return {
            accountId: account.id,
            phone: account.phone,
            success: false,
            message: formatProfileError(lastReason)
          }
        }

        let avatar = typeof account.profile?.avatar === 'string' ? account.profile.avatar : null
        let hasProfilePhoto = typeof raw.has_profile_photo === 'boolean' ? raw.has_profile_photo : null

        if (payload.action === 'custom-avatar' || payload.action === 'random-avatar' || payload.action === 'random-profile') {
          avatar = prepared.avatarPath ? await toAvatarDataUrl(prepared.avatarPath) : avatar
          hasProfilePhoto = true
        } else if (payload.action === 'clear-all-profile') {
          avatar = null
          hasProfilePhoto = false
        }

        return {
          accountId: account.id,
          phone: account.phone,
          success: true,
          message: typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : '个人资料已更新。',
          firstName: typeof raw.first_name === 'string' ? raw.first_name : null,
          lastName: typeof raw.last_name === 'string' ? raw.last_name : null,
          username: typeof raw.username === 'string' ? raw.username : null,
          bio: typeof raw.bio === 'string' ? raw.bio : null,
          avatar,
          hasProfilePhoto
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        lastReason = message
        if (!(payload.action === 'random-username' && attempt < maxAttempts && isRetryableRandomUsernameError(message))) {
          return {
            accountId: account.id,
            phone: account.phone,
            success: false,
            message: formatProfileError(message)
          }
        }
      } finally {
        if (prepared?.cleanupPaths?.length) {
          await Promise.allSettled(prepared.cleanupPaths.map((targetPath) => fs.promises.rm(targetPath, { force: true })))
        }
      }
    }

    return {
      accountId: account.id,
      phone: account.phone,
      success: false,
      message: formatProfileError(lastReason || 'USERNAME_OCCUPIED')
    }
  }
}
