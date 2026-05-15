import fs from 'node:fs'
import path from 'node:path'
import { resolveRuntimeAssetPath } from './runtime-paths'

export function resolvePythonExecutable() {
  const bundledRuntime = resolveRuntimeAssetPath('python', 'python.exe')
  const candidates = [
    bundledRuntime,
    path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
    path.resolve(process.cwd(), '.venv', 'bin', 'python'),
    'python'
  ]

  return candidates.find((candidate) => candidate === 'python' || fs.existsSync(candidate)) ?? 'python'
}

export function buildTelethonPythonEnv() {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    ACCOUNT_CHECK_API_ID: process.env.ACCOUNT_CHECK_API_ID || '2040',
    ACCOUNT_CHECK_API_HASH: process.env.ACCOUNT_CHECK_API_HASH || 'b18441a1ff607e10a989891a5462e627'
  }
}
