import { ipcMain } from 'electron'
import type { BatchCreatePayload, BatchCreateProgress } from '../../src/types'
import type { BatchCreateService } from './service'

interface RegisterBatchCreateIpcOptions {
  batchCreateService: BatchCreateService
}

const BATCH_CREATE_PROGRESS_FLUSH_MS = 120

export function registerBatchCreateIpc(options: RegisterBatchCreateIpcOptions) {
  const { batchCreateService } = options

  ipcMain.handle('batch-create:start', async (event, payload: BatchCreatePayload) => {
    let progressEmitTimer: NodeJS.Timeout | null = null
    let pendingProgress: BatchCreateProgress | null = null

    const flushProgress = () => {
      if (progressEmitTimer) {
        clearTimeout(progressEmitTimer)
        progressEmitTimer = null
      }
      if (!pendingProgress || event.sender.isDestroyed()) return
      event.sender.send('batch-create:progress', pendingProgress)
      pendingProgress = null
    }

    const emitProgress = (progress: BatchCreateProgress) => {
      pendingProgress = progress
      if (!progress.running || progress.completed >= progress.total) {
        flushProgress()
        return
      }
      if (progressEmitTimer) return
      progressEmitTimer = setTimeout(flushProgress, BATCH_CREATE_PROGRESS_FLUSH_MS)
    }

    try {
      return await batchCreateService.start(payload, emitProgress)
    } finally {
      flushProgress()
    }
  })

  ipcMain.handle('batch-create:stop', async () => {
    return batchCreateService.stopCurrentTask()
  })
}
