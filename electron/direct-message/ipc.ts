import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import type { DirectMessageAutoReplyPayload, DirectMessageCollectPayload, DirectMessageSendPayload, DirectMessageSendProgress, GroupCollectorPayload, GroupCollectorTaskPayload, GroupCollectorTaskProgress } from '../../src/types'
import type { DirectMessageService } from './service'

interface RegisterDirectMessageIpcOptions {
  directMessageService: DirectMessageService
  getMainWindow: () => BrowserWindow | null
}

const DIRECT_MESSAGE_SEND_PROGRESS_FLUSH_MS = 120
const GROUP_COLLECTOR_PROGRESS_FLUSH_MS = 120

export function registerDirectMessageIpc(options: RegisterDirectMessageIpcOptions) {
  const { directMessageService, getMainWindow } = options

  let groupCollectorProgressEmitTimer: NodeJS.Timeout | null = null
  let pendingGroupCollectorProgress: GroupCollectorTaskProgress | null = null

  const flushGroupCollectorProgress = () => {
    if (groupCollectorProgressEmitTimer) {
      clearTimeout(groupCollectorProgressEmitTimer)
      groupCollectorProgressEmitTimer = null
    }
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed() || !pendingGroupCollectorProgress) return
    mainWindow.webContents.send('direct-message:group-collector-progress', pendingGroupCollectorProgress)
    pendingGroupCollectorProgress = null
  }

  directMessageService.setAutoReplyEventSink((payload) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('direct-message:auto-reply-event', payload)
  })

  directMessageService.setGroupCollectorProgressSink((payload) => {
    pendingGroupCollectorProgress = payload
    if (payload.status !== 'running' || payload.result) {
      flushGroupCollectorProgress()
      return
    }
    if (groupCollectorProgressEmitTimer) return
    groupCollectorProgressEmitTimer = setTimeout(flushGroupCollectorProgress, GROUP_COLLECTOR_PROGRESS_FLUSH_MS)
  })

  ipcMain.handle('direct-message:send', async (event, payload: DirectMessageSendPayload) => {
    let sendProgressEmitTimer: NodeJS.Timeout | null = null
    let pendingSendProgress: DirectMessageSendProgress | null = null

    const flushSendProgress = () => {
      if (sendProgressEmitTimer) {
        clearTimeout(sendProgressEmitTimer)
        sendProgressEmitTimer = null
      }
      if (!pendingSendProgress || event.sender.isDestroyed()) return
      event.sender.send('direct-message:send-progress', pendingSendProgress)
      pendingSendProgress = null
    }

    const emitSendProgress = (progress: DirectMessageSendProgress) => {
      pendingSendProgress = progress
      if (progress.completed >= progress.total || !progress.item) {
        flushSendProgress()
        return
      }
      if (sendProgressEmitTimer) return
      sendProgressEmitTimer = setTimeout(flushSendProgress, DIRECT_MESSAGE_SEND_PROGRESS_FLUSH_MS)
    }

    try {
      return await directMessageService.sendMessages(payload, emitSendProgress)
    } finally {
      flushSendProgress()
    }
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
