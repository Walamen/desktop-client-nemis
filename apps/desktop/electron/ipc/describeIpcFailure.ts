import { RemoteRejectedError } from '@nemis-desktop/shared';

const MAX_CAUSE_DEPTH = 5;

/**
 * Extracts the server's explanation from a rejected remote call, found directly
 * or as a `cause` of a use-case error. `RemoteRejectedError.message` is generic
 * (sync code embeds it), so the log needs these fields to show the real reason.
 */
export function describeIpcFailure(error: unknown): Record<string, unknown> | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (current instanceof RemoteRejectedError) {
      return {
        status: current.status,
        remoteMessage: current.remoteMessage,
        remoteErrorCode: current.remoteErrorCode,
      };
    }
    if (!(current instanceof Error)) return undefined;
    current = current.cause;
  }
  return undefined;
}
