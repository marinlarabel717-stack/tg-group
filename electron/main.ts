import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
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
import { TelethonAccountSurvivalService } from './accounts/check-engine/telethon-account-survival-service'
import { TelegramClientManager } from './accounts/check-engine/telegram-client-manager'
import { TelethonFreezeChecker } from './accounts/check-engine/telethon-freeze-checker'
import { TelethonSpamBotChecker } from './accounts/check-engine/telethon-spambot-checker'
import { AccountUpdateService } from './accounts/check-engine/account-update-service'
import { AccountImportService } from './accounts/services/account-import-service'
import { AccountRepository } from './accounts/services/account-repository'
import { serializeAccountsForRenderer } from './accounts/services/account-renderer-serializer'
import type { AccountRecord } from './accounts/types'
import { AccountStatusService } from './accounts/services/account-status-service'
import { createAccountsDatabase } from './accounts/services/database'
import { FileScanner } from './accounts/services/file-scanner'
import { JsonTemplateService } from './accounts/services/json-template-service'
import { TelegramWebService } from './accounts/telegram-web-service'
import { TelegramDesktopPremiumService } from './accounts/telegram-desktop-premium-service'
import { TelegramReauthorizationService } from './accounts/telegram-reauthorization-service'
import { TelethonPremiumReader } from './accounts/telethon-premium-reader'
import { TelethonWebStateReader } from './accounts/telethon-web-state-reader'
import { TelethonTwoFactorService } from './accounts/telethon-two-factor-service'
import { TelethonProfileService } from './accounts/telethon-profile-service'
import { AppSettingsStore } from './app-settings-store'
import { ProxyPoolService } from './proxy-pool/service'
import { ensureDataDirectories, resolveDataPath } from './data-paths'
import { resolveRuntimeAssetPath } from './runtime-paths'
import { LicenseStore } from './license/license-store'
import { LicenseService } from './license/license-service'
import { BroadcastService } from './broadcast/service'
import { registerBroadcastIpc } from './broadcast/ipc'
import { TelethonJoinedGroupReader } from './broadcast/telethon-joined-group-reader'
import { TelethonScheduledMessageService } from './broadcast/telethon-scheduled-message-service'
import { DirectMessageService } from './direct-message/service'
import { TelethonGroupCollector } from './direct-message/telethon-group-collector'
import { TelethonDirectMessageSender } from './direct-message/telethon-direct-message-sender'
import { registerDirectMessageIpc } from './direct-message/ipc'
import { AutoJoinService } from './auto-join/service'
import { TelethonAutoJoiner } from './auto-join/telethon-auto-joiner'
import { registerAutoJoinIpc } from './auto-join/ipc'
import { GroupInviteService } from './group-invite/service'
import { registerGroupInviteIpc } from './group-invite/ipc'
import { SessionManagerService } from './session-manager/service'
import { registerSessionManagerIpc } from './session-manager/ipc'
import { BatchCreateService } from './batch-create/service'
import { registerBatchCreateIpc } from './batch-create/ipc'
import { OtherToolsService } from './other-tools/service'
import { registerOtherToolsIpc } from './other-tools/ipc'
import { DesktopAppUpdater } from './app-updater'
import { BotCenterService } from './bot-center/service'
import { registerBotCenterIpc } from './bot-center/ipc'
import { checkBundledPythonRuntime } from './python-runtime'

const BRAND_NAME = 'TG-Matrix'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let managedSessionsWatcher: fs.FSWatcher | null = null
let managedSessionsSyncTimer: NodeJS.Timeout | null = null
let managedSessionsWatcherSuspendCount = 0
let desktopAppUpdater: DesktopAppUpdater | null = null
let botCenterService: BotCenterService | null = null

const APP_WINDOW_BOUNDS = {
  width: 1600,
  height: 1000,
  minWidth: 1320,
  minHeight: 860,
  resizable: true
} as const

const LICENSE_WINDOW_BOUNDS = {
  width: 500,
  height: 420,
  minWidth: 500,
  minHeight: 420,
  resizable: false
} as const

function applyWindowMode(mode: 'license' | 'app') {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const target = mode === 'license' ? LICENSE_WINDOW_BOUNDS : APP_WINDOW_BOUNDS

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  }

  mainWindow.setResizable(target.resizable)
  mainWindow.setMinimumSize(target.minWidth, target.minHeight)
  mainWindow.setSize(target.width, target.height, true)
  mainWindow.setHasShadow(mode !== 'license')
  mainWindow.center()
}

