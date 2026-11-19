import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as icons from 'simple-icons'
import sharp from 'sharp'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Fingerprint } from 'lucide-react'

const root = process.cwd()
const brands = join(root, 'public', 'brands')
await mkdir(brands, { recursive: true })
const catalog = Object.values(icons).filter(icon => icon.slug && icon.path).sort((a, b) => a.title.localeCompare(b.title, 'en'))
await writeFile(join(brands, 'catalog.json'), JSON.stringify(catalog.map(icon => ({ slug: icon.slug, title: icon.title, aliases: icon.aliases?.aka ?? [] }))))
await writeFile(join(brands, 'catalog.svg'), `<svg xmlns="http://www.w3.org/2000/svg">${catalog.map(icon => `<symbol id="${icon.slug}" viewBox="0 0 24 24"><path fill="currentColor" d="${icon.path}"/></symbol>`).join('')}</svg>`)

// One launcher icon per theme: fingerprint mark on the theme's accent. "classic" keeps the
// plain vault_launcher name so the default manifest entries stay unchanged.
const themes = JSON.parse(await readFile(join(root, 'lib', 'app-icons.json'), 'utf8'))
const marks = new Map()
function fingerprint(color) {
  if (!marks.has(color)) marks.set(color, Buffer.from(renderToStaticMarkup(createElement(Fingerprint, { size: 512, color, strokeWidth: 1.6 }))))
  return marks.get(color)
}
async function appIcon(size, { background, mark }, transparent = false) {
  const markSize = Math.round(size * (transparent ? .48 : .60))
  const glyph = await sharp(fingerprint(mark)).resize(markSize, markSize).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: transparent ? '#00000000' : background } }).composite([{ input: glyph, gravity: 'centre' }]).png().toBuffer()
}
export const launcherName = theme => theme === 'classic' ? 'vault_launcher' : `vault_launcher_${theme}`
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const adaptive = join(root, 'android/app/src/main/res/mipmap-anydpi-v26')
const previews = join(root, 'public', 'app-icons')
await mkdir(adaptive, { recursive: true })
await mkdir(previews, { recursive: true })
for (const [theme, palette] of Object.entries(themes)) {
  const name = launcherName(theme)
  for (const [density, size] of Object.entries(densities)) {
    const directory = join(root, `android/app/src/main/res/mipmap-${density}`)
    await mkdir(directory, { recursive: true })
    const legacy = await appIcon(size, palette)
    await writeFile(join(directory, `${name}.png`), legacy)
    await writeFile(join(directory, `${name}_round.png`), legacy)
    await writeFile(join(directory, `${name}_foreground.png`), await appIcon(Math.round(size * 108 / 48), palette, true))
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/${name}_background"/>\n    <foreground android:drawable="@mipmap/${name}_foreground"/>\n    <monochrome android:drawable="@mipmap/${name}_foreground"/>\n</adaptive-icon>\n`
  await writeFile(join(adaptive, `${name}.xml`), xml)
  await writeFile(join(adaptive, `${name}_round.xml`), xml)
  await writeFile(join(previews, `${theme}.png`), await appIcon(96, palette))
}
await writeFile(join(root, 'android/app/src/main/res/values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${Object.entries(themes).map(([theme, palette]) => `    <color name="${launcherName(theme)}_background">${palette.background}</color>`).join('\n')}\n</resources>\n`)
await writeFile(join(root, 'public', 'vault-app-icon.png'), await appIcon(512, themes.classic))
console.log(`Generated ${catalog.length} offline brand icons and ${Object.keys(themes).length} Android launcher icon sets.`)
