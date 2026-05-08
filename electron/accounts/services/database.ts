import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { ACCOUNT_SCHEMA_SQL } from './schema'

export function createAccountsDatabase(dbFilePath: string) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true })

  const database = new Database(dbFilePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(ACCOUNT_SCHEMA_SQL)

  return database
}
