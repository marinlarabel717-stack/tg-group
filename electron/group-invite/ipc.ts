import { ipcMain } from 'electron'
import type { GroupInvitePayload } from '../../src/types'
import type { GroupInviteService } from './service'

interface RegisterGroupInviteIpcOptions {
  groupInviteService: GroupInviteService
}

export function registerGroupInviteIpc(options: RegisterGroupInviteIpcOptions) {
  const { groupInviteService } = options

  ipcMain.handle('group-invite:start', async (event, payload: GroupInvitePayload) => {
    groupInviteService.setProgressSink((state) => {
      event.sender.send('group-invite:progress', state)
    })
    return groupInviteService.start(payload)
  })

  ipcMain.handle('group-invite:stop', async (event) => {
    groupInviteService.setProgressSink((state) => {
      event.sender.send('group-invite:progress', state)
    })
    return groupInviteService.stop()
  })

  ipcMain.handle('group-invite:get-state', async () => {
    return groupInviteService.getState()
  })
}
