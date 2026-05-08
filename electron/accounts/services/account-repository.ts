import fs from 'node:fs/promises'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AccountRecord, AccountStatus, UpsertAccountInput } from '../types'

interface AccountRow {
  id: number
  phone: string
  username: string
  user_id: string
  country: string
  session_path: string
  json_path: string
  status: AccountStatus
  last_check_time: string | null
  last_online_time: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    phone: row.phone,
    username: row.username,
    userId: row.user_id,
    country: row.country,
    sessionPath: row.session_path,
    jsonPath: row.json_path,
    status: row.status,
    lastCheckTime: row.last_check_time,
    lastOnlineTime: row.last_online_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class AccountRepository {
  private readonly listStatement
  private readonly listByIdsStatement
  private readonly upsertStatement
  private readonly deleteByIdStatement
  private readonly deleteAllStatement
  private readonly updateStatusStatement

  constructor(private readonly database: Database.Database) {
    this.listStatement = this.database.prepare(`
      SELECT id, phone, username, user_id, country, session_path, json_path, status, last_check_time, last_online_time, created_at, updated_at
      FROM accounts
      ORDER BY created_at DESC, id DESC
    `)

    this.listByIdsStatement = this.database.prepare(`
      SELECT id, phone, username, user_id, country, session_path, json_path, status, last_check_time, last_online_time, created_at, updated_at
      FROM accounts
      WHERE id IN (${Array.from({ length: 500 }, (_, index) => `@id${index}`).join(', ')})
    `)

    this.upsertStatement = this.database.prepare(`
      INSERT INTO accounts (
        phone, username, user_id, country, session_path, json_path, status, last_check_time, last_online_time, created_at, updated_at
      ) VALUES (
        @phone, @username, @userId, @country, @sessionPath, @jsonPath, @status, @lastCheckTime, @lastOnlineTime, @createdAt, @updatedAt
      )
      ON CONFLICT(session_path) DO UPDATE SET
        phone = excluded.phone,
        username = excluded.username,
        user_id = excluded.user_id,
        country = excluded.country,
        json_path = excluded.json_path,
        status = excluded.status,
        last_check_time = excluded.last_check_time,
        last_online_time = excluded.last_online_time,
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

    const placeholders = ids.map((_, index) => `?`).join(', ')
    const statement = this.database.prepare(`
      SELECT id, phone, username, user_id, country, session_path, json_path, status, last_check_time, last_online_time, created_at, updated_at
      FROM accounts
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `)

    return (statement.all(...ids) as AccountRow[]).map(mapRow)
  }
}
