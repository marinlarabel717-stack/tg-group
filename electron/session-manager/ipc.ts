import { ipcMain } from 'electron'
import type { SessionManagerActionPayload } from '../../src/types'
import type { SessionManagerService } from './service'

interface RegisterSessionManagerIpcOptions {
  sessionManagerService: SessionManagerService
}

export function registerSessionManagerIpc(options: RegisterSessionManagerIpcOptions) {
  const { sessionManagerService } = options

  ipcMain.handle('session-manager:run-action', async (event, payload: SessionManagerActionPayload) => {
    sessionManagerService.setProgressSink((state) => {
      event.sender.send('session-manager:progress', state)
    })
    return sessionManagerService.runAction(payload)
  })

  ipcMain.handle('session-manager:get-state', () => sessionManagerService.getState())
  ipcMain.handle('session-manager:clear-logs', () => sessionManagerService.clearLogs())
}
