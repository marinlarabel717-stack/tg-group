import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { randomInt } from 'node:crypto'
import { execFile, type ChildProcess } from 'node:child_process'
import { nativeImage } from 'electron'
import type { AccountRecord, ProfileOperationPayload, ProfileOperationResultItem } from './types'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './check-engine/telethon-proxy'

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
const RANDOM_AVATAR_FACE_COLORS = ['#FFE08A', '#FFD8A8', '#FFC7B2', '#FDE68A', '#E9D5FF', '#BFDBFE'] as const
const RANDOM_AVATAR_ACCENT_COLORS = ['#FFFFFF', '#F8FAFC', '#FDE68A', '#FBCFE8', '#BFDBFE', '#C7F9CC'] as const
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
  avatar_data_url?: string | null
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
    table[index] = crc >>> 0
  }
  return table
})()

function resolveScriptPath() {
  return resolveRuntimeAssetPath('accounts', 'telethon_profile_manage.py')
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hexToRgba(hex: string, alpha = 255): RgbaColor {
  const normalized = hex.replace('#', '').trim()
  const value = normalized.length === 3
    ? normalized.split('').map((item) => item + item).join('')
    : normalized.padEnd(6, '0').slice(0, 6)

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: clampChannel(alpha)
  }
}

function mixChannel(left: number, right: number, ratio: number) {
  return clampChannel(left + ((right - left) * ratio))
}

function mixColors(left: RgbaColor, right: RgbaColor, ratio: number): RgbaColor {
  return {
    r: mixChannel(left.r, right.r, ratio),
    g: mixChannel(left.g, right.g, ratio),
    b: mixChannel(left.b, right.b, ratio),
    a: mixChannel(left.a, right.a, ratio)
  }
}

function multiplyAlpha(color: RgbaColor, factor: number): RgbaColor {
  return {
    ...color,
    a: clampChannel(color.a * factor)
  }
}

function setPixel(buffer: Buffer, width: number, x: number, y: number, color: RgbaColor) {
  if (x < 0 || y < 0 || x >= width) return
  const height = Math.floor(buffer.length / (width * 4))
  if (y >= height) return

  const index = (y * width + x) * 4
  const alpha = color.a / 255
  const inverse = 1 - alpha
  buffer[index] = clampChannel((color.r * alpha) + (buffer[index] * inverse))
  buffer[index + 1] = clampChannel((color.g * alpha) + (buffer[index + 1] * inverse))
  buffer[index + 2] = clampChannel((color.b * alpha) + (buffer[index + 2] * inverse))
  buffer[index + 3] = clampChannel((255 * alpha) + (buffer[index + 3] * inverse))
}

function drawFilledCircle(buffer: Buffer, width: number, cx: number, cy: number, radius: number, color: RgbaColor) {
  const minX = Math.max(0, Math.floor(cx - radius))
  const maxX = Math.min(width - 1, Math.ceil(cx + radius))
  const height = Math.floor(buffer.length / (width * 4))
  const minY = Math.max(0, Math.floor(cy - radius))
  const maxY = Math.min(height - 1, Math.ceil(cy + radius))
  const radiusSquared = radius * radius

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx
      const dy = y - cy
      if ((dx * dx) + (dy * dy) <= radiusSquared) {
        setPixel(buffer, width, x, y, color)
      }
    }
  }
}

function drawSmile(buffer: Buffer, width: number, cx: number, cy: number, radius: number, thickness: number, color: RgbaColor) {
  for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
    const normalized = offsetX / radius
    const curve = cy + Math.round((normalized * normalized) * radius * 0.46)
    drawFilledCircle(buffer, width, cx + offsetX, curve, thickness, color)
  }
}

function drawAccessorySpark(buffer: Buffer, width: number, cx: number, cy: number, size: number, color: RgbaColor) {
  for (let step = -size; step <= size; step += 1) {
    drawFilledCircle(buffer, width, cx + step, cy, Math.max(2, Math.floor(size / 5)), color)
    drawFilledCircle(buffer, width, cx, cy + step, Math.max(2, Math.floor(size / 5)), color)
  }
}

function buildPngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const chunkType = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([chunkType, data])), 0)
  return Buffer.concat([length, chunkType, data, crc])
}

function crc32(buffer: Buffer) {
  let crc = 0xFFFFFFFF
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function encodePng(width: number, height: number, rgbaBuffer: Buffer) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * stride
    const targetStart = y * (stride + 1)
    raw[targetStart] = 0
    rgbaBuffer.copy(raw, targetStart + 1, sourceStart, sourceStart + stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const compressed = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    PNG_SIGNATURE,
    buildPngChunk('IHDR', ihdr),
    buildPngChunk('IDAT', compressed),
    buildPngChunk('IEND', Buffer.alloc(0))
  ])
}

