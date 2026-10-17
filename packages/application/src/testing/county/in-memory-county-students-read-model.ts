import type { CountyStudentDetail, CountyStudentsQuery, CountyStudentsResult } from '@nemis-desktop/types';
import type { ICountyStudentsReadModel } from '../../interfaces/county/county-students-read-model';

/** Settable canned page and details; records the last query. */
export class InMemoryCountyStudentsReadModel implements ICountyStudentsReadModel {
  page: Omit<CountyStudentsResult, 'county' | 'districts'> = {
    schools: [],
    stats: { total: 0, male: 0, female: 0, active: 0, inactive: 0 },
    data: [],
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  };
  studentById = new Map<string, CountyStudentDetail>();
  lastQuery: CountyStudentsQuery | null = null;

  listStudents(query: CountyStudentsQuery): Omit<CountyStudentsResult, 'county' | 'districts'> {
    this.lastQuery = query;
    return this.page;
  }

  getStudent(id: string): CountyStudentDetail | null {
    return this.studentById.get(id) ?? null;
  }
}
