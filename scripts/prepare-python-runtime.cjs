const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = process.cwd()
const venvRoot = path.join(projectRoot, '.venv')
const pyvenvPath = path.join(venvRoot, 'pyvenv.cfg')
const outputRoot = path.join(projectRoot, 'build', 'runtime', 'python')
const preferredPythonExe = process.env.TGMATRIX_PYTHON_EXE?.trim() || ''

const PYTHON_INFO_SCRIPT = [
  'import json, os, site, sys, sysconfig',
  'candidates = []',
  'def push(value):',
  '    if isinstance(value, str) and value and value not in candidates and os.path.exists(value):',
  '        candidates.append(value)',
  'for value in (sysconfig.get_path("purelib"), sysconfig.get_path("platlib")):',
  '    push(value)',
  'for value in getattr(site, "getsitepackages", lambda: [])() or []:',
  '    push(value)',
  'for value in sys.path:',
  '    if isinstance(value, str) and "site-packages" in value.lower():',
  '        push(value)',
  'print(json.dumps({',
  '  "executable": sys.executable,',
  '  "version": list(sys.version_info[:3]),',
  '  "base_prefix": sys.base_prefix,',
  '  "prefix": sys.prefix,',
  '  "site_packages": candidates',
  '}))'
].join('\n')

const REQUIRED_PYTHON_PACKAGES = [
  'telethon',
  'pyaes',
  'pyasn1',
  'rsa',
  'dotenv'
]

const OPTIONAL_PACKAGE_PATTERNS = [
  /^tgcrypto(?:\..+)?\.pyd$/i,
  /^tgcrypto$/i
]

const OPTIONAL_BASE_FILES = [
  'vcruntime140.dll',
  'vcruntime140_1.dll',
  'msvcp140.dll'
]

const REQUIRED_BASE_DIRS = [
  'DLLs',
  'Lib'
]

const SKIP_LIB_DIRS = new Set([
  'site-packages',
  'ensurepip',
  'idlelib',
  'test',
  'tests',
  'tkinter',
  'turtledemo',
  '__phello__'
])

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true })
}

function cleanDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true })
  ensureDir(targetPath)
}

function copyFileIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) {
    throw new Error(`缺少运行时文件：${fromPath}`)
  }
  ensureDir(path.dirname(toPath))
  fs.copyFileSync(fromPath, toPath)
}

function copyFileIfPresent(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) {
    return false
  }
  ensureDir(path.dirname(toPath))
  fs.copyFileSync(fromPath, toPath)
  return true
}

function copyDirectory(fromPath, toPath, filter) {
  ensureDir(toPath)
  for (const entry of fs.readdirSync(fromPath, { withFileTypes: true })) {
    const fromEntry = path.join(fromPath, entry.name)
    const toEntry = path.join(toPath, entry.name)
    if (filter && filter(fromEntry, toEntry, entry) === false) {
      continue
    }
    if (entry.isDirectory()) {
      copyDirectory(fromEntry, toEntry, filter)
    } else if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(fromEntry)
      const stat = fs.statSync(realPath)
      if (stat.isDirectory()) {
        copyDirectory(realPath, toEntry, filter)
      } else {
        ensureDir(path.dirname(toEntry))
        fs.copyFileSync(realPath, toEntry)
      }
    } else {
      ensureDir(path.dirname(toEntry))
      fs.copyFileSync(fromEntry, toEntry)
    }
  }
}

function parsePyvenvHome(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const line = content.split(/\r?\n/).find((item) => item.toLowerCase().startsWith('home = '))
  if (!line) {
    throw new Error('pyvenv.cfg 里没有 home 配置，没法定位基础 Python。')
  }

  const home = line.split('=').slice(1).join('=').trim()
  if (!home) {
    throw new Error('pyvenv.cfg 的 home 是空的，没法定位基础 Python。')
  }
  return home
}

