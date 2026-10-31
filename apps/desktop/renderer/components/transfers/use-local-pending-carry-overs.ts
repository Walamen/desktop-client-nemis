'use client';

import { useState } from 'react';
import type { PendingCarryOver } from '@nemis-desktop/types';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { carryOverBridge } from '@/services/nemis-bridge/school-admin/carry-over-bridge';

export const matchPriorRecordHref = (id: string) =>
  `/government/school-admin/students/match-prior-record?id=${encodeURIComponent(id)}`;

/** The school's "Match prior record" tasks from local SQLite (works offline),
 * re-read after every sync. A failed read shows as no tasks: these are
 * reminders, never a blocker. */
export function useLocalPendingCarryOvers(): PendingCarryOver[] {
  const [rows, setRows] = useState<PendingCarryOver[]>([]);
  useRevalidateOnSync(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => carryOverBridge.listLocalPendingCarryOvers())
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}
