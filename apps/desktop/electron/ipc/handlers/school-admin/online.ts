import type { OnlineCommandResult } from '@nemis-desktop/types';

/** Runs an online-only command, then forces a pull so local SQLite reflects
 * what the server just did (spec D5: the pull is the only writer of local
 * truth — the response itself is never written locally). A failed refresh
 * never turns a successful command into an error: the server change already
 * happened, and an error would invite the admin to repeat a non-idempotent
 * claim. A failed command throws before any refresh. */
export async function runOnline<T>(
  command: () => Promise<T>,
  refresh: () => Promise<boolean>,
): Promise<OnlineCommandResult<T>> {
  const data = await command();
  let refreshed = false;
  try {
    refreshed = await refresh();
  } catch {
    refreshed = false;
  }
  return { data, refreshed };
}
