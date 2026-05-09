import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { ACCOUNT_SCHEMA_SQL } from './schema'

function ensureColumn(database: Database.Database, columnName: string, definitionSql: string) {
  const columns = database.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  const exists = columns.some((column) => column.name === columnName)
  if (!exists) {
    database.exec(`ALTER TABLE accounts ADD COLUMN ${definitionSql}`)
  }
}

function normalizeNativeModuleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('NODE_MODULE_VERSION')) {
    return [
      'better-sqlite3 本地模块版本与当前 Electron 不匹配。',
      '请先执行：npm install',
      '如果仍失败，再安装 Python 3 和 Visual Studio C++ Build Tools，随后执行：npm run rebuild:native'
    ].join('\n')
  }

  return message
}

export async function createAccountsDatabase(dbFilePath: string) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true })

  try {
    const module = await import('better-sqlite3')
    const BetterSqlite3 = module.default
    const database = new BetterSqlite3(dbFilePath)
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    database.exec(ACCOUNT_SCHEMA_SQL)
    ensureColumn(database, 'profile_json', "profile_json TEXT NOT NULL DEFAULT '{}' ")
    ensureColumn(database, 'profile_source', "profile_source TEXT NOT NULL DEFAULT 'json_import'")
    ensureColumn(database, 'proxy_display', "proxy_display TEXT NOT NULL DEFAULT ''")
    return database
  } catch (error) {
    throw new Error(normalizeNativeModuleError(error))
  }
}
