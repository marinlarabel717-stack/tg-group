import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopInfo', {
  appName: 'Telegram Multi Account Manager',
  platform: process.platform
})

contextBridge.exposeInMainWorld('desktopWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized')
})
