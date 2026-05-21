import { ipcMain } from 'electron'
import type { SessionManagerActionPayload } from '../../src/types'
import type { SessionManagerService } from './service'

interface RegisterSessionManagerIpcOptions {
  sessionManagerService: SessionManagerService
}

export function registerSessionManagerIpc(options: RegisterSessionManagerIpcOptions) {
  const { sessionManagerService } = options

  ipcMain.handle('session-manager:run-action', async (_event, payload: SessionManagerActionPayload) => {
    return sessionManagerService.runAction(payload)
  })
}
