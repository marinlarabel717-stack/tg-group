import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { DirectMessageAutoReplyPayload, DirectMessageCollectPayload, DirectMessageSendPayload } from '../../src/types'
import type { DirectMessageService } from './service'

interface RegisterDirectMessageIpcOptions {
  directMessageService: DirectMessageService
  getMainWindow: () => BrowserWindow | null
}

export function registerDirectMessageIpc(options: RegisterDirectMessageIpcOptions) {
  const { directMessageService, getMainWindow } = options

  directMessageService.setAutoReplyEventSink((payload) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('direct-message:auto-reply-event', payload)
  })

  ipcMain.handle('direct-message:send', async (event, payload: DirectMessageSendPayload) => {
    return directMessageService.sendMessages(payload, (progress) => {
      event.sender.send('direct-message:send-progress', progress)
    })
  })

  ipcMain.handle('direct-message:collect-users', async (_event, payload: DirectMessageCollectPayload) => {
    return directMessageService.collectUsers(payload)
  })

  ipcMain.handle('direct-message:configure-auto-reply', async (_event, payload: DirectMessageAutoReplyPayload) => {
    return directMessageService.configureAutoReply(payload)
  })

  ipcMain.handle('direct-message:get-auto-reply-state', () => {
    return directMessageService.getAutoReplyState()
  })
}
