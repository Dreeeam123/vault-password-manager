import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = join(process.cwd(), 'out')
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat()
}
const files = (await walk(root)).filter(path => !path.endsWith('/sw.js'))
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(file))
const assets = ['/', ...files.map(file => '/' + relative(root, file).split('\\').join('/'))]
const version = hash.digest('hex').slice(0, 16)
const worker = `const CACHE = 'vault-static-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vault-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) { event.respondWith(Response.error()); return; }
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(event.request, { ignoreSearch: true });
    if (saved) return saved;
    if (event.request.mode === 'navigate') return (await cache.match('/')) || Response.error();
    return new Response('Not available offline', { status: 404 });
  }));
});
`
await writeFile(join(root, 'sw.js'), worker)
console.log(`Offline cache generated: ${assets.length} local assets; version ${version}.`)
