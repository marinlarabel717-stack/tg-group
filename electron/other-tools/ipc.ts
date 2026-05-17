import { ipcMain } from 'electron'
import type { OtherToolsUsernameFilterPayload } from '../../src/types'
import type { OtherToolsService } from './service'

interface RegisterOtherToolsIpcOptions {
  otherToolsService: OtherToolsService
}

export function registerOtherToolsIpc(options: RegisterOtherToolsIpcOptions) {
  const { otherToolsService } = options

  ipcMain.handle('other-tools:filter-usernames', async (_event, payload: OtherToolsUsernameFilterPayload) => {
    return otherToolsService.filterUsernames(payload)
  })
}
