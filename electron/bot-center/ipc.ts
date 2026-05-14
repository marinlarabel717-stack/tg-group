import { ipcMain } from 'electron'
import type { BotCenterConfig } from '../../src/types'
import type { BotCenterService } from './service'

interface RegisterBotCenterIpcOptions {
  botCenterService: BotCenterService
  emitState: () => void
}

export function registerBotCenterIpc(options: RegisterBotCenterIpcOptions) {
  const { botCenterService, emitState } = options

  ipcMain.handle('bot-center:get-state', () => {
    const state = botCenterService.getState()
    emitState()
    return state
  })

  ipcMain.handle('bot-center:save-config', async (_event, patch: Partial<BotCenterConfig>) => {
    return botCenterService.saveConfig(patch)
  })

  ipcMain.handle('bot-center:refresh-profile', async () => {
    return botCenterService.refreshProfile()
  })

  ipcMain.handle('bot-center:start', async () => {
    return botCenterService.start()
  })

  ipcMain.handle('bot-center:stop', async () => {
    return botCenterService.stop()
  })

  ipcMain.handle('bot-center:clear-logs', async () => {
    return botCenterService.clearLogs()
  })
}
