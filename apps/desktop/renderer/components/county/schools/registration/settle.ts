import type { PrincipalLogin, SchoolRegistration } from '@nemis-desktop/types';

const FALLBACK_REFUSAL = 'The server refused this school.';

export type SettleOutcome =
  | { kind: 'accepted'; login: PrincipalLogin | null }
  | { kind: 'refused'; message: string }
  | { kind: 'waiting' };

/** What the Create page shows after its online wait (a missing row: still waiting). */
export function settleOne(registration: SchoolRegistration | undefined): SettleOutcome {
  if (registration?.syncState === 'synced') return { kind: 'accepted', login: registration.principalLogin };
  if (registration?.syncState === 'rejected') {
    return { kind: 'refused', message: registration.syncError || FALLBACK_REFUSAL };
  }
  return { kind: 'waiting' };
}

/** The Bulk Import done step: accepted, refused and still waiting rows. */
export function settleMany(rows: readonly SchoolRegistration[]): {
  created: SchoolRegistration[];
  failed: SchoolRegistration[];
  waiting: SchoolRegistration[];
} {
  return {
    created: rows.filter((row) => row.syncState === 'synced'),
    failed: rows.filter((row) => row.syncState === 'rejected'),
    waiting: rows.filter((row) => row.syncState === 'pending'),
  };
}
