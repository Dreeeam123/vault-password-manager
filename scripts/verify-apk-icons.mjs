import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const [apk, aapt2, mode] = process.argv.slice(2)
assert.ok(apk && aapt2, 'Usage: node scripts/verify-apk-icons.mjs <apk> <aapt2> [--icon-probe]')
assert.ok(mode === undefined || mode === '--icon-probe', 'Unknown verification mode')
const isProbe = mode === '--icon-probe'
const dump = (...args) => execFileSync(aapt2, ['dump', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const themes = JSON.parse(await readFile('lib/app-icons.json', 'utf8'))
const launcherName = theme => theme === 'classic' ? 'vault_launcher' : `vault_launcher_${theme}`

const resources = dump('resources', apk)
assert.doesNotMatch(resources, /\b(?:drawable|mipmap)\/\$?ic_launcher/, 'Obsolete launcher artwork must not be packaged')
const resourceId = name => {
  const id = resources.match(new RegExp(`resource (0x[0-9a-f]+) mipmap/${name}\\s`))?.[1]
  assert.ok(id, `Missing packaged resource: ${name}`)
  return id
}
const manifest = dump('xmltree', apk, '--file', 'AndroidManifest.xml')
const pixels = async input => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

// Application + MainActivity use the classic icon.
const classic = resourceId('vault_launcher')
const classicRound = resourceId('vault_launcher_round')
for (const [attribute, expected] of [['icon', classic], ['roundIcon', classicRound]]) {
  const refs = [...manifest.matchAll(new RegExp(`android:${attribute}\\([^)]*\\)=@(0x[0-9a-f]+)`, 'g'))].map(match => match[1])
  assert.ok(refs.length >= 2 + Object.keys(themes).length, `Application, activity and every alias must set ${attribute}`)
  assert.equal(refs.filter(ref => ref === expected).length, 3, `Application, activity and the classic alias must use the classic ${attribute}`)
}

// Exactly one launcher alias per theme; only classic enabled by default.
const aliasBlocks = manifest.split(/\n(?=\s+E: activity-alias)/).filter(block => /E: activity-alias/.test(block))
assert.equal(aliasBlocks.length, Object.keys(themes).length, 'One activity-alias per theme')
assert.doesNotMatch(manifest.split(/\n(?=\s+E: activity-alias)/)[0].match(/E: activity \(.*?(?=\n\s{4}E: |$)/s)?.[0] ?? '', /android\.intent\.category\.LAUNCHER/, 'MainActivity itself must not be a launcher entry')
let packagedPngs = 0
for (const [theme, palette] of Object.entries(themes)) {
  const name = launcherName(theme)
  const launcher = resourceId(name)
  const round = resourceId(`${name}_round`)
  const foreground = resourceId(`${name}_foreground`)
  const block = aliasBlocks.find(candidate => candidate.includes(`="app.privatevault.test.${palette.alias}"`) || candidate.includes(`.${palette.alias}"`))
  assert.ok(block, `Missing launcher alias ${palette.alias}`)
  assert.match(block, /android\.intent\.category\.LAUNCHER/, `${palette.alias} must be a launcher entry`)
  assert.match(block, /android\.intent\.action\.MAIN/, `${palette.alias} must declare the MAIN action`)
  assert.match(block, /android:targetActivity\([^)]*\)="[^"]*\.MainActivity"/, `${palette.alias} must target MainActivity`)
  assert.match(block, new RegExp(`android:icon\\([^)]*\\)=@${launcher}`), `${palette.alias} uses the wrong icon`)
  assert.match(block, new RegExp(`android:roundIcon\\([^)]*\\)=@${round}`), `${palette.alias} uses the wrong round icon`)
  // aapt2 prints booleans as "=true"/"=false" (recent) or "=(type 0x12)0xffffffff"/"0x0" (older).
  const enabledRaw = block.match(/android:enabled\([^)]*\)=(?:\(type 0x12\))?(true|false|0x[0-9a-f]+)/)?.[1]
  assert.ok(enabledRaw, `${palette.alias} must declare android:enabled explicitly`)
  const enabled = enabledRaw === 'true' || (enabledRaw !== 'false' && enabledRaw !== '0x0')
  assert.equal(enabled, theme === 'classic', `${palette.alias} enabled state must be ${theme === 'classic'}`)
  for (const xmlName of [name, `${name}_round`]) {
    const xml = dump('xmltree', apk, '--file', `res/mipmap-anydpi-v26/${xmlName}.xml`)
    for (const layer of ['foreground', 'monochrome']) {
      assert.match(xml, new RegExp(`E: ${layer}[^\\n]*\\n\\s+A: [^\\n]*=@${foreground}`), `Wrong ${layer} for ${xmlName}`)
    }
  }
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const file of [name, `${name}_round`, `${name}_foreground`]) {
      const packaged = execFileSync('unzip', ['-p', apk, `res/mipmap-${density}-v4/${file}.png`])
      const [actual, source] = await Promise.all([pixels(packaged), pixels(`android/app/src/main/res/mipmap-${density}/${file}.png`)])
      assert.deepEqual(actual.info, source.info, `Wrong dimensions: ${density}/${file}`)
      assert.deepEqual(actual.data, source.data, `Packaged icon differs from Vault artwork: ${density}/${file}`)
      packagedPngs++
    }
  }
}

const badging = dump('badging', apk)
const expectedLabel = isProbe ? 'Vault Icon-Test' : 'Vault'
const expectedPackage = isProbe ? 'app.privatevault.mobile.iconprobe' : 'app.privatevault.mobile'
assert.equal(badging.match(/package: name='([^']+)'/)?.[1], expectedPackage, 'Wrong application ID: icon probe must not replace Vault')
assert.equal(badging.match(/application-label:'([^']+)'/)?.[1], expectedLabel, 'Wrong application label')
// The launcher entry points are activity-aliases (one per theme). Their MAIN/LAUNCHER intent, target and
// enabled state are verified from the manifest above; `aapt2 dump badging` ignores aliases in recent versions
// and prints no launchable-activity line (or an empty label), so it is only cross-checked when present.
const launchable = badging.match(/^launchable-activity:.*$/m)?.[0]
if (launchable) {
  assert.match(launchable, /name='[^']*\.LauncherClassic'/, `Launcher must be the Classic alias, got: ${launchable}`)
  const launchableLabel = launchable.match(/label='([^']*)'/)?.[1]
  if (launchableLabel) assert.equal(launchableLabel, expectedLabel, `Wrong launcher label: ${launchable}`)
}
const version = badging.match(/versionName='([0-9.]+(?:-icon-test)?)'/)?.[1]
assert.ok(version, 'Missing APK version')
const filename = isProbe ? 'vault-icon-test.apk' : `vault-${version}-debug.apk`
await copyFile(apk, join(dirname(apk), filename))
console.log(`Verified ${expectedLabel} ${version} (${expectedPackage}): ${aliasBlocks.length} launcher aliases, adaptive/themed icons and ${packagedPngs} packaged PNGs. Created ${filename}.`)
