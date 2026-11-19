import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { isRendererUrl, rendererPath, isExternalUrl } = createRequire(import.meta.url)('../desktop/security.cjs')

test('Desktop navigation accepts only the exact app host and HTTPS browser links', () => {
  assert.equal(isRendererUrl('vault://app/'), true)
  for (const url of ['vault://app.evil/', 'vault://app@evil/', 'vault://evil@app/', 'vault://app:123/', 'https://app/', 'javascript:alert(1)', 'invalid']) assert.equal(isRendererUrl(url), false, url)
  assert.equal(isExternalUrl('https://buymeacoffee.com/amirzafer79'), true)
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://example.test/', 'https://user:password@example.test/', 'invalid']) assert.equal(isExternalUrl(url), false, url)
})

test('Desktop assets cannot escape into sibling directories or malformed paths', () => {
  const root = resolve('desktop/renderer')
  assert.equal(rendererPath(root, 'vault://app/'), resolve(root, 'index.html'))
  assert.equal(rendererPath(root, 'vault://app/_next/static/app.js'), resolve(root, '_next/static/app.js'))
  for (const url of ['vault://app/..%2Frenderer-private%2Fsecret', 'vault://app/..%5Crenderer-private%5Csecret', 'vault://app/%00', 'vault://app/%ZZ', 'vault://other/index.html']) assert.equal(rendererPath(root, url), null, url)
})
