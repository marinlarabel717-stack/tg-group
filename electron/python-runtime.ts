import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { resolveRuntimeAssetPath } from './runtime-paths'

const REQUIRED_BUNDLED_RUNTIME_FILES = [
  ['python.exe'],
  ['pythonw.exe'],
  ['Lib', 'site-packages', 'telethon', '__init__.py'],
  ['Lib', 'site-packages', 'pyaes', '__init__.py'],
  ['Lib', 'site-packages', 'pyasn1', '__init__.py'],
  ['Lib', 'site-packages', 'rsa', '__init__.py'],
  ['Lib', 'site-packages', 'dotenv', '__init__.py']
]

export interface BundledPythonRuntimeCheckResult {
  ok: boolean
  runtimeRoot: string
  missingPaths: string[]
  message: string
}

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

export function checkBundledPythonRuntime(): BundledPythonRuntimeCheckResult {
  const runtimeRoot = resolveRuntimeAssetPath('python')
  if (!app.isPackaged) {
    return {
      ok: true,
      runtimeRoot,
      missingPaths: [],
      message: ''
    }
  }

  const missingPaths = REQUIRED_BUNDLED_RUNTIME_FILES
    .map((segments) => path.join(runtimeRoot, ...segments))
    .filter((targetPath) => !fs.existsSync(targetPath))

  if (missingPaths.length === 0) {
    return {
      ok: true,
      runtimeRoot,
      missingPaths: [],
      message: ''
    }
  }

  return {
    ok: false,
    runtimeRoot,
    missingPaths,
    message: [
      '当前软件包里的 Python 运行环境不完整，部分核心功能将无法使用。',
      '受影响功能通常包括：读取已加入群、群采集、2FA、冻结检测、SpamBot 检查。',
      '请重新下载或重新替换完整的 TG-Matrix 便携版后再试。'
    ].join('\n')
  }
}
