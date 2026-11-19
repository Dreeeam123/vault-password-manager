import assert from 'node:assert/strict'
import test from 'node:test'
import { clearClipboard, copySecret, retryClipboardClear } from '../lib/clipboard'

test('Email and username copy exactly, clear on lock, and report permission failures', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const writes: string[] = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (value: string) => { writes.push(value) } } } })
  try {
    assert.equal(await copySecret('test+vault@example.com'), true)
    assert.equal(await copySecret('username.with-dots'), true)
    await clearClipboard()
    assert.deepEqual(writes, ['test+vault@example.com', 'username.with-dots', ''])
    assert.equal(await copySecret('no-timer-secret', 0), true)
    await clearClipboard()
    assert.deepEqual(writes.slice(-2), ['no-timer-secret', ''], 'lock still clears when the timeout is Never')

    let finishWrite!: () => void
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (value: string) => {
      if (value) await new Promise<void>(resolve => { finishWrite = resolve })
      writes.push(value)
    } } } })
    const copy = copySecret('slow-copy-secret')
    while (!finishWrite) await Promise.resolve()
    const lock = clearClipboard()
    finishWrite()
    assert.equal(await copy, false, 'a lock cancels copy success')
    await lock
    assert.deepEqual(writes.slice(-2), ['slow-copy-secret', ''], 'late clipboard writes cannot outlive the lock')

    let blocked = false
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (value: string) => { if (blocked) throw new Error('NotAllowedError'); writes.push(value) } } } })
    await copySecret('retry-secret', 0)
    blocked = true
    await clearClipboard()
    blocked = false
    retryClipboardClear()
    await clearClipboard()
    assert.deepEqual(writes.slice(-2), ['retry-secret', ''], 'failed background cleanup retries on return')
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('NotAllowedError') } } } })
    assert.equal(await copySecret('must-not-report-success'), false)
  } finally {
    await clearClipboard()
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})
