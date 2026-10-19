import type { CountyUserOptions, CountyUsersQuery, CountyUsersResult } from '@nemis-desktop/types';

/** County (CEO) Administrative Users page, read from this device's synced database
 * (docs/superpowers/specs/2026-10-19-county-users-design.md §5.1–5.6). */
export interface ICountyUsersReadModel {
  /** Filtered, paged DEO / School Admin users plus the four stats. */
  listUsers(query: CountyUsersQuery): Omit<CountyUsersResult, 'county'>;
  /** Districts and schools for the assign and create forms. */
  listOptions(): Omit<CountyUserOptions, 'county'>;
}
