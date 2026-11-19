const { app, BrowserWindow, protocol, net, shell, session, Menu, dialog } = require('electron')
const { join, extname } = require('node:path')
const { isRendererUrl, rendererPath, isExternalUrl } = require('./security.cjs')
const { pathToFileURL } = require('node:url')
const { existsSync } = require('node:fs')

const SCHEME = 'vault'
const ORIGIN = `${SCHEME}://app`
const RENDERER = join(__dirname, 'renderer')
const BACKGROUND = '#151719'

// A custom scheme gives the renderer a stable, secure origin so IndexedDB, Web Crypto
// and the Next.js absolute asset paths (/_next/...) behave exactly like on the web.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}

/** Maps a vault://app/... URL to a file inside the exported Next.js site, never outside it. */
function resolveRendererFile(requestUrl) {
  const candidate = rendererPath(RENDERER, requestUrl)
  if (!candidate) return null
  if (existsSync(candidate)) return candidate
  if (!extname(candidate)) {
    const asDirectory = join(candidate, 'index.html')
    if (existsSync(asDirectory)) return asDirectory
    const asHtml = `${candidate}.html`
    if (existsSync(asHtml)) return asHtml
  }
  return null
}

function registerRendererProtocol() {
  protocol.handle(SCHEME, async request => {
    const file = resolveRendererFile(request.url)
    if (!file) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(response.headers)
    headers.set('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: response.status, headers })
  })
}

function hardenSession() {
  const current = session.defaultSession
  current.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write')
  })
  current.setPermissionCheckHandler((_webContents, permission) => permission === 'clipboard-sanitized-write')
  // Backups are plain downloads in the renderer; always ask where to put them.
  current.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save Vault backup', defaultPath: item.getFilename() })
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    minHeight: 600,
    show: false,
    title: 'Vault',
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    icon: join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })
  // Same protection as FLAG_SECURE on Android: the window is blacked out in screenshots and screen shares.
  window.setContentProtection(true)
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url).catch(() => {
      dialog.showErrorBox('Could not open browser', 'Please open the link in your browser manually.')
    })
    return { action: 'deny' }
  })
  const preventExternalNavigation = event => {
    if (!isRendererUrl(event.url)) event.preventDefault()
  }
  window.webContents.on('will-navigate', preventExternalNavigation)
  window.webContents.on('will-redirect', preventExternalNavigation)
  window.webContents.on('will-frame-navigate', preventExternalNavigation)
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    dialog.showErrorBox('Vault stopped unexpectedly', `The window will reload. (${details.reason})`)
    window.reload()
  })
  void window.loadURL(`${ORIGIN}/`)
  return window
}

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  hardenSession()
  registerRendererProtocol()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', event => event.preventDefault())
})

app.on('window-all-closed', () => app.quit())
