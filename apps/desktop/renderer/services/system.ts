export async function getAppVersion(): Promise<string> {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis.system.getVersion();
}
