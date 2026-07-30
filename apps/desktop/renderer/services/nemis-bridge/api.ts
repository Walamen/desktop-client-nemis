/** Guards access to the Electron preload bridge (`window.nemis`). Every file
 * under services/nemis-bridge/ calls this — it is the only place in the
 * renderer allowed to touch `window.nemis` directly. */
export function api() {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis;
}
