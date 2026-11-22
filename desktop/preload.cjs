const { contextBridge, ipcRenderer } = require('electron')

// Read-only facts about the host. No Node access is exposed to the page.
contextBridge.exposeInMainWorld('vaultDesktop', Object.freeze({
  platform: process.platform,
  electron: process.versions.electron,
}))

// Sync can only reach the single file the user picked in a system dialog; the page never sees a path.
contextBridge.exposeInMainWorld('vaultSync', Object.freeze({
  status: () => ipcRenderer.invoke('sync:status'),
  choose: options => ipcRenderer.invoke('sync:choose', Boolean(options && options.create)),
  read: () => ipcRenderer.invoke('sync:read'),
  write: options => ipcRenderer.invoke('sync:write', String(options && options.data)),
  clear: () => ipcRenderer.invoke('sync:clear'),
}))
