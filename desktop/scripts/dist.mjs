import { spawnSync } from 'node:child_process'
import { readAppVersion } from './prepare.mjs'

// The installer version always follows lib/about.ts, the same source the Android build and the UI use.
const version = await readAppVersion()
const result = spawnSync(
  'pnpm',
  ['exec', 'electron-builder', '--win', `--config.extraMetadata.version=${version}`, ...process.argv.slice(2)],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)
