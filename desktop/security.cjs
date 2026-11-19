const { resolve, relative, isAbsolute, sep } = require('node:path')

function isRendererUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'vault:' && url.host === 'app' && !url.username && !url.password
  } catch { return false }
}

function rendererPath(root, value) {
  if (!isRendererUrl(value)) return null
  try {
    let pathname = decodeURIComponent(new URL(value).pathname)
    if (pathname.includes('\0') || pathname.includes('\\')) return null
    if (pathname.endsWith('/')) pathname += 'index.html'
    const candidate = resolve(root, `.${pathname}`)
    const remainder = relative(root, candidate)
    if (!remainder || remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) return null
    return candidate
  } catch { return null }
}

function isExternalUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch { return false }
}

module.exports = { isRendererUrl, rendererPath, isExternalUrl }
