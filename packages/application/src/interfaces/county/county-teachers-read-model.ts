import type { CountyTeacherDetail, CountyTeachersQuery, CountyTeachersResult } from '@nemis-desktop/types';

/** County (CEO) Teachers pages, read from this device's synced database
 * (docs/superpowers/specs/2026-10-18-county-teachers-design.md §5). */
export interface ICountyTeachersReadModel {
  /** counties.service getCountyTeachers + the stat cards, own county's active schools, teaching staff. */
  listTeachers(query: CountyTeachersQuery): Omit<CountyTeachersResult, 'county'>;
  /** Any staff member at a school in the own county; else null. */
  getTeacher(id: string): CountyTeacherDetail | null;
}
