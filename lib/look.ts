import type { StoredLook } from './db'

export const LOOK_KEY = 'vault-look'

/**
 * IndexedDB cannot be read before the first paint, so the (non-secret) look is mirrored
 * in localStorage for the boot script below. IndexedDB stays the source of truth.
 */
export function cacheLook(look: StoredLook) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)) } catch { /* cosmetic only */ }
}

/** Runs in <head> before the first paint so the app never starts in the wrong theme. */
export const LOOK_BOOT_SCRIPT = `(function(){try{var l=JSON.parse(localStorage.getItem('${LOOK_KEY}')||'null');if(!l)return;var r=document.documentElement,d=l.theme==='dark'||(l.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);r.classList.toggle('dark',d);r.classList.toggle('light',!d);if(/^[a-z]+$/.test(l.appearance))r.dataset.appearance=l.appearance}catch(e){}})()`
