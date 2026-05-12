import { ipcMain } from 'electron'
import type { BroadcastDeleteScheduledMessagesPayload, BroadcastPushSchedulePayload } from '../../src/types'
import type { BroadcastService } from './service'

interface RegisterBroadcastIpcOptions {
  broadcastService: BroadcastService
}

export function registerBroadcastIpc(options: RegisterBroadcastIpcOptions) {
  const { broadcastService } = options

  ipcMain.handle('broadcast:push-schedule', async (event, payload: BroadcastPushSchedulePayload) => {
    return broadcastService.pushSchedule(payload, (progress) => {
      event.sender.send('broadcast:push-progress', progress)
    })
  })

  ipcMain.handle('broadcast:stop-push-schedule', async () => {
    return broadcastService.stopCurrentPush()
  })

  ipcMain.handle('broadcast:list-joined-groups', async (_event, accountId: number) => {
    return broadcastService.listJoinedGroups(accountId)
  })

  ipcMain.handle('broadcast:list-scheduled-messages', async (_event, payload: { accountId: number; groupRef: string }) => {
    return broadcastService.listScheduledMessages(payload.accountId, payload.groupRef)
  })

  ipcMain.handle('broadcast:delete-scheduled-messages', async (_event, payload: BroadcastDeleteScheduledMessagesPayload) => {
    return broadcastService.deleteScheduledMessages(payload)
  })
}
