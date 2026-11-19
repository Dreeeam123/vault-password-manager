import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyVault, type VaultData } from '../lib/types'
import { deriveKey, newSalt, encryptVault, decryptVault, parseBackup } from '../lib/crypto'
import { parseImportBackup, serializeTextExport, serializeUnprotectedBackup } from '../lib/transfer'
import { readBrowserBackup, saveExportFile } from '../lib/backup'

function fixture(): VaultData {
  const data = emptyVault()
  const now = new Date().toISOString()
  data.entries.push({ id: crypto.randomUUID(), title: 'Private test account', username: 'test@example.invalid', password: 'fictional-password-ä', url: 'https://example.invalid', notes: 'Line one\nLine two — Unicode', category: 'Work', tags: ['tag'], favorite: true, icon: 'github', createdAt: now, modifiedAt: now, passwordChangedAt: now })
  return data
}

test('Unprotected backup restores every entry and setting without the old password', async () => {
  const data = fixture()
  const serialized = serializeUnprotectedBackup(data)
  assert.ok(serialized.includes('fictional-password-ä'))
  const backup = parseImportBackup(serialized)
  assert.equal(backup.protection, 'none')
  if (backup.protection !== 'none') throw new Error('Wrong protection')
  assert.deepEqual(backup.data, data)
  const salt = newSalt(), key = await deriveKey('new-device-password', salt)
  const envelope = await encryptVault(backup.data, key, salt)
  assert.ok(!JSON.stringify(envelope).includes('fictional-password'))
  assert.deepEqual(await decryptVault(envelope, key), data)
  assert.throws(() => parseBackup(serialized), /not a supported/)
  assert.equal((await readBrowserBackup(new File([serialized], 'backup.vault'))).text, serialized)
})

test('Old encrypted backups keep their format and still require their password', async () => {
  const salt = newSalt(), key = await deriveKey('original-backup-password', salt)
  const data = fixture()
  const text = JSON.stringify(await encryptVault(data, key, salt))
  const backup = parseImportBackup(text)
  assert.equal(backup.protection, 'password')
  if (backup.protection !== 'password') throw new Error('Wrong protection')
  assert.deepEqual(await decryptVault(backup.envelope, key), data)
  await assert.rejects(decryptVault(backup.envelope, await deriveKey('incorrect-password', salt)))
})

test('Readable text includes credentials but cannot be imported, even renamed to .vault', async () => {
  const text = serializeTextExport(fixture())
  assert.match(text, /^VAULT TEXT EXPORT — NOT IMPORTABLE/)
  for (const value of ['Username: test@example.invalid', 'Password: fictional-password-ä', 'Line two — Unicode', 'Favorite: Yes', 'Tags: tag']) assert.ok(text.includes(value))
  assert.throws(() => parseImportBackup(text), /cannot be imported/)
  await assert.rejects(readBrowserBackup(new File([text], 'renamed.vault')), /cannot be imported/)
  assert.match(serializeTextExport(emptyVault()), /Entries: 0/)
})

test('Malformed and oversized unprotected backups are rejected', () => {
  const valid = JSON.parse(serializeUnprotectedBackup(fixture()))
  for (const value of [{ ...valid, version: 2 }, { ...valid, extra: true }, { ...valid, data: { ...valid.data, entries: [{ title: 'bad' }] } }, { ...valid, data: { ...valid.data, entries: [valid.data.entries[0], valid.data.entries[0]] } }]) {
    assert.throws(() => parseImportBackup(JSON.stringify(value)), /not a supported/)
  }
  assert.throws(() => parseImportBackup('ä'.repeat(10_000_001)), /20 MB/)
})

test('Only encrypted backups reach the download boundary, including legacy-mode attempts', async () => {
  let blob: Blob | undefined
  const anchor = { href: '', download: '', click() {}, remove() {} }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalURL = URL.createObjectURL, originalTimer = globalThis.setTimeout
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => anchor, body: { appendChild() {} } } })
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:test' }
  globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout
  try {
    await assert.rejects(saveExportFile('readable fixture', 'text'), /Only password-protected/)
    await assert.rejects(saveExportFile(serializeUnprotectedBackup(fixture()), 'unprotected'), /Only password-protected/)
    await assert.rejects(saveExportFile(serializeUnprotectedBackup(fixture()), 'encrypted'), /Only password-protected/)
    assert.equal(blob, undefined, 'no plaintext Blob is ever created')
    const salt = newSalt(), key = await deriveKey('Backup-only regression password!', salt)
    const data = fixture()
    const encrypted = JSON.stringify(await encryptVault(data, key, salt))
    await saveExportFile(encrypted, 'encrypted')
    assert.match(anchor.download, /^vault-[0-9T-]+\.vault$/)
    assert.equal(blob!.type, 'application/octet-stream')
    assert.equal(await blob!.text(), encrypted)
    assert.ok(!(await blob!.text()).includes(data.entries[0].password))
  } finally {
    URL.createObjectURL = originalURL; globalThis.setTimeout = originalTimer
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
