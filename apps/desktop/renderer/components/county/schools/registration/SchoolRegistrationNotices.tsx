"use client";

import { useRef } from "react";
import type { SchoolRegistrationSyncState } from "@nemis-desktop/types";
import { useCountySchoolRegistrationViewModel } from "@/lib/presentation/hooks/county";
import { useNotificationStore } from "@/lib/presentation/hooks/shared";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import {
  acknowledgedRegistrations,
  addedMessage,
  refusedMessage,
  registrationNotices,
} from "./notices";

/** Mounted once in the County layout: after each sync, one toast for the
 * schools a background sync accepted and one for those it refused. The first
 * look only records where things stand. Renders nothing. */
export function SchoolRegistrationNotices() {
  const vm = useCountySchoolRegistrationViewModel();
  const notifications = useNotificationStore();
  const previous = useRef<Map<string, SchoolRegistrationSyncState> | null>(null);

  useRevalidateOnSync(() => {
    let cancelled = false;
    void vm.states([]).then((rows) => {
      if (cancelled) return;
      if (previous.current) {
        const { added, refused } = registrationNotices(previous.current, rows, acknowledgedRegistrations());
        if (added > 0) notifications.success(addedMessage(added));
        if (refused > 0) notifications.warning(refusedMessage(refused));
      }
      previous.current = new Map(rows.map((row) => [row.id, row.syncState]));
    });
    return () => {
      cancelled = true;
    };
  }, [vm, notifications]);

  return null;
}
