import { describe, expect, it } from 'vitest';
import { createTestApplication } from '../../testing/create-test-application';
import { SchoolsViewModel } from './schools-view-model';
import { Institution } from '@nemis-desktop/domain';
import { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';

describe('SchoolsViewModel', () => {
  it('loads every institution in the local database', async () => {
    const { app, ports } = createTestApplication();
    ports.institutions.store.set(
      'inst-1',
      Institution.reconstitute({
        id: 'inst-1', code: 'sch-1', name: 'Monrovia Central',
        type: InstitutionType.SCHOOL, ownership: OwnershipType.GOVERNMENT,
        countyId: 'county-1', approvalStatus: ApprovalStatus.APPROVED,
        version: 1, updatedAt: '2026-08-07T00:00:00.000Z',
      }),
    );
    const vm = new SchoolsViewModel({ institution: app.institution });

    await vm.loadInstitutions();

    const state = vm.store.getState().institutions;
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data).toHaveLength(1);
      expect(state.data[0]!.name).toBe('Monrovia Central');
    }
  });

  it('renders empty (not an error) when no institutions have synced yet', async () => {
    const { app } = createTestApplication();
    const vm = new SchoolsViewModel({ institution: app.institution });
    await vm.loadInstitutions();
    expect(vm.store.getState().institutions.status).toBe('empty');
  });
});
