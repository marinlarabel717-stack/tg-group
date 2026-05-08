import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAccountIpc } from './accounts/ipc'
import { AccountCheckEngine } from './accounts/check-engine/check-engine'
import { CheckQueue } from './accounts/check-engine/check-queue'
import { CheckResultWriter } from './accounts/check-engine/check-result-writer'
import { SessionLoader } from './accounts/check-engine/session-loader'
import { SpamBotChecker } from './accounts/check-engine/spam-bot-checker'
import { StatusResolver } from './accounts/check-engine/status-resolver'
import { TelegramClientManager } from './accounts/check-engine/telegram-client-manager'
import { AccountUpdateService } from './accounts/check-engine/account-update-service'
import { AccountImportService } from './accounts/services/account-import-service'
import { AccountRepository } from './accounts/services/account-repository'
import { AccountStatusService } from './accounts/services/account-status-service'
import { createAccountsDatabase } from './accounts/services/database'
import { FileScanner } from './accounts/services/file-scanner'
import { JsonTemplateService } from './accounts/services/json-template-service'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1320,
    minHeight: 860,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    show: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#08101d',
    autoHideMenuBar: true,
    title: 'Telegram Multi Account Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

function bindWindowControls() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }

    mainWindow.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
  })
}

async function bootstrap() {
  nativeTheme.themeSource = 'dark'

  const accountsRootPath = path.join(app.getPath('userData'), 'accounts')
  const databasePath = path.join(accountsRootPath, 'accounts.db')
  const managedSessionsDirectory = path.join(accountsRootPath, 'sessions')
  const database = await createAccountsDatabase(databasePath)
  const repository = new AccountRepository(database)
  const scanner = new FileScanner()
  const jsonTemplateService = new JsonTemplateService()
  const importService = new AccountImportService(repository, scanner, jsonTemplateService, managedSessionsDirectory)
  const statusService = new AccountStatusService(repository)

  const sessionLoader = new SessionLoader()
  const clientManager = new TelegramClientManager()
  const spamBotChecker = new SpamBotChecker()
  const statusResolver = new StatusResolver()
  const updateService = new AccountUpdateService()
  const resultWriter = new CheckResultWriter(repository)
  const checkEngine = new AccountCheckEngine(
    repository,
    sessionLoader,
    clientManager,
    spamBotChecker,
    statusResolver,
    updateService,
    resultWriter
  )
  const checkQueue = new CheckQueue(checkEngine, {
    concurrency: 3,
    timeoutMs: 25000,
    retryLimit: 2
  })

  await importService.syncManagedSessions()

  bindWindowControls()
  registerAccountIpc({
    getMainWindow: () => mainWindow,
    accountRepository: repository,
    accountImportService: importService,
    accountStatusService: statusService,
    checkQueue
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.whenReady()
  .then(() => bootstrap())
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('应用启动失败：', message)
    dialog.showErrorBox('应用启动失败', message)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
