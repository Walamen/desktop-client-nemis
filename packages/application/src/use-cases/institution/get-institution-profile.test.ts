import { describe, expect, it } from 'vitest';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { GetInstitutionProfileUseCase } from './get-institution-profile';
import { InMemoryInstitutionRepository } from '../../testing/institution/in-memory-institution-repository';
import { RecordingLogger } from '../../testing';

describe('GetInstitutionProfileUseCase', () => {
  it('returns the mapped institution profile', async () => {
    const institutions = new InMemoryInstitutionRepository();
    institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1',
        code: 'lib-001',
        name: 'Monrovia Central',
        type: InstitutionType.SCHOOL,
        ownership: OwnershipType.GOVERNMENT,
        countyId: 'county-1',
        approvalStatus: ApprovalStatus.APPROVED,
        address: { communityTown: 'Sinkor' },
        version: 1,
        updatedAt: '2026-07-18T00:00:00.000Z',
      }),
    );
    const useCase = new GetInstitutionProfileUseCase({
      institutions,
      logger: new RecordingLogger(),
    });
    const res = await useCase.execute({ institutionId: 'inst-1' });
    expect(res.data?.code).toBe('LIB-001'); // SchoolCode upper-cases
    expect(res.data?.isApproved).toBe(true);
    expect(res.data?.communityTown).toBe('Sinkor');
  });

  it('returns null when the institution is missing', async () => {
    const useCase = new GetInstitutionProfileUseCase({
      institutions: new InMemoryInstitutionRepository(),
      logger: new RecordingLogger(),
    });
    expect((await useCase.execute({ institutionId: 'nope' })).data).toBeNull();
  });
});