function runPythonInfo(executable, args) {
  const result = spawnSync(executable, [...args, '-c', PYTHON_INFO_SCRIPT], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true
  })

  if (result.error || result.status !== 0) {
    return null
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : ''
  if (!stdout) return null

  try {
    const parsed = JSON.parse(stdout)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function findExistingSitePackages(candidates) {
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    const hasAllRequired = REQUIRED_PYTHON_PACKAGES.every((name) => fs.existsSync(path.join(candidate, name)))
    if (hasAllRequired) {
      return candidate
    }
  }
  return null
}

function resolvePythonSource() {
  const sources = []

  if (preferredPythonExe) {
    sources.push({ kind: 'custom-exe', label: `环境变量 TGMATRIX_PYTHON_EXE=${preferredPythonExe}`, executable: preferredPythonExe, args: [] })
  }

  if (fs.existsSync(pyvenvPath)) {
    const venvPython = path.join(venvRoot, 'Scripts', 'python.exe')
    if (fs.existsSync(venvPython)) {
      sources.push({ kind: 'venv-exe', label: `.venv: ${venvPython}`, executable: venvPython, args: [] })
    }

    const pythonHome = parsePyvenvHome(pyvenvPath)
    sources.push({
      kind: 'pyvenv-home',
      label: `pyvenv.cfg: ${pyvenvPath}`,
      pythonHome,
      sitePackages: path.join(venvRoot, 'Lib', 'site-packages')
    })
  }

  sources.push(
    { kind: 'launcher', label: 'py -3.11', executable: 'py', args: ['-3.11'] },
    { kind: 'python', label: 'python', executable: 'python', args: [] },
    { kind: 'launcher', label: 'py -3', executable: 'py', args: ['-3'] }
  )

  const tried = []

  for (const source of sources) {
    if (source.kind === 'pyvenv-home') {
      if (!fs.existsSync(source.pythonHome)) {
        tried.push(`${source.label}（基础 Python 不存在：${source.pythonHome}）`)
        continue
      }
      if (!fs.existsSync(source.sitePackages)) {
        tried.push(`${source.label}（site-packages 不存在：${source.sitePackages}）`)
        continue
      }

      const requiredMissing = REQUIRED_PYTHON_PACKAGES.filter((name) => !fs.existsSync(path.join(source.sitePackages, name)))
      if (requiredMissing.length > 0) {
        tried.push(`${source.label}（缺少依赖：${requiredMissing.join(', ')}）`)
        continue
      }

      return {
        label: source.label,
        pythonHome: source.pythonHome,
        sitePackages: source.sitePackages,
        version: null,
        dllName: null
      }
    }

    const info = runPythonInfo(source.executable, source.args)
    if (!info) {
      tried.push(`${source.label}（无法读取 Python 信息）`)
      continue
    }

    const version = Array.isArray(info.version) ? info.version : []
    const major = Number(version[0] ?? 0)
    const minor = Number(version[1] ?? 0)
    const dllName = major > 0 && minor >= 0 ? `python${major}${minor}.dll` : null
    const pythonHome = typeof info.base_prefix === 'string' && info.base_prefix.trim()
      ? info.base_prefix.trim()
      : typeof info.prefix === 'string' && info.prefix.trim()
        ? info.prefix.trim()
        : ''
    const sitePackages = findExistingSitePackages(Array.isArray(info.site_packages) ? info.site_packages : [])

    if (!pythonHome || !fs.existsSync(pythonHome)) {
      tried.push(`${source.label}（基础 Python 目录不可用）`)
      continue
    }
    if (!sitePackages) {
      tried.push(`${source.label}（没找到包含 Telethon 依赖的 site-packages）`)
      continue
    }

    return {
      label: source.label,
      pythonHome,
      sitePackages,
      version: [major, minor, Number(version[2] ?? 0)],
      dllName
    }
  }

  throw new Error([
    '没找到可打包的 Python 运行环境。',
    '可选解决办法：',
    '1. 在项目目录创建 .venv，并装好 Telethon 相关依赖；',
    '2. 或先安装 Python 3，并确保当前解释器里已有 telethon / pyaes / pyasn1 / rsa / dotenv；',
    '3. 或手动设置环境变量 TGMATRIX_PYTHON_EXE 指向可用的 python.exe。',
    `已尝试：${tried.join('；') || '无'}`
  ].join('\n'))
}

function copyOptionalPackages(sitePackagesPath, bundledSitePackages) {
  const entries = fs.existsSync(sitePackagesPath)
    ? fs.readdirSync(sitePackagesPath, { withFileTypes: true })
    : []

  for (const entry of entries) {
    if (!OPTIONAL_PACKAGE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      continue
    }

    const sourcePath = path.join(sitePackagesPath, entry.name)
    const targetPath = path.join(bundledSitePackages, entry.name)
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, (_from, _to, child) => child.name !== '__pycache__')
    } else {
      copyFileIfExists(sourcePath, targetPath)
    }
  }
}

function main() {
  const resolved = resolvePythonSource()
  const pythonHome = resolved.pythonHome
  const sitePackages = resolved.sitePackages
  const dllName = resolved.dllName || 'python311.dll'

  cleanDir(outputRoot)

  const requiredBaseFiles = [
    'python.exe',
    'pythonw.exe',
    dllName,
    'python3.dll'
  ]

  for (const fileName of requiredBaseFiles) {
    copyFileIfExists(path.join(pythonHome, fileName), path.join(outputRoot, fileName))
  }

  for (const fileName of OPTIONAL_BASE_FILES) {
    copyFileIfPresent(path.join(pythonHome, fileName), path.join(outputRoot, fileName))
  }

  for (const dirName of REQUIRED_BASE_DIRS) {
    const sourceDir = path.join(pythonHome, dirName)
    const targetDir = path.join(outputRoot, dirName)
    copyDirectory(sourceDir, targetDir, (_from, _to, entry) => {
      if (dirName === 'Lib' && entry.isDirectory() && SKIP_LIB_DIRS.has(entry.name)) {
        return false
      }
      if (entry.name === '__pycache__') {
        return false
      }
      return true
    })
  }

  const bundledSitePackages = path.join(outputRoot, 'Lib', 'site-packages')
  ensureDir(bundledSitePackages)
  for (const name of REQUIRED_PYTHON_PACKAGES) {
    const sourcePath = path.join(sitePackages, name)
    const targetPath = path.join(bundledSitePackages, name)
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Python 环境缺少依赖：${sourcePath}`)
    }
    const stat = fs.statSync(sourcePath)
    if (stat.isDirectory()) {
      copyDirectory(sourcePath, targetPath, (_from, _to, entry) => entry.name !== '__pycache__')
    } else {
      copyFileIfExists(sourcePath, targetPath)
    }
  }

  copyOptionalPackages(sitePackages, bundledSitePackages)

  console.log(`Bundled Python runtime ready: ${outputRoot}`)
  console.log(`Python source: ${resolved.label}`)
  console.log(`Site-packages: ${sitePackages}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
