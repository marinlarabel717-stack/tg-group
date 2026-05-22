import { ipcMain } from 'electron'
import type { AutoJoinPayload, AutoJoinProgress } from '../../src/types'
import type { AutoJoinService } from './service'

interface RegisterAutoJoinIpcOptions {
  autoJoinService: AutoJoinService
}

const AUTO_JOIN_PROGRESS_FLUSH_MS = 120

export function registerAutoJoinIpc(options: RegisterAutoJoinIpcOptions) {
  const { autoJoinService } = options

  ipcMain.handle('auto-join:start', async (event, payload: AutoJoinPayload) => {
    let progressEmitTimer: NodeJS.Timeout | null = null
    let pendingProgress: AutoJoinProgress | null = null

    const flushProgress = () => {
      if (progressEmitTimer) {
        clearTimeout(progressEmitTimer)
        progressEmitTimer = null
      }
      if (!pendingProgress || event.sender.isDestroyed()) return
      event.sender.send('auto-join:progress', pendingProgress)
      pendingProgress = null
    }

    const emitProgress = (progress: AutoJoinProgress) => {
      pendingProgress = progress
      if (!progress.running || progress.completed >= progress.total) {
        flushProgress()
        return
      }
      if (progressEmitTimer) return
      progressEmitTimer = setTimeout(flushProgress, AUTO_JOIN_PROGRESS_FLUSH_MS)
    }

    try {
      return await autoJoinService.start(payload, emitProgress)
    } finally {
      flushProgress()
    }
  })

  ipcMain.handle('auto-join:stop', async () => {
    return autoJoinService.stopCurrentTask()
  })
}
