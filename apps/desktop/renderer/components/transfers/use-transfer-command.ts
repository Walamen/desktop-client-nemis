'use client';
import { useState } from 'react';
import { parseIpcError } from '@/lib/errors/parseIpcError';

/** Runs one online transfer command for a form: tracks submitting, keeps the
 * server's refusal text on failure (the form stays mounted, so its inputs
 * survive), and reports `refreshed` to the page only on success. */
export function useTransferCommand(onDone: (refreshed: boolean, notice?: string) => void, fallback: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (command: () => Promise<{ refreshed: boolean; notice?: string }>) => {
    setSubmitting(true);
    setError(null);
    let refreshed: boolean;
    let notice: string | undefined;
    try {
      ({ refreshed, notice } = await command());
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? fallback);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onDone(refreshed, notice);
  };

  return { submitting, error, run };
}
