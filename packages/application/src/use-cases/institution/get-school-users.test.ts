import { describe, expect, it } from 'vitest';
import type { SchoolUsersResult } from '@nemis-desktop/types';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemorySchoolUsersReadModel } from '../../testing/institution/in-memory-school-users-read-model';
import { GetSchoolUsersUseCase } from './get-school-users';

describe('GetSchoolUsersUseCase', () => {
  it('returns device source', async () => {
    const list: Omit<SchoolUsersResult, 'source'> = {
      users: [
        {
          id: 'u-1', firstName: 'Ada', lastName: 'Doe', email: 'ada@x.lr', phoneNumber: null, photoUrl: null,
          role: 'INSTITUTION_STAFF', title: 'Registrar', modules: ['STUDENTS'], isActive: true,
          lastLoginAt: null, staffId: null,
        },
      ],
      linkableStaff: [{ id: 's-1', firstName: 'Ben', lastName: 'Roe', position: 'TEACHER' }],
    };
    const readModel = new InMemorySchoolUsersReadModel(list);

    const { data } = await new GetSchoolUsersUseCase({ readModel, logger: new RecordingLogger() }).execute({
      institutionId: 'sch-1',
    });

    expect(readModel.lastInstitutionId).toBe('sch-1');
    expect(data).toEqual({ source: 'device', ...list });
  });
});
