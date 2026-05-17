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

  otherToolsService.setSniperListenerStateSink((state) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('other-tools:sniper-listener-state', state)
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
