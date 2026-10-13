import { useCallback } from 'react';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { useNotificationStore } from '@/lib/presentation/hooks/shared';

export type SaveMessages = { success: string; failure: string };
export type SaveOutcome<T> = { ok: true; value: T } | { ok: false };

/** The readable part of a failed save: the IPC message without its `[CODE]`
 * prefix, else a plain error's message, else ''. An unrecognised bracketed
 * message is never shown raw. */
export function describeSaveError(error: unknown): string {
  const ipc = parseIpcError(error);
  if (ipc) return ipc.message.trim();
  if (error instanceof Error && !error.message.startsWith('[')) return error.message.trim();
  return '';
}

/** "<failure sentence> <readable detail>", or just the sentence. */
export function formatSaveFailure(failure: string, error: unknown): string {
  const detail = describeSaveError(error);
  return detail ? `${failure} ${detail}` : failure;
}

/** Runs a setup-screen save with toast feedback through the same notification
 * store the view-model command pipeline uses, so every setup drawer reports
 * success and failure the same way. Never throws: callers decide what to do
 * from `ok` and stay put on failure so the admin can retry. */
export function useSaveFeedback() {
  const notifications = useNotificationStore();
  return useCallback(
    async <T>(action: () => Promise<T>, messages: SaveMessages): Promise<SaveOutcome<T>> => {
      try {
        const value = await action();
        notifications.success(messages.success);
        return { ok: true, value };
      } catch (error) {
        notifications.error(formatSaveFailure(messages.failure, error));
        return { ok: false };
      }
    },
    [notifications],
  );
}
