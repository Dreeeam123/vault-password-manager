import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import vm from 'node:vm'
import { join } from 'node:path'

// Exercise the exported worker with a standards-shaped cache harness. This
// verifies offline responses, not browser service-worker registration support.
test('exported worker precaches all assets and serves without a network', async () => {
  const root = join(process.cwd(), 'out')
  const source = await readFile(join(root, 'sw.js'), 'utf8')
  const handlers = new Map()
  const cacheStores = new Map()
  let assets = []
  const origin = 'https://vault.test'
  const caches = {
    async keys() { return [...cacheStores.keys()] },
    async delete(key) { return cacheStores.delete(key) },
    async open(key) {
      if (!cacheStores.has(key)) cacheStores.set(key, new Map())
      const store = cacheStores.get(key)
      return {
        async addAll(paths) {
          assets = paths
          for (const path of paths) {
            const file = join(root, path === '/' ? 'index.html' : path.slice(1))
            assert.ok((await stat(file)).isFile())
            store.set(path, new Response(await readFile(file)))
          }
        },
        async match(request) {
          const url = new URL(typeof request === 'string' ? request : request.url, origin)
          return store.get(url.pathname)?.clone()
        },
      }
    },
  }
  let claimed = false
  vm.runInNewContext(source, { URL, Response, caches, self: { location: { origin }, clients: { async claim() { claimed = true } }, addEventListener(name, handler) { handlers.set(name, handler) } } })
  let done
  handlers.get('install')({ waitUntil(promise) { done = promise } }); await done
  handlers.get('activate')({ waitUntil(promise) { done = promise } }); await done
  assert.equal(claimed, true)
  assert.ok(assets.some(asset => asset.endsWith('.woff2')))
  assert.ok(assets.some(asset => asset.endsWith('.js')))
  assert.ok(assets.some(asset => asset.endsWith('.css')))
  for (const path of assets) {
    let response
    handlers.get('fetch')({ request: { url: origin + path, method: 'GET', mode: path === '/' ? 'navigate' : 'same-origin' }, respondWith(promise) { response = promise } })
    assert.equal((await response).status, 200, `cached response missing for ${path}`)
  }
  let external
  handlers.get('fetch')({ request: { url: 'https://external.test/tracker', method: 'GET' }, respondWith(value) { external = value } })
  assert.equal(external.type, 'error')
  console.log(`Verified ${assets.length} offline responses, including the application, scripts, styles, and fonts.`)
})
