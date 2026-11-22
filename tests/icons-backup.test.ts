import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import sharp from 'sharp'
import { emptyVault, entrySchema } from '../lib/types'
import { deriveKey, newSalt, encryptVault, decryptVault, parseBackup } from '../lib/crypto'
import { backupNotice, readBrowserBackup, saveEncryptedBackup } from '../lib/backup'

test('Backup import accepts octet-stream and missing MIME types, validating content instead', async () => {
  const salt = newSalt(), key = await deriveKey('test-only-master-password', salt)
  const text = JSON.stringify(await encryptVault(emptyVault(), key))
  for (const type of ['application/octet-stream', '', 'application/json']) {
    const selected = await readBrowserBackup(new File([text], 'my-backup.vault', { type }))
    assert.equal(selected.text, text)
    assert.equal(selected.name, 'my-backup.vault')
  }
  await assert.rejects(readBrowserBackup(new File(['not a vault'], 'fake.vault')), /not a supported/)
  const oversized = new File([], 'oversized.vault')
  Object.defineProperty(oversized, 'size', { value: 20_000_001 })
  oversized.text = async () => { throw new Error('Must not read oversized file') }
  await assert.rejects(readBrowserBackup(oversized), /20 MB/)
  const wrongKey = await deriveKey('a-different-password', salt)
  await assert.rejects(decryptVault(parseBackup(text), wrongKey), /Incorrect master password/)
})

test('Android uses a fresh regular application identity with Vault branding', async () => {
  const strings = await readFile('android/app/src/main/res/values/strings.xml', 'utf8')
  assert.match(strings, /name="app_name">Vault<\/string>/)
  assert.doesNotMatch(strings, /Vault Test/)
  const config = await readFile('capacitor.config.ts', 'utf8')
  assert.match(config, /appId: 'app.privatevault.mobile'/)
  assert.match(config, /appName: 'Vault'/)
  const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8')
  assert.match(manifest, /android:icon="@mipmap\/vault_launcher"/)
  assert.match(manifest, /android:roundIcon="@mipmap\/vault_launcher_round"/)
  assert.doesNotMatch(manifest, /@mipmap\/ic_launcher/)
  for (const icon of ['vault_launcher', 'vault_launcher_round']) {
    const xml = await readFile(`android/app/src/main/res/mipmap-anydpi-v26/${icon}.xml`, 'utf8')
    assert.match(xml, /foreground android:drawable="@mipmap\/vault_launcher_foreground"/)
    assert.match(xml, /monochrome android:drawable="@mipmap\/vault_launcher_foreground"/)
  }
  const styles = await readFile('android/app/src/main/res/values/styles.xml', 'utf8')
  assert.doesNotMatch(styles, /@drawable\/splash/)
  assert.match(styles, /windowSplashScreenAnimatedIcon/)
})

