'use client';

import { useEffect, useState } from 'react';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useSettingsViewModel } from '@/lib/presentation/hooks/school-admin';
import {
  countPendingDecisions,
  onTransfersChanged,
  splitByWhoAsked,
  toLocalTransfer,
  type LocalTransfer,
} from '@/lib/transfers';
import { sharedBridge } from '@/services/nemis-bridge/shared';

/** How many transfer requests are waiting on this school's decision, from
 * the locally pulled `student_transfers` rows. Re-reads after a sync and
 * whenever `notifyTransfersChanged()` fires; never calls the server and
 * never polls. When `enabled` is false (any role but the school admin) it
 * makes no reads and returns 0. A failed read yields 0, never an error. */
export function usePendingTransferCount(enabled: boolean): number {
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const us =
    enabled && (profile.status === 'success' || profile.status === 'refreshing') ? profile.data.id : '';

  const [rows, setRows] = useState<LocalTransfer[]>([]);
  const [changeKey, setChangeKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    return onTransfersChanged(() => setChangeKey((k) => k + 1));
  }, [enabled]);

  useRevalidateOnSync(() => {
    if (!enabled || !us) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => sharedBridge.listSchoolAdminRecords({ collection: 'student_transfers', limit: 250 }))
      .then((result) => {
        if (cancelled) return;
        setRows(result.items.map(toLocalTransfer).filter((r): r is LocalTransfer => r !== null));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, us, changeKey]);

  if (!enabled || !us) return 0;
  return countPendingDecisions(splitByWhoAsked(rows, us).requestsToUs, Date.now());
}
