import { ipcMain } from 'electron'
import type { BatchCreatePayload } from '../../src/types'
import type { BatchCreateService } from './service'

interface RegisterBatchCreateIpcOptions {
  batchCreateService: BatchCreateService
}

export function registerBatchCreateIpc(options: RegisterBatchCreateIpcOptions) {
  const { batchCreateService } = options

  ipcMain.handle('batch-create:start', async (event, payload: BatchCreatePayload) => {
    return batchCreateService.start(payload, (progress) => {
      event.sender.send('batch-create:progress', progress)
    })
  })

  ipcMain.handle('batch-create:stop', async () => {
    return batchCreateService.stopCurrentTask()
  })
}
