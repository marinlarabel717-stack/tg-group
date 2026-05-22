import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { GroupInvitePayload } from '../../src/types'
import type { GroupInviteService } from './service'

interface RegisterGroupInviteIpcOptions {
  groupInviteService: GroupInviteService
}

export function registerGroupInviteIpc(options: RegisterGroupInviteIpcOptions) {
  const { groupInviteService } = options

  let progressEmitTimer: NodeJS.Timeout | null = null
  let pendingState: ReturnType<GroupInviteService['getState']> | null = null
  let progressTarget: WebContents | null = null

  const flushProgress = () => {
    if (progressEmitTimer) {
      clearTimeout(progressEmitTimer)
      progressEmitTimer = null
    }
    if (!pendingState || !progressTarget || progressTarget.isDestroyed()) return
    progressTarget.send('group-invite:progress', pendingState)
    pendingState = null
  }

  const emitProgress = (force = false) => {
    if (force) {
      flushProgress()
      return
    }
    if (progressEmitTimer) return
    progressEmitTimer = setTimeout(flushProgress, 180)
  }

  groupInviteService.setProgressSink((state) => {
    pendingState = state
    if (!state.running) {
      emitProgress(true)
      return
    }
    emitProgress()
  })

  ipcMain.handle('group-invite:start', async (event, payload: GroupInvitePayload) => {
    progressTarget = event.sender
    return groupInviteService.start(payload)
  })

  ipcMain.handle('group-invite:stop', async (event) => {
    progressTarget = event.sender
    return groupInviteService.stop()
  })

  ipcMain.handle('group-invite:get-state', async () => {
    return groupInviteService.getState()
  })
}
