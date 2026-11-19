import { cp, mkdir, rm, readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Copies the exported Next.js site (../out) and the app icon into the desktop package
// so electron-builder only ever packages files that live inside this directory.
const desktop = dirname(dirname(fileURLToPath(import.meta.url)))
const root = dirname(desktop)
const out = join(root, 'out')
const renderer = join(desktop, 'renderer')
const build = join(desktop, 'build')

await stat(join(out, 'index.html')).catch(() => {
  throw new Error('No exported site found at ./out. Run "pnpm build" in the project root first.')
})

await rm(renderer, { recursive: true, force: true })
await cp(out, renderer, { recursive: true, filter: source => !source.endsWith('sw.js') })
await mkdir(build, { recursive: true })
await cp(join(root, 'public', 'vault-app-icon.png'), join(build, 'icon.png'))

export async function readAppVersion() {
  const about = await readFile(join(root, 'lib', 'about.ts'), 'utf8')
  const version = about.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1]
  if (!version) throw new Error('APP_VERSION not found in lib/about.ts')
  return version
}

console.log(`Renderer prepared from ${out} (app version ${await readAppVersion()})`)
