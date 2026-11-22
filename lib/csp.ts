/**
 * Content Security Policy for the app itself (Android, Windows and web).
 * connect-src 'self' means the app can only talk to its own bundled files: no request
 * can leave the device. Inline scripts are required by the Next.js static export.
 */
export function contentSecurityPolicy(development = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}
