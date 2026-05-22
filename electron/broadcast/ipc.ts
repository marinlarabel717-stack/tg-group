import { ipcMain } from 'electron'
import type { BroadcastDeleteScheduledMessagesPayload, BroadcastPushSchedulePayload, BroadcastPushScheduleProgress } from '../../src/types'
import type { BroadcastService } from './service'

interface RegisterBroadcastIpcOptions {
  broadcastService: BroadcastService
}

const BROADCAST_PUSH_PROGRESS_FLUSH_MS = 120

export function registerBroadcastIpc(options: RegisterBroadcastIpcOptions) {
  const { broadcastService } = options

  ipcMain.handle('broadcast:push-schedule', async (event, payload: BroadcastPushSchedulePayload) => {
    let progressEmitTimer: NodeJS.Timeout | null = null
    let pendingProgress: BroadcastPushScheduleProgress | null = null

    const flushProgress = () => {
      if (progressEmitTimer) {
        clearTimeout(progressEmitTimer)
        progressEmitTimer = null
      }
      if (!pendingProgress || event.sender.isDestroyed()) return
      event.sender.send('broadcast:push-progress', pendingProgress)
      pendingProgress = null
    }

    const emitProgress = (progress: BroadcastPushScheduleProgress) => {
      pendingProgress = progress
      if (progress.completed >= progress.total) {
        flushProgress()
        return
      }
      if (progressEmitTimer) return
      progressEmitTimer = setTimeout(flushProgress, BROADCAST_PUSH_PROGRESS_FLUSH_MS)
    }

    try {
      return await broadcastService.pushSchedule(payload, emitProgress)
    } finally {
      flushProgress()
    }
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
