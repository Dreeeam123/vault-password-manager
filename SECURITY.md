# Security Policy

## Audit status

VAULT has **not** undergone an independent security audit. The full source is public so anyone can review how it works. An audit by a reputable firm is a goal; this file will link the report once one exists.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. Include the affected version (Settings → About in the app), platform (Windows or Android), steps to reproduce, and the impact you expect.

Fixes are released before details are made public, and reporters are credited unless they prefer otherwise.

## How VAULT protects your data

- **Key derivation:** your master password is turned into a 256-bit key with PBKDF2-SHA256, 600,000 iterations and a random 128-bit salt per vault. The work factor is fixed and validated, so a hostile backup file cannot request a different one.
- **Encryption:** the complete vault (entries and settings) is encrypted with AES-256-GCM. Every save uses a fresh random 96-bit IV and a 128-bit authentication tag. The format string `Vault:v1:PBKDF2-SHA256:600000:AES-256-GCM` is bound as additional authenticated data.
- **Key handling:** on Windows and the web the key is a non-extractable Web Crypto key held only in memory and discarded on lock, inactivity or backgrounding. On Android, an optional remembered session wraps the key with an AES-256-GCM key in the Android Keystore (hardware-backed where available); it is never stored next to the ciphertext.
- **Storage:** only the encrypted envelope, a revision ID and unlock-delay counters are stored locally in IndexedDB. The app makes no network requests at runtime.
- **No network access:** a Content Security Policy (`connect-src 'self'`) only lets the app load its own bundled files, and the Android app does not request the INTERNET permission, so the system itself blocks outgoing connections.
- **Device protection:** screenshots and the app switcher preview are blocked (`FLAG_SECURE` on Android, content protection on Windows), Android cloud backups are disabled, and copied secrets are flagged as sensitive so Android 13+ hides them in the clipboard preview.
- **Backups:** exported backups use the same encrypted format and require the master password that created them.

Implementation: [`lib/crypto.ts`](./lib/crypto.ts), [`lib/session.ts`](./lib/session.ts), [`lib/db.ts`](./lib/db.ts).

## What VAULT does not protect against

- Malware, keyloggers, malicious browser extensions, or anyone with control of your unlocked device.
- Weak master passwords. Exported backups can be attacked offline; the unlock delay only slows attempts inside the app.
- Memory forensics. JavaScript cannot guarantee that strings are wiped from memory.
- Clipboard snooping. Clipboard clearing is best-effort and can fail if the app is suspended or killed.
- A forgotten master password. There is no recovery, by design.

## Supported versions

Only the latest release receives security fixes.
