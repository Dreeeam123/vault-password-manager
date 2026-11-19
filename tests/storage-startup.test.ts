import 'fake-indexeddb/auto'
import { IDBOpenDBRequest, IDBObjectStore, IDBRequest } from 'fake-indexeddb'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRecord } from '../lib/db'

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

test('A stalled database open times out and a retry still reads the existing vault', async context => {
  const nativeOpen = indexedDB.open.bind(indexedDB)
  const seed = nativeOpen('vault-private-v1', 1)
  seed.onupgradeneeded = () => { seed.result.createObjectStore('vault'); seed.result.createObjectStore('meta') }
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    seed.onsuccess = () => resolve(seed.result)
    seed.onerror = () => reject(seed.error)
  })
  const record = { revision: 'preserve-test-record', envelope: { ciphertext: 'test-ciphertext' } }
  const write = connection.transaction('vault', 'readwrite')
  write.objectStore('vault').put(record, 'current')
  await new Promise<void>((resolve, reject) => { write.oncomplete = () => resolve(); write.onerror = () => reject(write.error) })
  connection.close()

  const stalled = context.mock.method(indexedDB, 'open', () => new IDBOpenDBRequest())
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const failure = assert.rejects(getRecord(), /Local storage did not respond/)
  context.mock.timers.tick(10_000)
  await failure
  stalled.mock.restore()
  context.mock.timers.reset()
  assert.deepEqual(await getRecord(), record)

  const stalledRead = context.mock.method(IDBObjectStore.prototype, 'get', () => new IDBRequest())
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const readFailure = assert.rejects(getRecord(), /Local storage did not respond/)
  await flush()
  context.mock.timers.tick(10_000)
  await readFailure
  stalledRead.mock.restore()
  context.mock.timers.reset()
  assert.deepEqual(await getRecord(), record)
})
