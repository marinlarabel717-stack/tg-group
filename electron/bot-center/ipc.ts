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

  ipcMain.handle('bot-center:add-bot', async () => {
    return botCenterService.addBot()
  })

  ipcMain.handle('bot-center:remove-bot', async (_event, botId: string) => {
    return botCenterService.removeBot(botId)
  })

  ipcMain.handle('bot-center:select-bot', async (_event, botId: string) => {
    return botCenterService.selectBot(botId)
  })

  ipcMain.handle('bot-center:save-config', async (_event, botId: string, patch: Partial<BotCenterConfig>) => {
    return botCenterService.saveConfig(botId, patch)
  })

  ipcMain.handle('bot-center:refresh-profile', async (_event, botId: string) => {
    return botCenterService.refreshProfile(botId)
  })

  ipcMain.handle('bot-center:start', async (_event, botId: string) => {
    return botCenterService.start(botId)
  })

  ipcMain.handle('bot-center:stop', async (_event, botId: string) => {
    return botCenterService.stop(botId)
  })

  ipcMain.handle('bot-center:clear-logs', async (_event, botId: string) => {
    return botCenterService.clearLogs(botId)
  })
}
