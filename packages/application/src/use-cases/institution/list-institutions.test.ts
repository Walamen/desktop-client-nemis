import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { ListInstitutionsUseCase } from './list-institutions';
import { InMemoryInstitutionRepository } from '../../testing/institution/in-memory-institution-repository';
import { InMemoryDistrictRepository } from '../../testing/institution/in-memory-district-repository';
import { InMemoryStudentRepository } from '../../testing/students/in-memory-student-repository';
import { RecordingLogger } from '../../testing';

function institution(id: string, name: string, districtId?: string) {
  return Institution.reconstitute({
    id, code: id.toUpperCase(), name,
    type: InstitutionType.SCHOOL, ownership: OwnershipType.GOVERNMENT,
    countyId: 'county-1', districtId,
    approvalStatus: ApprovalStatus.APPROVED,
    version: 1, updatedAt: '2026-08-07T00:00:00.000Z',
  });
}

describe('ListInstitutionsUseCase', () => {
  it('joins institutions with district names and student counts', async () => {
    const institutions = new InMemoryInstitutionRepository();
    institutions.store.set('inst-1', institution('inst-1', 'Monrovia Central', 'district-1'));
    institutions.store.set('inst-2', institution('inst-2', 'Zorzor Elementary'));
    const districts = new InMemoryDistrictRepository();
    districts.store.set('district-1', { id: 'district-1', name: 'Sinkor District', countyId: 'county-1' });
    const students = new InMemoryStudentRepository();
    // countByInstitution is derived from seeded Student aggregates elsewhere;
    // here we exercise the use case's join logic directly against a stubbed
    // repository method instead of constructing full Student aggregates.
    students.countByInstitution = () => [{ institutionId: 'inst-1', studentCount: 42 }];

    const useCase = new ListInstitutionsUseCase({ institutions, districts, students, logger: new RecordingLogger() });
    const res = await useCase.execute({});

    expect(res.data).toHaveLength(2);
    const monrovia = res.data!.find((i) => i.id === 'inst-1');
    expect(monrovia).toMatchObject({
      name: 'Monrovia Central', districtId: 'district-1', districtName: 'Sinkor District', studentCount: 42,
    });
    const zorzor = res.data!.find((i) => i.id === 'inst-2');
    expect(zorzor).toMatchObject({ name: 'Zorzor Elementary', districtId: undefined, districtName: undefined, studentCount: 0 });
  });

  it('returns an empty list when no institutions have synced yet', async () => {
    const useCase = new ListInstitutionsUseCase({
      institutions: new InMemoryInstitutionRepository(),
      districts: new InMemoryDistrictRepository(),
      students: new InMemoryStudentRepository(),
      logger: new RecordingLogger(),
    });
    expect((await useCase.execute({})).data).toEqual([]);
  });
});
