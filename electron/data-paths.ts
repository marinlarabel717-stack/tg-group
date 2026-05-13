import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function resolveBaseDirectory() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'))
  }

  return process.cwd()
}

export function resolveDataRootPath() {
  return path.join(resolveBaseDirectory(), 'data')
}

export function resolveDataPath(...segments: string[]) {
  return path.join(resolveDataRootPath(), ...segments)
}

export function ensureDataDirectories() {
  const dataRoot = resolveDataRootPath()
  const sessionsDirectory = resolveDataPath('sessions')

  fs.mkdirSync(dataRoot, { recursive: true })
  fs.mkdirSync(sessionsDirectory, { recursive: true })

  return {
    dataRoot,
    sessionsDirectory
  }
}
