import { ipcMain } from 'electron'
import type { AutoJoinPayload } from '../../src/types'
import type { AutoJoinService } from './service'

interface RegisterAutoJoinIpcOptions {
  autoJoinService: AutoJoinService
}

export function registerAutoJoinIpc(options: RegisterAutoJoinIpcOptions) {
  const { autoJoinService } = options

  ipcMain.handle('auto-join:start', async (event, payload: AutoJoinPayload) => {
    return autoJoinService.start(payload, (progress) => {
      event.sender.send('auto-join:progress', progress)
    })
  })

  ipcMain.handle('auto-join:stop', async () => {
    return autoJoinService.stopCurrentTask()
  })
}
