import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const desktop = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'))
const script = readFileSync(new URL('../desktop/uninstall.nsh', import.meta.url), 'utf8')
const macro = (name: string) => {
  const body = script.match(new RegExp(`!macro ${name}\\b([\\s\\S]*?)!macroend`))?.[1]
  assert.ok(body, `Missing ${name}`)
  return body
}

test('Windows uninstall data removal is opt-in and appears before removal starts', () => {
  assert.equal(desktop.build.nsis.oneClick, false)
  assert.equal(desktop.build.nsis.deleteAppDataOnUninstall, false)
  assert.equal(desktop.build.nsis.include, 'uninstall.nsh')
  assert.match(macro('customUnInit'), /StrCpy \$VaultDeleteData \$\{BST_UNCHECKED\}/)
  assert.match(macro('customUnWelcomePage'), /UninstPage custom un\.VaultDataPage un\.VaultDataPageLeave/)
  assert.doesNotMatch(script, /!macro customUninstallPage\b/)
  assert.match(script, /Also permanently delete my vault and settings/)
  assert.match(script, /MB_YESNO\|MB_ICONEXCLAMATION\|MB_DEFBUTTON2/)
  assert.match(script, /Without an exported backup, your passwords will be lost/)
})

test('Data removal is guarded against updates, silent uninstalls, and unchecked consent', () => {
  const removal = macro('customUnInstall')
  assert.match(removal, /\$\{IfNot\} \$\{isUpdated\}[\s\S]*\$\{IfNot\} \$\{Silent\}[\s\S]*\$\{If\} \$VaultDeleteData == \$\{BST_CHECKED\}[\s\S]*RMDir/)
  assert.match(removal, /SetShellVarContext current[\s\S]*RMDir/)
  assert.match(removal, /\$installMode == "all"[\s\S]*SetShellVarContext all/)
  assert.match(removal, /\$\{If\} \$\{Errors\}[\s\S]*Some files may remain/)
})

test('Deletion only targets this app’s current and legacy userData directories', () => {
  assert.equal(desktop.productName, 'Vault')
  assert.equal(desktop.name, 'vault-desktop')
  assert.deepEqual([...script.matchAll(/RMDir \/r "([^"]+)"/g)].map(match => match[1]), ['$APPDATA\\Vault', '$APPDATA\\vault-desktop'])
  assert.doesNotMatch(script, /\$DOCUMENTS|\$PROFILE|\$LOCALAPPDATA|\*\.vault/)
})
