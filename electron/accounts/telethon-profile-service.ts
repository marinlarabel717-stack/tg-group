import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as zlib from 'node:zlib'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AccountRecord, ProfileOperationAction, ProfileOperationPayload, ProfileOperationResultItem } from './types'
import { resolveRuntimeAssetPath } from '../runtime-paths'
import { buildTelethonPythonEnv, resolvePythonExecutable } from '../python-runtime'
import type { AccountClientProxyOptions } from './check-engine/telegram-client-manager'
import { serializeTelethonProxy, supportsTelethonProxy } from './check-engine/telethon-proxy'

const execFileAsync = promisify(execFile)

const RANDOM_NICKNAME_PREFIXES = ['星海', '深蓝', '矩阵', '夜航', '极光', '海棠', '银湾', '云栖', '北屿', '岚影']
const RANDOM_NICKNAME_SUFFIXES = ['引擎', '序列', '信标', '坐标', '回声', '脉冲', '节点', '来信', '编号', '计划']
const RANDOM_BIOS = [
  '正在整理频道与社群线索，看到消息会尽快回复。',
  '长期在线，偶尔潜水，欢迎直接留言。',
  '偏好清晰沟通，合作请带上关键信息。',
  '只聊有效内容，慢一点但会认真看完。',
  '主要处理账号、社群、协作相关事务。',
  '消息较多时回复会稍慢，但不会漏看。',
  '喜欢把复杂流程拆清楚，再一步步执行。',
  '常驻 Telegram，工作时间内基本都会在线。'
]

interface PreparedProfileOperationInput {
  value: string
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

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createPngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

function createSolidPngBuffer(width: number, height: number, red: number, green: number, blue: number) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rows: Buffer[] = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4)
    row[0] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4
      const shade = Math.max(0, Math.min(255, Math.round((x / width) * 18 + (y / height) * 14)))
      row[offset] = Math.max(0, Math.min(255, red + shade))
      row[offset + 1] = Math.max(0, Math.min(255, green + Math.round(shade * 0.8)))
      row[offset + 2] = Math.max(0, Math.min(255, blue + Math.round(shade * 0.6)))
      row[offset + 3] = 255
    }
    rows.push(row)
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 })
  return Buffer.concat([
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', compressed),
    createPngChunk('IEND', Buffer.alloc(0))
  ])
}

function formatProfileError(error: string) {
  const normalized = error.trim()
  const upper = normalized.toUpperCase()
  const lower = normalized.toLowerCase()

  if (lower.includes('session_not_authorized') || upper.includes('AUTH_KEY_UNREGISTERED') || upper.includes('SESSION_REVOKED') || upper.includes('SESSION_EXPIRED')) {
    return '当前账号 Session 已失效或未登录，无法更新个人资料。'
  }
  if (upper.includes('USERNAME_OCCUPIED')) {
    return '这个用户名已经被占用了，请换一个再试。'
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

function sanitizeUsernamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '')
}

function buildRandomNickname(account: AccountRecord) {
  const prefix = RANDOM_NICKNAME_PREFIXES[account.id % RANDOM_NICKNAME_PREFIXES.length]
  const suffix = RANDOM_NICKNAME_SUFFIXES[(account.id * 7) % RANDOM_NICKNAME_SUFFIXES.length]
  const tail = String(account.id).slice(-2).padStart(2, '0')
  return `${prefix}${suffix}${tail}`
}

function buildRandomBio(account: AccountRecord) {
  return RANDOM_BIOS[account.id % RANDOM_BIOS.length]
}

function buildRandomUsername(account: AccountRecord) {
  const numericTail = sanitizeUsernamePart(String(account.userId || account.phone || account.id)).slice(-8) || String(account.id)
  const alpha = `tgm${Math.abs(account.id * 17).toString(36)}`.slice(0, 6)
  const joined = `${alpha}${numericTail}`.slice(0, 24)
  return joined.length >= 5 ? joined : `tgm${joined}${String(account.id).slice(-2)}`
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

export class TelethonProfileService {
  private readonly pythonExecutable = resolvePythonExecutable()
  private readonly scriptPath = resolveScriptPath()
  private readonly tempDirectory = path.join(os.tmpdir(), 'tg-matrix-profile-assets')

  isAvailable() {
    return fs.existsSync(this.scriptPath)
  }

  private async createRandomAvatarFile(account: AccountRecord) {
    await ensureDirectory(this.tempDirectory)
    const red = 52 + (account.id * 37 % 90)
    const green = 88 + (account.id * 19 % 80)
    const blue = 132 + (account.id * 13 % 90)
    const buffer = createSolidPngBuffer(256, 256, red, green, blue)
    const filePath = path.join(this.tempDirectory, `avatar-${account.id}-${Date.now()}.png`)
    await fs.promises.writeFile(filePath, buffer)
    return filePath
  }

  private async prepareInput(account: AccountRecord, payload: ProfileOperationPayload): Promise<PreparedProfileOperationInput> {
    const action = payload.action
    const cleanupPaths: string[] = []
    let value = typeof payload.value === 'string' ? payload.value.trim() : ''
    let avatarPath = typeof payload.avatarPath === 'string' ? payload.avatarPath.trim() : ''

    if (action === 'random-nickname') {
      value = buildRandomNickname(account)
    } else if (action === 'random-username') {
      value = buildRandomUsername(account)
    } else if (action === 'random-bio') {
      value = buildRandomBio(account)
    } else if (action === 'random-avatar') {
      avatarPath = await this.createRandomAvatarFile(account)
      cleanupPaths.push(avatarPath)
    }

    if ((action === 'custom-nickname' || action === 'custom-username' || action === 'custom-bio') && !value) {
      throw new Error('请先填写要批量更新的内容。')
    }

    if (action === 'custom-avatar' && !avatarPath) {
      throw new Error('请先选择要上传的头像图片。')
    }

    return { value, avatarPath, cleanupPaths }
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

    let prepared: PreparedProfileOperationInput | null = null

    try {
      prepared = await this.prepareInput(account, payload)
      const proxyPayload = serializeTelethonProxy(proxy)
      const { stdout } = await execFileAsync(this.pythonExecutable, [
        this.scriptPath,
        JSON.stringify({
          sessionPath: account.sessionPath,
          action: payload.action,
          value: prepared.value,
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
      if (!raw?.ok) {
        return {
          accountId: account.id,
          phone: account.phone,
          success: false,
          message: formatProfileError(typeof raw?.reason === 'string' ? raw.reason : '')
        }
      }

      let avatar = typeof account.profile?.avatar === 'string' ? account.profile.avatar : null
      let hasProfilePhoto = typeof raw.has_profile_photo === 'boolean' ? raw.has_profile_photo : null

      if (payload.action === 'custom-avatar' || payload.action === 'random-avatar') {
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
      return {
        accountId: account.id,
        phone: account.phone,
        success: false,
        message: formatProfileError(message)
      }
    } finally {
      if (prepared?.cleanupPaths?.length) {
        await Promise.allSettled(prepared.cleanupPaths.map((targetPath) => fs.promises.rm(targetPath, { force: true })))
      }
    }
  }
}