function renderFallbackAvatarPng(colors: readonly [string, string]) {
  const width = 512
  const height = 512
  const buffer = Buffer.alloc(width * height * 4, 0)
  const topColor = hexToRgba(colors[0])
  const bottomColor = hexToRgba(colors[1])
  const faceColor = hexToRgba(randomPick(RANDOM_AVATAR_FACE_COLORS))
  const accentColor = multiplyAlpha(hexToRgba(randomPick(RANDOM_AVATAR_ACCENT_COLORS)), 0.9)
  const softWhite = hexToRgba('#FFFFFF', 218)
  const eyeColor = hexToRgba('#1E293B', 255)
  const cheekColor = hexToRgba('#FCA5A5', 108)

  for (let y = 0; y < height; y += 1) {
    const verticalRatio = y / Math.max(1, height - 1)
    const rowColor = mixColors(topColor, bottomColor, verticalRatio)
    for (let x = 0; x < width; x += 1) {
      const horizontalGlow = 0.14 * (x / Math.max(1, width - 1))
      const pixelColor = mixColors(rowColor, softWhite, horizontalGlow)
      const index = (y * width + x) * 4
      buffer[index] = pixelColor.r
      buffer[index + 1] = pixelColor.g
      buffer[index + 2] = pixelColor.b
      buffer[index + 3] = 255
    }
  }

  drawFilledCircle(buffer, width, 384, 118, 86, multiplyAlpha(softWhite, 0.12))
  drawFilledCircle(buffer, width, 124, 432, 96, multiplyAlpha(hexToRgba(colors[0]), 0.36))
  drawFilledCircle(buffer, width, 256, 256, 148, faceColor)
  drawFilledCircle(buffer, width, 216, 210, 28, eyeColor)
  drawFilledCircle(buffer, width, 296, 210, 28, eyeColor)

  const eyeHighlight = multiplyAlpha(softWhite, 0.92)
  drawFilledCircle(buffer, width, 206, 198, 10, eyeHighlight)
  drawFilledCircle(buffer, width, 286, 198, 10, eyeHighlight)
  drawFilledCircle(buffer, width, 184, 272, 20, cheekColor)
  drawFilledCircle(buffer, width, 328, 272, 20, cheekColor)
  drawSmile(buffer, width, 256, 292, 68, 10, eyeColor)
  drawAccessorySpark(buffer, width, 374, 156, 22, accentColor)
  drawFilledCircle(buffer, width, 336, 168, 10, multiplyAlpha(softWhite, 0.6))

  return encodePng(width, height, buffer)
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

  if (upper.includes('PROFILE_OPERATION_ABORTED_BY_USER')) {
    return '已按停止指令中断当前账号处理。'
  }

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
  if (upper.includes('DEFAULT_PROFILE_PHOTO_EMOJIS_EMPTY')) {
    return 'Telegram 当前没有返回可用的官方 emoji 头像列表，请稍后再试。'
  }
  if (upper.includes('EMOJI_MARKUP_INVALID') || upper.includes('VIDEO_EMOJI_MARKUP_INVALID')) {
    return '这个账号当前不接受官方 emoji 头像参数，已尝试兼容方案；如果还是失败，请再试一次。'
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

function isOfficialEmojiMarkupError(error: string) {
  const upper = error.toUpperCase()
  return upper.includes('EMOJI_MARKUP_INVALID') || upper.includes('VIDEO_EMOJI_MARKUP_INVALID')
}

export class TelethonProfileService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()
  private readonly tempDirectory = path.join(os.tmpdir(), 'tg-matrix-profile-assets')
  private readonly runningProcesses = new Map<number, ChildProcess>()
  private readonly cancelledAccountIds = new Set<number>()

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  cancelActiveOperations() {
    for (const [accountId, childProcess] of this.runningProcesses.entries()) {
      this.cancelledAccountIds.add(accountId)
      this.terminateChildProcess(childProcess)
    }
  }

  private terminateChildProcess(childProcess: ChildProcess) {
    try {
      if (!childProcess.killed) {
        childProcess.kill()
      }
    } catch {
      // ignore
    }
  }

  private async runScript(accountId: number, payload: Record<string, unknown>) {
    return await new Promise<TelethonProfileRawResult>((resolve, reject) => {
      let settled = false
      let timedOut = false
      const childProcess = execFile(
        this.pythonExecutable,
        [this.scriptPath, JSON.stringify(payload)],
        {
          cwd: process.cwd(),
          windowsHide: true,
          encoding: 'utf8',
          env: buildTelethonPythonEnv(),
          maxBuffer: 8 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          this.runningProcesses.delete(accountId)
          const cancelled = this.cancelledAccountIds.delete(accountId)

          if (error) {
            if (cancelled) {
              reject(new Error('PROFILE_OPERATION_ABORTED_BY_USER'))
              return
            }
            if (timedOut) {
              reject(new Error('timeout'))
              return
            }
            const reason = String(stderr || stdout || error.message || 'PROFILE_OPERATION_FAILED').trim()
            reject(new Error(reason))
            return
          }

          try {
            resolve(JSON.parse(String(stdout).trim()) as TelethonProfileRawResult)
          } catch (parseError) {
            reject(parseError instanceof Error ? parseError : new Error(String(parseError)))
          }
        }
      )

      this.runningProcesses.set(accountId, childProcess)

      const timeoutId = setTimeout(() => {
        timedOut = true
        this.terminateChildProcess(childProcess)
      }, 120000)
    })
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
      try {
        pngBuffer = renderFallbackAvatarPng(colors)
      } catch {
        const fallbackSvg = createFallbackAvatarMarkup(colors)
        const fallbackImage = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(fallbackSvg, 'utf8').toString('base64')}`)
        if (!fallbackImage.isEmpty()) {
          const fallbackBuffer = fallbackImage.toPNG()
          if (fallbackBuffer.length > 1024) {
            pngBuffer = fallbackBuffer
          }
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
      avatarPath = ''
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
    const proxyPayload = serializeTelethonProxy(proxy)
    const raw = await this.runScript(account.id, {
      sessionPath: account.sessionPath,
      action: payload.action,
      value: prepared.value,
      firstName: prepared.firstName,
      lastName: prepared.lastName,
      avatarPath: prepared.avatarPath,
      proxy: proxyPayload ? JSON.parse(proxyPayload) : null
    })
    return { raw, prepared }
  }

  private async executeEmojiAvatarFallback(account: AccountRecord, payload: ProfileOperationPayload, proxy?: AccountClientProxyOptions | null) {
    const fallbackAvatarPath = await this.createRandomAvatarFile()
    const proxyPayload = serializeTelethonProxy(proxy)
    const raw = await this.runScript(account.id, {
      sessionPath: account.sessionPath,
      action: 'custom-avatar',
      value: '',
      firstName: '',
      lastName: '',
      avatarPath: fallbackAvatarPath,
      proxy: proxyPayload ? JSON.parse(proxyPayload) : null
    })

    return {
      raw,
      avatarPath: fallbackAvatarPath,
      message: payload.action === 'random-profile'
        ? 'Telegram 未接受官方 emoji 头像，已自动改用兼容头像；名称和简介也已一起更新。'
        : 'Telegram 未接受官方 emoji 头像，已自动改用兼容头像。'
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
      let fallbackAvatarPath: string | null = null
      try {
        const result = await this.executeOnce(account, payload, proxy)
        prepared = result.prepared
        let raw = result.raw
        let successMessage: string | null = null

        if (!raw?.ok) {
          lastReason = typeof raw?.reason === 'string' ? raw.reason : ''

          if ((payload.action === 'random-avatar' || payload.action === 'random-profile') && isOfficialEmojiMarkupError(lastReason)) {
            const fallbackResult = await this.executeEmojiAvatarFallback(account, payload, proxy)
            fallbackAvatarPath = fallbackResult.avatarPath
            raw = fallbackResult.raw
            if (!raw?.ok) {
              lastReason = typeof raw?.reason === 'string' ? raw.reason : lastReason
              return {
                accountId: account.id,
                phone: account.phone,
                success: false,
                message: formatProfileError(lastReason)
              }
            }
            successMessage = fallbackResult.message
          } else {
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
        }

        let avatar = typeof account.profile?.avatar === 'string' ? account.profile.avatar : null
        let hasProfilePhoto = typeof raw.has_profile_photo === 'boolean' ? raw.has_profile_photo : null

        if (payload.action === 'custom-avatar' || payload.action === 'random-avatar' || payload.action === 'random-profile') {
          avatar = typeof raw.avatar_data_url === 'string' && raw.avatar_data_url.trim()
            ? raw.avatar_data_url.trim()
            : ((fallbackAvatarPath || prepared.avatarPath) ? await toAvatarDataUrl(fallbackAvatarPath || prepared.avatarPath) : avatar)
          hasProfilePhoto = true
        } else if (payload.action === 'clear-all-profile') {
          avatar = null
          hasProfilePhoto = false
        }

        return {
          accountId: account.id,
          phone: account.phone,
          success: true,
          message: successMessage || (typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : '个人资料已更新。'),
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
        const cleanupPaths = [
          ...(prepared?.cleanupPaths ?? []),
          ...(fallbackAvatarPath ? [fallbackAvatarPath] : [])
        ]
        if (cleanupPaths.length) {
          await Promise.allSettled(cleanupPaths.map((targetPath) => fs.promises.rm(targetPath, { force: true })))
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
