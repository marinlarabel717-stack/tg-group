const fs = require('node:fs')
const path = require('node:path')

const projectRoot = process.cwd()
const venvRoot = path.join(projectRoot, '.venv')
const pyvenvPath = path.join(venvRoot, 'pyvenv.cfg')
const outputRoot = path.join(projectRoot, 'build', 'runtime', 'python')
const venvSitePackages = path.join(venvRoot, 'Lib', 'site-packages')

const REQUIRED_BASE_FILES = [
  'python.exe',
  'pythonw.exe',
  'python311.dll',
  'python3.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll'
]

const REQUIRED_BASE_DIRS = [
  'DLLs',
  'Lib'
]

const REQUIRED_PACKAGES = [
  'telethon',
  'pyaes',
  'pyasn1',
  'rsa',
  'dotenv',
  'tgcrypto.cp311-win_amd64.pyd'
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

function parsePyvenvHome(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到 pyvenv.cfg：${filePath}`)
  }

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

function main() {
  const pythonHome = parsePyvenvHome(pyvenvPath)
  if (!fs.existsSync(pythonHome)) {
    throw new Error(`基础 Python 目录不存在：${pythonHome}`)
  }
  if (!fs.existsSync(venvSitePackages)) {
    throw new Error(`找不到虚拟环境 site-packages：${venvSitePackages}`)
  }

  cleanDir(outputRoot)

  for (const fileName of REQUIRED_BASE_FILES) {
    copyFileIfExists(path.join(pythonHome, fileName), path.join(outputRoot, fileName))
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
  for (const name of REQUIRED_PACKAGES) {
    const sourcePath = path.join(venvSitePackages, name)
    const targetPath = path.join(bundledSitePackages, name)
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`虚拟环境缺少依赖：${sourcePath}`)
    }
    const stat = fs.statSync(sourcePath)
    if (stat.isDirectory()) {
      copyDirectory(sourcePath, targetPath, (_from, _to, entry) => entry.name !== '__pycache__')
    } else {
      copyFileIfExists(sourcePath, targetPath)
    }
  }

  console.log(`Bundled Python runtime ready: ${outputRoot}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
