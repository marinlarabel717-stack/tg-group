import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { OtherToolsSniperListenerPayload, OtherToolsSniperPayload, OtherToolsUsernameFilterPayload } from '../../src/types'
import type { OtherToolsService } from './service'

interface RegisterOtherToolsIpcOptions {
  otherToolsService: OtherToolsService
  getMainWindow: () => BrowserWindow | null
}

export function registerOtherToolsIpc(options: RegisterOtherToolsIpcOptions) {
  const { otherToolsService, getMainWindow } = options

  let listenerStateEmitTimer: NodeJS.Timeout | null = null
  let pendingListenerState: ReturnType<OtherToolsService['getSniperListenerState']> | null = null

  const flushListenerState = () => {
    if (listenerStateEmitTimer) {
      clearTimeout(listenerStateEmitTimer)
      listenerStateEmitTimer = null
    }
    if (!pendingListenerState) return
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('other-tools:sniper-listener-state', pendingListenerState)
    pendingListenerState = null
  }

  const emitListenerState = (force = false) => {
    if (force) {
      flushListenerState()
      return
    }
    if (listenerStateEmitTimer) return
    listenerStateEmitTimer = setTimeout(flushListenerState, 180)
  }

  otherToolsService.setSniperListenerStateSink((state) => {
    pendingListenerState = state
    if (!state.running) {
      emitListenerState(true)
      return
    }
    emitListenerState()
  })

  ipcMain.handle('other-tools:filter-usernames', async (_event, payload: OtherToolsUsernameFilterPayload) => {
    return otherToolsService.filterUsernames(payload)
  })

  ipcMain.handle('other-tools:scan-and-claim', async (_event, payload: OtherToolsSniperPayload) => {
    return otherToolsService.scanAndClaim(payload)
  })

  ipcMain.handle('other-tools:start-sniper-listener', async (_event, payload: OtherToolsSniperListenerPayload) => {
    return otherToolsService.startSniperListener(payload)
  })

  ipcMain.handle('other-tools:stop-sniper-listener', async () => {
    return otherToolsService.stopSniperListener()
  })

  ipcMain.handle('other-tools:get-sniper-listener-state', async () => {
    return otherToolsService.getSniperListenerState()
  })
}
