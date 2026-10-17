import type { CountyStudentDetail, CountyStudentsQuery, CountyStudentsResult } from '@nemis-desktop/types';

/** County (CEO) Students pages, read from this device's synced database
 * (docs/superpowers/specs/2026-10-17-county-students-design.md §5.2–5.3). */
export interface ICountyStudentsReadModel {
  /** counties.service getCountyStudents + the stat cards, own county's active schools. */
  listStudents(query: CountyStudentsQuery): Omit<CountyStudentsResult, 'county' | 'districts'>;
  /** A student on this device (own county), with their local year-by-year record and transfers; else null. */
  getStudent(id: string): CountyStudentDetail | null;
}
