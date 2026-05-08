import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { ACCOUNT_SCHEMA_SQL } from './schema'

function ensureColumn(database: Database.Database, columnName: string, definitionSql: string) {
  const columns = database.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>
  const exists = columns.some((column) => column.name === columnName)
  if (!exists) {
    database.exec(`ALTER TABLE accounts ADD COLUMN ${definitionSql}`)
  }
}

export function createAccountsDatabase(dbFilePath: string) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true })

  const database = new Database(dbFilePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(ACCOUNT_SCHEMA_SQL)
  ensureColumn(database, 'profile_json', "profile_json TEXT NOT NULL DEFAULT '{}' ")
  ensureColumn(database, 'profile_source', "profile_source TEXT NOT NULL DEFAULT 'json_import'")

  return database
}
