import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { DirectMessageAutoReplyPayload, DirectMessageCollectPayload, DirectMessageSendPayload, GroupCollectorPayload, GroupCollectorTaskPayload } from '../../src/types'
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

  directMessageService.setGroupCollectorProgressSink((payload) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('direct-message:group-collector-progress', payload)
  })

  ipcMain.handle('direct-message:send', async (event, payload: DirectMessageSendPayload) => {
    return directMessageService.sendMessages(payload, (progress) => {
      event.sender.send('direct-message:send-progress', progress)
    })
  })

  ipcMain.handle('direct-message:stop-send', () => {
    return directMessageService.stopCurrentSend()
  })

  ipcMain.handle('direct-message:collect-users', async (_event, payload: DirectMessageCollectPayload) => {
    return directMessageService.collectUsers(payload)
  })

  ipcMain.handle('direct-message:collect-group-users', async (_event, payload: GroupCollectorPayload) => {
    return directMessageService.collectGroupUsers(payload)
  })

  ipcMain.handle('direct-message:start-group-collector-task', async (_event, payload: GroupCollectorTaskPayload) => {
    return directMessageService.startGroupCollectorTask(payload)
  })

  ipcMain.handle('direct-message:stop-group-collector-task', async (_event, taskId: string) => {
    return directMessageService.stopGroupCollectorTask(taskId)
  })

  ipcMain.handle('direct-message:configure-auto-reply', async (_event, payload: DirectMessageAutoReplyPayload) => {
    return directMessageService.configureAutoReply(payload)
  })

  ipcMain.handle('direct-message:get-auto-reply-state', () => {
    return directMessageService.getAutoReplyState()
  })
}
