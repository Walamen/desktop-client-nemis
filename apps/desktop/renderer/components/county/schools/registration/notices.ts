import type { SchoolRegistration, SchoolRegistrationSyncState } from '@nemis-desktop/types';

/** Ids whose outcome a page already showed (the online wait after Save), so
 * the background notice does not announce them again. Lives for the app session. */
const acknowledged = new Set<string>();

export function acknowledgeRegistrations(ids: readonly string[]): void {
  for (const id of ids) acknowledged.add(id);
}

export function acknowledgedRegistrations(): ReadonlySet<string> {
  return acknowledged;
}

/** Schools a background sync just accepted or refused, since the last look. */
export function registrationNotices(
  prev: ReadonlyMap<string, SchoolRegistrationSyncState>,
  next: readonly SchoolRegistration[],
  seen: ReadonlySet<string>,
): { added: number; refused: number } {
  let added = 0;
  let refused = 0;
  for (const row of next) {
    if (prev.get(row.id) !== 'pending' || seen.has(row.id)) continue;
    if (row.syncState === 'synced') added += 1;
    else if (row.syncState === 'rejected') refused += 1;
  }
  return { added, refused };
}

export function addedMessage(n: number): string {
  return `${n} school${n === 1 ? '' : 's'} added: principal logins are ready.`;
}

export function refusedMessage(n: number): string {
  return `${n} school${n === 1 ? '' : 's'} couldn't be added`;
}
