import type { SchoolUsersResult } from '@nemis-desktop/types';

/** Users & Access page, read from this device's synced database: the school's
 * admin and office-staff accounts, plus staff who could be given an account.
 * Offline fallback only — the server list is the full truth. */
export interface ISchoolUsersReadModel {
  list(institutionId: string): Omit<SchoolUsersResult, 'source'>;
}
