import type { SchoolUsersResult } from '@nemis-desktop/types';
import type { ISchoolUsersReadModel } from '../../interfaces/institution/school-users-read-model';

/** Canned list; records the last institution id. */
export class InMemorySchoolUsersReadModel implements ISchoolUsersReadModel {
  result: Omit<SchoolUsersResult, 'source'>;
  lastInstitutionId: string | null = null;

  constructor(result: Omit<SchoolUsersResult, 'source'> = { users: [], linkableStaff: [] }) {
    this.result = result;
  }

  list(institutionId: string): Omit<SchoolUsersResult, 'source'> {
    this.lastInstitutionId = institutionId;
    return this.result;
  }
}
