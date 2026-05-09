import fs from 'node:fs/promises'
import Database from 'better-sqlite3'
import type { Session } from 'telegram/sessions'
import { getAuthKeyModule, getSessionsModule } from './gramjs-runtime'

const SQLITE_HEADER = 'SQLite format 3\u0000'

interface TelethonSessionRow {
  dc_id: number
  server_address: string
  port: number
  auth_key: Buffer
}

function looksLikeStringSession(content: string) {
  const value = content.trim()
  return value.length > 0 && /^[0-9A-Za-z+/=_:-]+$/.test(value)
}

function tryParseJsonStringSession(content: string) {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const candidate = [parsed.session, parsed.stringSession, parsed.sessionString].find((item) => typeof item === 'string')
    return typeof candidate === 'string' ? candidate : null
  } catch {
    return null
  }
}

export class SessionLoader {
  async load(sessionPath: string): Promise<Session> {
    const kind = await this.detectSessionKind(sessionPath)

    if (kind === 'sqlite') {
      return await this.loadSqliteSession(sessionPath)
    }

    return this.loadStringSession(sessionPath)
  }

  private async detectSessionKind(sessionPath: string) {
    const handle = await fs.open(sessionPath, 'r')

    try {
      const buffer = Buffer.alloc(16)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const header = buffer.subarray(0, bytesRead).toString('utf8')
      return header === SQLITE_HEADER ? 'sqlite' : 'string'
    } finally {
      await handle.close()
    }
  }

  private async loadStringSession(sessionPath: string): Promise<Session> {
    const raw = await fs.readFile(sessionPath, 'utf8')
    const jsonStringSession = tryParseJsonStringSession(raw)
    const sessionValue = jsonStringSession ?? raw.trim()

    if (!looksLikeStringSession(sessionValue)) {
      throw new Error('不支持的 Session 文件格式')
    }

    const { StringSession } = getSessionsModule()
    const session = new StringSession(sessionValue)
    await session.load()
    return session
  }

  private async loadSqliteSession(sessionPath: string): Promise<Session> {
    const database = new Database(sessionPath, { readonly: true, fileMustExist: true })

    try {
      const row = database.prepare('SELECT dc_id, server_address, port, auth_key FROM sessions ORDER BY dc_id LIMIT 1').get() as TelethonSessionRow | undefined
      if (!row || !row.auth_key) {
        throw new Error('Session 数据库缺少 auth_key')
      }

      const { StringSession } = getSessionsModule()
      const { AuthKey } = getAuthKeyModule()

      const session = new StringSession('')
      session.setDC(row.dc_id, row.server_address, row.port)

      const authKey = new AuthKey()
      await authKey.setKey(row.auth_key)
      session.setAuthKey(authKey, row.dc_id)

      return session
    } finally {
      database.close()
    }
  }
}
