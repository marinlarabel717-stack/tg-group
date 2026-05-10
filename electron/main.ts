import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import fs from 'node:fs'
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
import { TelethonFreezeChecker } from './accounts/check-engine/telethon-freeze-checker'
import { AccountUpdateService } from './accounts/check-engine/account-update-service'
import { AccountImportService } from './accounts/services/account-import-service'
import { AccountRepository } from './accounts/services/account-repository'
import type { AccountRecord } from './accounts/types'
import { AccountStatusService } from './accounts/services/account-status-service'
import { createAccountsDatabase } from './accounts/services/database'
import { FileScanner } from './accounts/services/file-scanner'
import { JsonTemplateService } from './accounts/services/json-template-service'
import { TelegramWebService } from './accounts/telegram-web-service'
import { TelegramDesktopPremiumService } from './accounts/telegram-desktop-premium-service'
import { AppSettingsStore } from './app-settings-store'
import { ProxyPoolService } from './proxy-pool/service'
import { resolveRuntimeAssetPath } from './runtime-paths'
import { LicenseStore } from './license/license-store'
import { LicenseService } from './license/license-service'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let managedSessionsWatcher: fs.FSWatcher | null = null
let managedSessionsSyncTimer: NodeJS.Timeout | null = null

function createWindow() {
  const appTitle = app.getName()

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
    title: appTitle,
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

function emitAccountsUpdated(accounts: AccountRecord[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('accounts:updated', accounts)
}

function bindManagedSessionsWatcher(importService: AccountImportService, repository: AccountRepository, managedSessionsDirectory: string) {
  managedSessionsWatcher?.close()
  managedSessionsWatcher = fs.watch(managedSessionsDirectory, { persistent: false }, () => {
    if (managedSessionsSyncTimer) {
      clearTimeout(managedSessionsSyncTimer)
    }

    managedSessionsSyncTimer = setTimeout(() => {
      void importService.syncManagedSessions()
        .then(() => emitAccountsUpdated(repository.list()))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.error('同步 sessions 目录失败：', message)
        })
    }, 220)
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
  const settingsPath = path.join(app.getPath('userData'), 'settings.json')
  const licensePath = path.join(app.getPath('userData'), 'license.json')
  const database = await createAccountsDatabase(databasePath)
  const appSettingsStore = new AppSettingsStore(settingsPath)
  const licenseStore = new LicenseStore(licensePath)
  const licenseService = new LicenseService(licenseStore)
  const proxyPoolStoragePath = path.join(app.getPath('userData'), 'proxy-pool.json')
  const appSettings = appSettingsStore.get()
  const repository = new AccountRepository(database)
  const proxyPoolService = new ProxyPoolService(proxyPoolStoragePath)
  const scanner = new FileScanner()
  const jsonTemplateService = new JsonTemplateService()
  const importService = new AccountImportService(repository, scanner, jsonTemplateService, managedSessionsDirectory)
  const statusService = new AccountStatusService(repository)

  const sessionLoader = new SessionLoader()
  const telethonFreezeChecker = new TelethonFreezeChecker()
  const clientManager = new TelegramClientManager()
  const telegramWebPreloadPath = resolveRuntimeAssetPath('accounts', 'telegram-web-preload.cjs')
  const telegramWebService = new TelegramWebService(sessionLoader, clientManager, telegramWebPreloadPath, proxyPoolService)
  const telegramDesktopPremiumService = new TelegramDesktopPremiumService(
    accountsRootPath,
    sessionLoader,
    clientManager
  )
  const spamBotChecker = new SpamBotChecker()
  const statusResolver = new StatusResolver()
  const updateService = new AccountUpdateService(accountsRootPath)
  const resultWriter = new CheckResultWriter(repository, {
    onWrite: (accounts) => emitAccountsUpdated(accounts)
  })
  const checkEngine = new AccountCheckEngine(
    repository,
    sessionLoader,
    telethonFreezeChecker,
    clientManager,
    spamBotChecker,
    statusResolver,
    updateService,
    resultWriter,
    proxyPoolService
  )
  const checkQueue = new CheckQueue(checkEngine, {
    concurrency: appSettings.checkConcurrency,
    timeoutMs: 25000,
    retryLimit: 2
  })

  await proxyPoolService.init()

  const emitProxyPoolState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('proxy-pool:state', proxyPoolService.getState())
  }

  proxyPoolService.on('state', emitProxyPoolState)

  ipcMain.handle('proxy-pool:get-state', () => proxyPoolService.getState())
  ipcMain.handle('proxy-pool:replace-list', (_event, text: string) => proxyPoolService.replaceProxyList(text))
  ipcMain.handle('proxy-pool:update-settings', (_event, patch) => proxyPoolService.updateSettings(patch))
  ipcMain.handle('proxy-pool:clear-logs', () => proxyPoolService.clearLogs())
  ipcMain.handle('proxy-pool:start-check', () => proxyPoolService.startCheck())
  ipcMain.handle('license:get-state', () => licenseService.getSnapshot())
  ipcMain.handle('license:activate', (_event, cardKey: string) => licenseService.activate(cardKey))
  ipcMain.handle('license:clear', () => licenseService.clear())

  await importService.syncManagedSessions()

  bindManagedSessionsWatcher(importService, repository, managedSessionsDirectory)
  bindWindowControls()
  registerAccountIpc({
    getMainWindow: () => mainWindow,
    accountRepository: repository,
    accountImportService: importService,
    accountStatusService: statusService,
    checkQueue,
    appSettingsStore,
    telegramWebService,
    telegramDesktopPremiumService,
    emitAccountsUpdated
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
