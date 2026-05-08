import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { CheckResultInput } from './types'
import type { AccountImportService } from './services/account-import-service'
import type { AccountRepository } from './services/account-repository'
import type { AccountStatusService } from './services/account-status-service'

interface RegisterAccountIpcOptions {
  getMainWindow: () => BrowserWindow | null
  accountRepository: AccountRepository
  accountImportService: AccountImportService
  accountStatusService: AccountStatusService
}

export function registerAccountIpc(options: RegisterAccountIpcOptions) {
  const { getMainWindow, accountRepository, accountImportService, accountStatusService } = options

  const showOpenDialog = (dialogOptions: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow()
    return mainWindow ? dialog.showOpenDialog(mainWindow, dialogOptions) : dialog.showOpenDialog(dialogOptions)
  }

  ipcMain.handle('accounts:list', () => accountRepository.list())

  ipcMain.handle('accounts:pick-import-files', async () => {
    const result = await showOpenDialog({
      title: '选择 Session / JSON 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Telegram Session', extensions: ['session', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return accountImportService.importFromPaths(result.filePaths)
  })

  ipcMain.handle('accounts:pick-import-folder', async () => {
    const result = await showOpenDialog({
      title: '选择账号文件夹',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return accountImportService.importFromFolder(result.filePaths[0])
  })

  ipcMain.handle('accounts:scan-folder', async (_event, folderPath: string) => {
    return accountImportService.scanFolder(folderPath)
  })

  ipcMain.handle('accounts:import-dropped-paths', async (_event, inputPaths: string[]) => {
    return accountImportService.importFromPaths(inputPaths)
  })

  ipcMain.handle('accounts:delete', (_event, ids: number[]) => {
    return accountRepository.deleteByIds(ids)
  })

  ipcMain.handle('accounts:delete-all', () => {
    return accountRepository.deleteAll()
  })

  ipcMain.handle('accounts:mark-checking', (_event, ids: number[]) => {
    return accountStatusService.markChecking(ids)
  })

  ipcMain.handle('accounts:apply-spambot-reply', (_event, payload: { ids: number[]; replyText: string }) => {
    return accountStatusService.applySpamBotReply(payload.ids, payload.replyText)
  })

  ipcMain.handle('accounts:apply-check-results', (_event, items: CheckResultInput[]) => {
    return accountStatusService.applyCheckResults(items)
  })

  ipcMain.handle('accounts:export', async (_event, ids: number[]) => {
    if (ids.length === 0) {
      return { exportedCount: 0, targetDirectory: '' }
    }

    const result = await showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { exportedCount: 0, targetDirectory: '' }
    }

    const targetDirectory = result.filePaths[0]
    const exportedCount = await accountRepository.exportByIds(ids, targetDirectory)
    return { exportedCount, targetDirectory }
  })

  ipcMain.handle('accounts:reveal-path', async (_event, targetPath: string) => {
    const resolvedPath = path.resolve(targetPath)
    if (!fs.existsSync(resolvedPath)) return false
    shell.showItemInFolder(resolvedPath)
    return true
  })
}
