import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater, type ProgressInfo } from 'electron-updater'

export type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'

export interface UpdaterState {
  status: UpdaterStatus
  currentVersion: string
  availableVersion: string | null
  progressPercent: number
  transferredBytes: number
  totalBytes: number
  bytesPerSecond: number
  message: string
  releaseDate: string | null
}

function createInitialState(): UpdaterState {
  return {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progressPercent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    message: app.isPackaged ? '准备检查更新。' : '开发环境不检查自动更新。',
    releaseDate: null
  }
}

export class DesktopAppUpdater {
  private state: UpdaterState = createInitialState()
  private startupCheckTimer: NodeJS.Timeout | null = null
  private autoInstallTimer: NodeJS.Timeout | null = null

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this.updateState({
        status: 'checking',
        message: '正在检查新版本…',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0
      })
    })

    autoUpdater.on('update-available', (info) => {
      this.clearAutoInstallTimer()
      this.updateState({
        status: 'available',
        availableVersion: info.version || null,
        releaseDate: info.releaseDate || null,
        message: `发现新版本 v${info.version || '未知版本'}，是否立即自动更新？`,
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.clearAutoInstallTimer()
      this.updateState({
        status: 'not-available',
        availableVersion: null,
        releaseDate: null,
        message: '当前已经是最新版本。',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.handleDownloadProgress(progress)
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.updateState({
        status: 'downloaded',
        availableVersion: info.version || this.state.availableVersion,
        releaseDate: info.releaseDate || this.state.releaseDate,
        progressPercent: 100,
        message: '新版本已下载完成，正在准备重启安装…'
      })

      this.clearAutoInstallTimer()
      this.autoInstallTimer = setTimeout(() => {
        try {
          autoUpdater.quitAndInstall(false, true)
        } catch (error) {
          this.updateState({
            status: 'error',
            message: error instanceof Error ? error.message : '自动安装更新失败，请手动重启软件重试。'
          })
        }
      }, 1500)
    })

    autoUpdater.on('error', (error) => {
      this.clearAutoInstallTimer()
      this.updateState({
        status: 'error',
        message: error == null ? '检查更新失败。' : (error.message || String(error))
      })
    })
  }

  private updateState(patch: Partial<UpdaterState>) {
    this.state = {
      ...this.state,
      ...patch,
      currentVersion: app.getVersion()
    }
    this.emitState()
  }

  private emitState() {
    const window = this.getMainWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send('app-updater:state', this.state)
  }

  private handleDownloadProgress(progress: ProgressInfo) {
    this.updateState({
      status: 'downloading',
      progressPercent: Number.isFinite(progress.percent) ? progress.percent : 0,
      transferredBytes: Number.isFinite(progress.transferred) ? progress.transferred : 0,
      totalBytes: Number.isFinite(progress.total) ? progress.total : 0,
      bytesPerSecond: Number.isFinite(progress.bytesPerSecond) ? progress.bytesPerSecond : 0,
      message: '正在下载新版本…'
    })
  }

  private clearStartupTimer() {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer)
      this.startupCheckTimer = null
    }
  }

  private clearAutoInstallTimer() {
    if (this.autoInstallTimer) {
      clearTimeout(this.autoInstallTimer)
      this.autoInstallTimer = null
    }
  }

  getState() {
    return this.state
  }

  registerIpc() {
    ipcMain.handle('app-updater:get-state', () => this.getState())
    ipcMain.handle('app-updater:check', () => this.checkForUpdates())
    ipcMain.handle('app-updater:download', () => this.downloadUpdate())
    ipcMain.handle('app-updater:quit-and-install', () => this.quitAndInstall())
  }

  scheduleStartupCheck(delayMs = 2200) {
    if (!app.isPackaged) {
      this.updateState({
        status: 'unsupported',
        message: '开发环境不检查自动更新。'
      })
      return
    }

    this.clearStartupTimer()
    this.startupCheckTimer = setTimeout(() => {
      void this.checkForUpdates()
    }, delayMs)
  }

  async checkForUpdates() {
    if (!app.isPackaged) {
      this.updateState({
        status: 'unsupported',
        message: '开发环境不检查自动更新。'
      })
      return this.state
    }

    await autoUpdater.checkForUpdates()
    return this.state
  }

  async downloadUpdate() {
    if (!app.isPackaged) {
      this.updateState({
        status: 'unsupported',
        message: '开发环境不检查自动更新。'
      })
      return this.state
    }

    if (!['available', 'downloading', 'error'].includes(this.state.status)) {
      return this.state
    }

    if (this.state.status !== 'downloading') {
      this.updateState({
        status: 'downloading',
        message: '正在下载新版本…',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0
      })
    }

    await autoUpdater.downloadUpdate()
    return this.state
  }

  quitAndInstall() {
    this.clearAutoInstallTimer()
    if (this.state.status !== 'downloaded') {
      return false
    }

    autoUpdater.quitAndInstall(false, true)
    return true
  }

  dispose() {
    this.clearStartupTimer()
    this.clearAutoInstallTimer()
    ipcMain.removeHandler('app-updater:get-state')
    ipcMain.removeHandler('app-updater:check')
    ipcMain.removeHandler('app-updater:download')
    ipcMain.removeHandler('app-updater:quit-and-install')
  }
}
