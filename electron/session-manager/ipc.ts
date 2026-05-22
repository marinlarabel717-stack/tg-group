import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { SessionManagerActionPayload } from '../../src/types'
import type { SessionManagerService } from './service'

interface RegisterSessionManagerIpcOptions {
  sessionManagerService: SessionManagerService
}

export function registerSessionManagerIpc(options: RegisterSessionManagerIpcOptions) {
  const { sessionManagerService } = options

  let progressEmitTimer: NodeJS.Timeout | null = null
  let pendingState: ReturnType<SessionManagerService['getState']> | null = null
  let progressTarget: WebContents | null = null

  const flushProgress = () => {
    if (progressEmitTimer) {
      clearTimeout(progressEmitTimer)
      progressEmitTimer = null
    }
    if (!pendingState || !progressTarget || progressTarget.isDestroyed()) return
    progressTarget.send('session-manager:progress', pendingState)
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

  sessionManagerService.setProgressSink((state) => {
    pendingState = state
    if (!state.running) {
      emitProgress(true)
      return
    }
    emitProgress()
  })

  ipcMain.handle('session-manager:run-action', async (event, payload: SessionManagerActionPayload) => {
    progressTarget = event.sender
    return sessionManagerService.runAction(payload)
  })

  ipcMain.handle('session-manager:get-state', () => sessionManagerService.getState())
  ipcMain.handle('session-manager:clear-logs', () => sessionManagerService.clearLogs())
}