test('Icon diagnostic installs separately and has a distinct launcher label', async () => {
  const gradle = await readFile('android/app/build.gradle', 'utf8')
  assert.match(gradle, /applicationId "app\.privatevault\.mobile"/)
  const probe = gradle.match(/iconProbe\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(probe, /applicationIdSuffix "\.iconprobe"/)
  assert.match(probe, /initWith debug/)
  const labels = await readFile('android/app/src/iconProbe/res/values/strings.xml', 'utf8')
  assert.match(labels, /name="app_name">Vault Icon-Test<\/string>/)
  assert.match(labels, /name="title_activity_main">Vault Icon-Test<\/string>/)
  const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8')
  assert.ok(manifest.includes('android:authorities="${applicationId}.fileprovider"'))
})

test('Android contains no obsolete launcher artwork or references', async () => {
  const root = 'android/app/src/main/res'
  const files = await readdir(root, { recursive: true })
  assert.deepEqual(files.filter(file => /^(?:drawable|mipmap)[^/]*\/\$?ic_launcher/.test(file)), [])
  for (const file of files.filter(file => file.endsWith('.xml'))) {
    const xml = await readFile(`${root}/${file}`, 'utf8')
    assert.doesNotMatch(xml, /@(?:drawable|mipmap)\/ic_launcher/, `Obsolete reference in ${file}`)
  }
})

test('All launcher densities contain Vault artwork and a transparent adaptive foreground', async () => {
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    for (const name of ['vault_launcher', 'vault_launcher_round', 'vault_launcher_foreground']) {
      const foreground = name.endsWith('_foreground')
      const { data, info } = await sharp(`android/app/src/main/res/mipmap-${density}/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      assert.equal(info.width, foreground ? Math.round(size * 108 / 48) : size)
      assert.equal(info.height, info.width)
      if (foreground) assert.equal(data[3], 0)
      else assert.deepEqual([...data.subarray(0, 4)], [143, 178, 255, 255])
      let darkPixels = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50 && data[i + 3] > 200) darkPixels++
      }
      assert.ok(darkPixels > size, `${density}/${name} must contain the dark fingerprint, not a blank or stock icon`)
    }
  }
})

const now = new Date().toISOString()
const entry = { id: crypto.randomUUID(), title: 'Steam', username: 'test', password: 'fixture-secret', url: '', notes: '', category: 'Personal', tags: [], favorite: false, createdAt: now, modifiedAt: now, passwordChangedAt: now }

test('Optional icon IDs preserve old entries and survive encrypted backup/restore', async () => {
  assert.equal(entrySchema.parse(entry).icon, undefined)
  for (const icon of ['https://tracker.test/logo.svg', '../private', 'a#b', '']) {
    assert.equal(entrySchema.safeParse({ ...entry, icon }).success, false)
  }
  const data = emptyVault()
  data.entries.push(entrySchema.parse({ ...entry, icon: 'steam' }))
  const salt = newSalt(), key = await deriveKey('test-only-master-password', salt)
  const file = JSON.stringify(await encryptVault(data, key))
  assert.ok(!file.includes('steam'))
  const restored = await decryptVault(parseBackup(file), key)
  assert.equal(restored.entries[0].icon, 'steam')
})

test('The entire catalog is local, schema-safe and every brand has a sprite symbol', async () => {
  const catalog = JSON.parse(await readFile('public/brands/catalog.json', 'utf8')) as { slug: string; title: string; aliases: string[] }[]
  const sprite = await readFile('public/brands/catalog.svg', 'utf8')
  assert.ok(catalog.length > 3000)
  assert.equal(new Set(catalog.map(icon => icon.slug)).size, catalog.length)
  for (const icon of catalog) {
    assert.ok(entrySchema.safeParse({ ...entry, icon: icon.slug }).success, icon.slug)
    assert.ok(sprite.includes(`id="${icon.slug}"`), icon.slug)
  }
  assert.ok(!sprite.includes('<script'))
  assert.ok(!sprite.includes('href='))
})

test('Browser export downloads a dated .vault file without invoking a share sheet', async () => {
  const salt = newSalt(), key = await deriveKey('Export regression password!', salt)
  const encrypted = JSON.stringify(await encryptVault(emptyVault(), key))
  let clicked = false, removed = false
  let blob: Blob | undefined
  const anchor = { href: '', download: '', click() { clicked = true }, remove() { removed = true } }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => anchor, body: { appendChild() {} } } })
  const originalURL = URL.createObjectURL, originalTimer = globalThis.setTimeout
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:test' }
  globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout
  try {
    assert.equal(await saveEncryptedBackup(encrypted), 'download-started')
    assert.match(anchor.download, /^vault-[0-9T-]+\.vault$/)
    assert.equal(anchor.href, 'blob:test')
    assert.ok(clicked && removed)
    assert.equal(await blob!.text(), encrypted)
    assert.match(backupNotice('download-started'), /Download started/)
    assert.match(backupNotice('saved'), /Backup saved/)
  } finally {
    URL.createObjectURL = originalURL
    globalThis.setTimeout = originalTimer
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
