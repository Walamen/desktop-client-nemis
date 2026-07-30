/**
 * `Object.freeze` is shallow: freezing `nemisApi` alone would still leave its
 * nested sub-objects (`auth`, `student`, `teacher`, ...) mutable, so renderer
 * code could still do `window.nemis.auth.login = evil`. This walks the whole
 * object graph and freezes every nested object/function before it crosses the
 * `contextBridge`, so the bridge surface can't be tampered with at runtime.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  if (Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && (typeof child === 'object' || typeof child === 'function')) {
      deepFreeze(child);
    }
  }
  return value;
}
