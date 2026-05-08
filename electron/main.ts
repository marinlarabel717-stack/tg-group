import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAccountIpc } from './accounts/ipc'
import { AccountImportService } from './accounts/services/account-import-service'
import { AccountRepository } from './accounts/services/account-repository'
import { AccountStatusService } from './accounts/services/account-status-service'
import { createAccountsDatabase } from './accounts/services/database'
import { FileScanner } from './accounts/services/file-scanner'
import { JsonTemplateService } from './accounts/services/json-template-service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'

  const databasePath = path.join(app.getPath('userData'), 'accounts', 'accounts.db')
  const database = createAccountsDatabase(databasePath)
  const repository = new AccountRepository(database)
  const scanner = new FileScanner()
  const jsonTemplateService = new JsonTemplateService()
  const importService = new AccountImportService(repository, scanner, jsonTemplateService)
  const statusService = new AccountStatusService(repository)

  bindWindowControls()
  registerAccountIpc({
    getMainWindow: () => mainWindow,
    accountRepository: repository,
    accountImportService: importService,
    accountStatusService: statusService
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