function createWindow() {
  const appTitle = BRAND_NAME
  const appIconPath = app.isPackaged
    ? resolveRuntimeAssetPath('app', 'icon.png')
    : path.join(process.cwd(), 'build', 'icon.png')

  mainWindow = new BrowserWindow({
    width: LICENSE_WINDOW_BOUNDS.width,
    height: LICENSE_WINDOW_BOUNDS.height,
    minWidth: LICENSE_WINDOW_BOUNDS.minWidth,
    minHeight: LICENSE_WINDOW_BOUNDS.minHeight,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    show: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    transparent: true,
    hasShadow: false,
    roundedCorners: true,
    resizable: LICENSE_WINDOW_BOUNDS.resizable,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    title: appTitle,
    icon: process.platform === 'darwin' ? undefined : appIconPath,
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

  mainWindow.webContents.on('context-menu', (event, params) => {
    const hasSelection = Boolean(params.selectionText?.trim())
    const isEditable = params.isEditable

    if (!isEditable && !hasSelection) {
      return
    }

    const menu = Menu.buildFromTemplate([
      ...(isEditable ? [
        { role: 'undo' as const, label: '撤销' },
        { role: 'redo' as const, label: '重做' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: '剪切' },
        { role: 'copy' as const, label: '复制' },
        { role: 'paste' as const, label: '粘贴' },
        { role: 'selectAll' as const, label: '全选' }
      ] : [
        { role: 'copy' as const, label: '复制' },
        { role: 'selectAll' as const, label: '全选' }
      ])
    ])

    event.preventDefault()
    menu.popup({ window: mainWindow ?? undefined })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

function emitAccountsUpdated(accounts: AccountRecord[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('accounts:updated', serializeAccountsForRenderer(accounts))
}

async function withManagedSessionsWatcherSuspended<T>(action: () => Promise<T>) {
  managedSessionsWatcherSuspendCount += 1
  try {
    return await action()
  } finally {
    managedSessionsWatcherSuspendCount = Math.max(0, managedSessionsWatcherSuspendCount - 1)
  }
}

function bindManagedSessionsWatcher(importService: AccountImportService, repository: AccountRepository, managedSessionsDirectory: string) {
  managedSessionsWatcher?.close()
  managedSessionsWatcher = fs.watch(managedSessionsDirectory, { persistent: false }, (_eventType, filename) => {
    if (managedSessionsWatcherSuspendCount > 0) return

    const lowerName = typeof filename === 'string' ? filename.toLowerCase() : ''
    if (!lowerName || /\.(json|session(?:-journal|-wal|-shm)?)$/i.test(lowerName)) {
      return
    }

    if (managedSessionsSyncTimer) {
      clearTimeout(managedSessionsSyncTimer)
    }

    managedSessionsSyncTimer = setTimeout(() => {
      if (managedSessionsWatcherSuspendCount > 0) return

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
  ipcMain.on('desktop-info:get-version', (event) => {
    event.returnValue = app.getVersion()
  })

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

  ipcMain.handle('window:set-mode', (_event, mode: 'license' | 'app') => {
    applyWindowMode(mode)
    return true
  })

  ipcMain.handle('window:open-external', async (_event, url: string) => {
    if (!url || typeof url !== 'string') return false
    await shell.openExternal(url)
    return true
  })
}

async function bootstrap() {
  nativeTheme.themeSource = 'dark'
  app.setName(BRAND_NAME)

  const bundledPythonRuntime = checkBundledPythonRuntime()
  if (!bundledPythonRuntime.ok) {
    console.error('包内 Python runtime 缺失：', bundledPythonRuntime.missingPaths)
    dialog.showErrorBox('TG-Matrix 运行环境不完整', bundledPythonRuntime.message)
  }

  const { dataRoot, sessionsDirectory } = ensureDataDirectories()
  const accountsRootPath = dataRoot
  const databasePath = resolveDataPath('accounts.db')
  const managedSessionsDirectory = sessionsDirectory
  const settingsPath = resolveDataPath('settings.json')
  const licensePath = resolveDataPath('license.json')
  const database = await createAccountsDatabase(databasePath)
  const appSettingsStore = new AppSettingsStore(settingsPath)
  const licenseStore = new LicenseStore(licensePath)
  const licenseService = new LicenseService(licenseStore, appSettingsStore)
  const proxyPoolStoragePath = resolveDataPath('proxy-pool.json')
  const botCenterStoragePath = resolveDataPath('bot-center.json')
  const appSettings = appSettingsStore.get()
  const repository = new AccountRepository(database)
  const proxyPoolService = new ProxyPoolService(proxyPoolStoragePath)
  const scanner = new FileScanner()
  const jsonTemplateService = new JsonTemplateService()
  const importService = new AccountImportService(repository, scanner, jsonTemplateService, managedSessionsDirectory)
  const statusService = new AccountStatusService(repository)

  const sessionLoader = new SessionLoader()
  const telethonAccountSurvivalService = new TelethonAccountSurvivalService()
  const telethonFreezeChecker = new TelethonFreezeChecker()
  const telethonSpamBotChecker = new TelethonSpamBotChecker()
  const clientManager = new TelegramClientManager()
  const telegramWebPreloadPath = resolveRuntimeAssetPath('accounts', 'telegram-web-preload.cjs')
  const telethonWebStateReader = new TelethonWebStateReader()
  const telegramWebService = new TelegramWebService(sessionLoader, clientManager, telegramWebPreloadPath, proxyPoolService, telethonWebStateReader)
  const telethonPremiumReader = new TelethonPremiumReader()
  const telegramDesktopPremiumService = new TelegramDesktopPremiumService(
    accountsRootPath,
    sessionLoader,
    clientManager,
    telethonPremiumReader,
    proxyPoolService
  )
  const telegramReauthorizationService = new TelegramReauthorizationService(sessionLoader, clientManager, proxyPoolService)
  const telethonTwoFactorService = new TelethonTwoFactorService()
  const telethonProfileService = new TelethonProfileService()
  const spamBotChecker = new SpamBotChecker()
  const statusResolver = new StatusResolver()
  const updateService = new AccountUpdateService(accountsRootPath)
  const telethonJoinedGroupReader = new TelethonJoinedGroupReader()
  const telethonScheduledMessageService = new TelethonScheduledMessageService()
  const broadcastService = new BroadcastService(repository, sessionLoader, clientManager, proxyPoolService, telethonJoinedGroupReader, telethonScheduledMessageService)
  const telethonGroupCollector = new TelethonGroupCollector()
  const telethonDirectMessageSender = new TelethonDirectMessageSender()
  const telethonAutoJoiner = new TelethonAutoJoiner()
  const directMessageService = new DirectMessageService(repository, sessionLoader, clientManager, proxyPoolService, telethonGroupCollector, telethonDirectMessageSender)
  const autoJoinService = new AutoJoinService(repository, sessionLoader, clientManager, proxyPoolService, telethonFreezeChecker, telethonAutoJoiner)
  const groupInviteService = new GroupInviteService(repository, sessionLoader, clientManager, proxyPoolService)
  const sessionManagerService = new SessionManagerService(repository, sessionLoader, clientManager, proxyPoolService)
  const batchCreateService = new BatchCreateService(repository, sessionLoader, clientManager, proxyPoolService)
  const otherToolsService = new OtherToolsService(repository, sessionLoader, clientManager, proxyPoolService)
  botCenterService = new BotCenterService(botCenterStoragePath)
  const resultWriter = new CheckResultWriter(repository)
  const checkEngine = new AccountCheckEngine(
    repository,
    sessionLoader,
    telethonAccountSurvivalService,
    telethonFreezeChecker,
    telethonSpamBotChecker,
    telethonPremiumReader,
    clientManager,
    spamBotChecker,
    statusResolver,
    updateService,
    resultWriter,
    proxyPoolService
  )
  const checkQueue = new CheckQueue(checkEngine, {
    concurrency: appSettings.checkConcurrency,
    timeoutMs: 60000,
    retryLimit: 2
  })

  await proxyPoolService.init()

  let proxyPoolEmitTimer: NodeJS.Timeout | null = null
  let botCenterEmitTimer: NodeJS.Timeout | null = null

  const PROXY_POOL_RENDER_LOGS_LIMIT = 240
  const BOT_CENTER_RENDER_LOGS_LIMIT = 120

  const serializeProxyPoolState = () => {
    const state = proxyPoolService.getState()
    return {
      ...state,
      checkState: {
        ...state.checkState,
        logs: state.checkState.logs.slice(-PROXY_POOL_RENDER_LOGS_LIMIT)
      }
    }
  }

  const serializeBotCenterState = () => {
    if (!botCenterService) return null
    const state = botCenterService.getState()
    return {
      ...state,
      bots: state.bots.map((bot) => ({
        ...bot,
        logs: bot.logs.slice(-BOT_CENTER_RENDER_LOGS_LIMIT)
      }))
    }
  }

  const emitProxyPoolState = (force = false) => {
    const send = () => {
      if (proxyPoolEmitTimer) {
        clearTimeout(proxyPoolEmitTimer)
        proxyPoolEmitTimer = null
      }
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('proxy-pool:state', serializeProxyPoolState())
    }

    if (force) {
      send()
      return
    }

    if (proxyPoolEmitTimer) return
    proxyPoolEmitTimer = setTimeout(send, 180)
  }

  proxyPoolService.on('state', () => emitProxyPoolState())

  ipcMain.handle('proxy-pool:get-state', () => serializeProxyPoolState())
  ipcMain.handle('proxy-pool:replace-list', (_event, text: string) => proxyPoolService.replaceProxyList(text))
  ipcMain.handle('proxy-pool:update-settings', (_event, patch) => proxyPoolService.updateSettings(patch))
  ipcMain.handle('proxy-pool:clear-logs', () => proxyPoolService.clearLogs())
  ipcMain.handle('proxy-pool:start-check', () => proxyPoolService.startCheck())
  ipcMain.handle('license:get-state', () => licenseService.getSnapshot())
  ipcMain.handle('license:activate', (_event, cardKey: string) => licenseService.activate(cardKey))
  ipcMain.handle('license:validate', () => licenseService.validate())
  ipcMain.handle('license:clear', () => licenseService.clear())

  const emitBotCenterState = (force = false) => {
    const send = () => {
      if (botCenterEmitTimer) {
        clearTimeout(botCenterEmitTimer)
        botCenterEmitTimer = null
      }
      if (!mainWindow || mainWindow.isDestroyed() || !botCenterService) return
      const state = serializeBotCenterState()
      if (!state) return
      mainWindow.webContents.send('bot-center:state', state)
    }

    if (force) {
      send()
      return
    }

    if (botCenterEmitTimer) return
    botCenterEmitTimer = setTimeout(send, 180)
  }

  botCenterService.onState(() => emitBotCenterState())

  await importService.syncManagedSessions()

  bindManagedSessionsWatcher(importService, repository, managedSessionsDirectory)
  bindWindowControls()
  desktopAppUpdater = new DesktopAppUpdater(() => mainWindow)
  desktopAppUpdater.registerIpc()
  registerAccountIpc({
    getMainWindow: () => mainWindow,
    accountRepository: repository,
    accountImportService: importService,
    accountStatusService: statusService,
    checkQueue,
    appSettingsStore,
    proxyPoolService,
    telegramWebService,
    telegramDesktopPremiumService,
    telegramReauthorizationService,
    telegramTwoFactorService: telethonTwoFactorService,
    telegramProfileService: telethonProfileService,
    emitAccountsUpdated,
    withManagedSessionsWatcherSuspended
  })
  registerBroadcastIpc({
    broadcastService
  })
  registerDirectMessageIpc({
    directMessageService,
    getMainWindow: () => mainWindow
  })
  registerAutoJoinIpc({
    autoJoinService
  })
  registerGroupInviteIpc({
    groupInviteService
  })
  registerSessionManagerIpc({
    sessionManagerService
  })
  registerBatchCreateIpc({
    batchCreateService
  })
  registerOtherToolsIpc({
    otherToolsService,
    getMainWindow: () => mainWindow
  })
  registerBotCenterIpc({
    botCenterService,
    emitState: emitBotCenterState
  })
  createWindow()
  emitBotCenterState()
  void botCenterService.autoStartIfNeeded()
  desktopAppUpdater.scheduleStartupCheck()

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

app.on('before-quit', () => {
  managedSessionsWatcher?.close()
  desktopAppUpdater?.dispose()
  void botCenterService?.dispose()
})
