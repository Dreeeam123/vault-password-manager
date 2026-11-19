import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'

/**
 * Gradle's resource linker (aapt2) fails the APK build on a single dangling
 * `@color/...` reference. Catching it here keeps that failure out of CI.
 */
const res = 'android/app/src/main/res'
const manifest = 'android/app/src/main/AndroidManifest.xml'

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
  return files.flat()
}

test('every Android resource reference resolves to a defined resource', async () => {
  const files = await walk(res)
  const defined = new Set<string>()
  const references: { file: string; ref: string }[] = []

  for (const file of files) {
    const folder = basename(join(file, '..')).split('-')[0]
    if (folder !== 'values') defined.add(`${folder}/${basename(file, extname(file))}`)
    if (extname(file) !== '.xml') continue
    const xml = await readFile(file, 'utf8')
    if (folder === 'values') {
      for (const match of xml.matchAll(/<(color|string|style|dimen|bool|integer)\s+name="([^"]+)"/g)) defined.add(`${match[1]}/${match[2]}`)
    }
    for (const match of xml.matchAll(/@(color|string|style|dimen|bool|integer|mipmap|drawable)\/([A-Za-z0-9_.]+)/g)) references.push({ file, ref: `${match[1]}/${match[2]}` })
  }
  for (const match of (await readFile(manifest, 'utf8')).matchAll(/@(color|string|style|mipmap|drawable)\/([A-Za-z0-9_.]+)/g)) references.push({ file: manifest, ref: `${match[1]}/${match[2]}` })

  const dangling = references.filter(({ ref }) => !defined.has(ref) && !defined.has(ref.replace(/\.[^/]+$/, '')))
  assert.deepEqual(dangling, [], `Dangling Android resource references: ${dangling.map(d => `${d.ref} in ${d.file}`).join(', ')}`)
})
