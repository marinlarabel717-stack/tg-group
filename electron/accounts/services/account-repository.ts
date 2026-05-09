import fs from 'node:fs/promises'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AccountJsonProfile, AccountRecord, AccountStatus, CheckResultInput, UpsertAccountInput } from '../types'

interface AccountRow {
  id: number
  phone: string
  username: string
  user_id: string
  country: string
  proxy_display: string
  session_path: string
  json_path: string
  status: AccountStatus | 'duo'
  profile_json: string
  profile_source: 'json_import' | 'login_check'
  last_check_time: string | null
  last_online_time: string | null
  created_at: string
  updated_at: string
}

function parseProfileJson(raw: string): AccountJsonProfile {
  try {
    const parsed = JSON.parse(raw) as AccountJsonProfile
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapRow(row: AccountRow): AccountRecord {
  const normalizedStatus: AccountStatus = row.status === 'duo' ? 'multi_ip' : row.status

  return {
    id: row.id,
    phone: row.phone,
    username: row.username,
    userId: row.user_id,
    country: row.country,
    proxyDisplay: row.proxy_display || null,
    sessionPath: row.session_path,
    jsonPath: row.json_path,
    status: normalizedStatus,
    profile: parseProfileJson(row.profile_json),
    profileSource: row.profile_source,
    lastCheckTime: row.last_check_time,
    lastOnlineTime: row.last_online_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class AccountRepository {
  private readonly listStatement
  private readonly upsertStatement
  private readonly deleteByIdStatement
  private readonly deleteAllStatement
  private readonly updateStatusStatement
  private readonly applyCheckResultStatement

  constructor(private readonly database: Database.Database) {
    this.listStatement = this.database.prepare(`
      SELECT id, phone, username, user_id, country, proxy_display, session_path, json_path, status, profile_json, profile_source, last_check_time, last_online_time, created_at, updated_at
      FROM accounts
      ORDER BY created_at DESC, id DESC
    `)

    this.upsertStatement = this.database.prepare(`
      INSERT INTO accounts (
        phone, username, user_id, country, proxy_display, session_path, json_path, status, profile_json, profile_source, last_check_time, last_online_time, created_at, updated_at
      ) VALUES (
        @phone, @username, @userId, @country, @proxyDisplay, @sessionPath, @jsonPath, @status, @profileJson, @profileSource, @lastCheckTime, @lastOnlineTime, @createdAt, @updatedAt
      )
      ON CONFLICT(session_path) DO UPDATE SET
        phone = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.phone ELSE excluded.phone END,
        username = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.username ELSE excluded.username END,
        user_id = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.user_id ELSE excluded.user_id END,
        country = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.country ELSE excluded.country END,
        proxy_display = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.proxy_display ELSE excluded.proxy_display END,
        json_path = excluded.json_path,
        status = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.status ELSE excluded.status END,
        profile_json = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.profile_json ELSE excluded.profile_json END,
        profile_source = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.profile_source ELSE excluded.profile_source END,
        last_check_time = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.last_check_time ELSE excluded.last_check_time END,
        last_online_time = CASE WHEN accounts.profile_source = 'login_check' THEN accounts.last_online_time ELSE excluded.last_online_time END,
        updated_at = excluded.updated_at
    `)

    this.deleteByIdStatement = this.database.prepare('DELETE FROM accounts WHERE id = ?')
    this.deleteAllStatement = this.database.prepare('DELETE FROM accounts')
    this.updateStatusStatement = this.database.prepare(`
      UPDATE accounts
      SET status = @status,
          last_check_time = @lastCheckTime,
          last_online_time = @lastOnlineTime,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.applyCheckResultStatement = this.database.prepare(`
      UPDATE accounts
      SET phone = @phone,
          username = @username,
          user_id = @userId,
          country = @country,
          proxy_display = @proxyDisplay,
          status = @status,
          profile_json = @profileJson,
          profile_source = 'login_check',
          last_check_time = @lastCheckTime,
          last_online_time = @lastOnlineTime,
          updated_at = @updatedAt
      WHERE id = @id
    `)
  }

  list() {
    return (this.listStatement.all() as AccountRow[]).map(mapRow)
  }

  upsertMany(items: UpsertAccountInput[]) {
    const now = new Date().toISOString()
    const transaction = this.database.transaction((batch: UpsertAccountInput[]) => {
      for (const item of batch) {
        this.upsertStatement.run({
          ...item,
          proxyDisplay: item.proxyDisplay ?? '',
          profileJson: JSON.stringify(item.profile ?? {}),
          createdAt: now,
          updatedAt: now
        })
      }
    })

    transaction(items)
    return this.list()
  }

  deleteByIds(ids: number[]) {
    const transaction = this.database.transaction((batch: number[]) => {
      for (const id of batch) {
        this.deleteByIdStatement.run(id)
      }
    })

    transaction(ids)
    return this.list()
  }

  deleteAll() {
    this.deleteAllStatement.run()
    return this.list()
  }

  updateStatus(ids: number[], status: AccountStatus) {
    const now = new Date().toISOString()
    const lastOnlineTime = status === 'alive' ? now : null

    const transaction = this.database.transaction((batch: number[]) => {
      for (const id of batch) {
        this.updateStatusStatement.run({
          id,
          status,
          lastCheckTime: now,
          lastOnlineTime,
          updatedAt: now
        })
      }
    })

    transaction(ids)
    return this.list()
  }

  applyCheckResults(items: CheckResultInput[]) {
    const now = new Date().toISOString()

    const transaction = this.database.transaction((batch: CheckResultInput[]) => {
      for (const item of batch) {
        this.applyCheckResultStatement.run({
          id: item.id,
          phone: item.phone ?? '',
          username: item.username ?? '',
          userId: item.userId ?? '',
          country: item.country ?? '',
          proxyDisplay: item.proxyDisplay ?? '',
          status: item.status,
          profileJson: JSON.stringify(item.profile ?? {}),
          lastCheckTime: item.lastCheckTime ?? now,
          lastOnlineTime: item.lastOnlineTime ?? null,
          updatedAt: now
        })
      }
    })

    transaction(items)
    return this.list()
  }

  async exportByIds(ids: number[], targetDirectory: string) {
    const accounts = this.getByIds(ids)
    await fs.mkdir(targetDirectory, { recursive: true })

    for (const account of accounts) {
      const sessionFilename = path.basename(account.sessionPath)
      const sessionTargetPath = path.join(targetDirectory, sessionFilename)
      await fs.copyFile(account.sessionPath, sessionTargetPath)

      if (account.jsonPath) {
        const jsonFilename = path.basename(account.jsonPath)
        const jsonTargetPath = path.join(targetDirectory, jsonFilename)
        await fs.copyFile(account.jsonPath, jsonTargetPath)
      }
    }

    return accounts.length
  }

  getByIds(ids: number[]) {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(', ')
    const statement = this.database.prepare(`
      SELECT id, phone, username, user_id, country, proxy_display, session_path, json_path, status, profile_json, profile_source, last_check_time, last_online_time, created_at, updated_at
      FROM accounts
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `)

    return (statement.all(...ids) as AccountRow[]).map(mapRow)
  }
}
