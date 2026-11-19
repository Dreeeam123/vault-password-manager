const { contextBridge } = require('electron')

// Read-only facts about the host; no IPC or Node access is exposed to the page.
contextBridge.exposeInMainWorld('vaultDesktop', Object.freeze({
  platform: process.platform,
  electron: process.versions.electron,
}))
