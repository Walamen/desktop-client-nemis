/**
 * Detects the native-module ABI mismatch that occurs when the prebuilt
 * better-sqlite3 binary targets the other runtime: the binary is swapped
 * between the Node ABI (tests) and the Electron ABI (app) by the
 * `pnpm rebuild:node` / `pnpm rebuild:electron` scripts (docs/database.md).
 * Loading the wrong one throws ERR_DLOPEN_FAILED at Database construction.
 */
export const ABI_MISMATCH_HINT =
  'better-sqlite3 is built for the other runtime (ABI mismatch). ' +
  'Run `pnpm rebuild:electron` before `pnpm dev`/`pnpm start`/`pnpm make`, ' +
  'or `pnpm rebuild:node` before `pnpm test`.';

export function isAbiMismatch(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      current.message.includes('NODE_MODULE_VERSION') ||
      (current as Error & { code?: string }).code === 'ERR_DLOPEN_FAILED'
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
