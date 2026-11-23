# Security Policy

## Audit status

VAULT has **not** undergone an independent security audit. The full source is public so anyone can review how it works. An audit by a reputable firm is a goal; this file will link the report once one exists.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. Include the affected version (Settings → About in the app), platform (Windows or Android), steps to reproduce, and the impact you expect.

Fixes are released before details are made public, and reporters are credited unless they prefer otherwise.

## How VAULT protects your data

- **Key derivation:** your master password is turned into a 256-bit key with Argon2id (64 MiB memory, 3 passes, 4 lanes, following RFC 9106) and a random 128-bit salt per vault. The work factor is fixed and validated, so a hostile backup file cannot request a different one. Vaults and backups created before version 1.4.5 used PBKDF2-SHA256 with 600,000 iterations; they still open and are re-encrypted with a fresh salt and an Argon2id key the next time you unlock with your master password.
- **Encryption:** the complete vault (entries and settings) is encrypted with AES-256-GCM. Every save uses a fresh random 96-bit IV and a 128-bit authentication tag. The format string `Vault:v2:Argon2id:m=65536,t=3,p=4:AES-256-GCM` is bound as additional authenticated data.
- **Key handling:** on Windows and the web the key is a non-extractable Web Crypto key held only in memory and discarded on lock, inactivity or backgrounding. On Android, an optional remembered session wraps the key with an AES-256-GCM key in the Android Keystore (hardware-backed where available); it is never stored next to the ciphertext.
- **Storage:** only the encrypted envelope, a revision ID and unlock-delay counters are stored locally in IndexedDB. The app makes no network requests at runtime.
- **No network access:** a Content Security Policy (`connect-src 'self'`) only lets the app load its own bundled files, and the Android app does not request the INTERNET permission, so the system itself blocks outgoing connections.
- **Device protection:** screenshots and the app switcher preview are blocked (`FLAG_SECURE` on Android, content protection on Windows), Android cloud backups are disabled, and copied secrets are flagged as sensitive so Android 13+ hides them in the clipboard preview.
- **Backups:** exported backups use the same encrypted format and require the master password that created them.

Implementation: [`lib/crypto.ts`](./lib/crypto.ts), [`lib/session.ts`](./lib/session.ts), [`lib/db.ts`](./lib/db.ts).

## What VAULT does not protect against

- Malware, keyloggers, malicious browser extensions, or anyone with control of your unlocked device.
- Weak master passwords. VAULT rejects master passwords that are shorter than 12 characters or easy to guess (common words, repeats, simple patterns), but no check can guarantee a password is unguessable. Exported backups can be attacked offline; the unlock delay only slows attempts inside the app.
- Memory forensics. JavaScript cannot guarantee that strings are wiped from memory.
- Clipboard snooping. Copied secrets are always cleared after 15, 30 or 60 seconds and whenever the vault locks; there is no option to keep them. Clearing is still best-effort: if the operating system suspends or kills the app first, VAULT retries on the next resume and warns you when it cannot.
- A forgotten master password. There is no recovery, by design.

## Supported versions

Only the latest release receives security fixes.
