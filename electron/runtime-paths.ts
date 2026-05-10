import { app } from 'electron'
import path from 'node:path'

export function resolveRuntimeAssetPath(...segments: string[]) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime', ...segments)
  }

  return path.resolve(process.cwd(), 'electron', ...segments)
}
