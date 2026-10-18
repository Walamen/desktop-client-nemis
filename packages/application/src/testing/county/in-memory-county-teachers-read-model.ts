import type { CountyTeacherDetail, CountyTeachersQuery, CountyTeachersResult } from '@nemis-desktop/types';
import type { ICountyTeachersReadModel } from '../../interfaces/county/county-teachers-read-model';

/** Settable canned page and profiles; records the last query. */
export class InMemoryCountyTeachersReadModel implements ICountyTeachersReadModel {
  page: Omit<CountyTeachersResult, 'county'> = {
    stats: { total: 0, active: 0, inactive: 0, unassigned: 0, subjects: [] },
    data: [],
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  };
  teacherById = new Map<string, CountyTeacherDetail>();
  lastQuery: CountyTeachersQuery | null = null;

  listTeachers(query: CountyTeachersQuery): Omit<CountyTeachersResult, 'county'> {
    this.lastQuery = query;
    return this.page;
  }

  getTeacher(id: string): CountyTeacherDetail | null {
    return this.teacherById.get(id) ?? null;
  }
}
