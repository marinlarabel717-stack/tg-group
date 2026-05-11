import { ipcMain } from 'electron'
import type { BroadcastPushSchedulePayload } from '../../src/types'
import type { BroadcastService } from './service'

interface RegisterBroadcastIpcOptions {
  broadcastService: BroadcastService
}

export function registerBroadcastIpc(options: RegisterBroadcastIpcOptions) {
  const { broadcastService } = options

  ipcMain.handle('broadcast:push-schedule', async (_event, payload: BroadcastPushSchedulePayload) => {
    return broadcastService.pushSchedule(payload)
  })

  ipcMain.handle('broadcast:list-joined-groups', async (_event, accountId: number) => {
    return broadcastService.listJoinedGroups(accountId)
  })
}
