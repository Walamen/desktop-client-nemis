import type { SchoolRegistrationSyncState } from "@nemis-desktop/types";

/** A school saved on this device: amber while it waits to be sent, red once
 * the server refused it (reason on hover). Nothing once it is a real school. */
export function SchoolRegistrationBadge({
  syncState,
  syncError,
}: {
  syncState: SchoolRegistrationSyncState | null;
  syncError: string | null;
}) {
  if (syncState === "pending") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
        Waiting to sync
      </span>
    );
  }
  if (syncState === "rejected") {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"
        title={syncError ?? undefined}
      >
        Couldn&apos;t be added
      </span>
    );
  }
  return null;
}
