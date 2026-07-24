import { describe, expect, it, vi } from 'vitest';
import type { AcademicsApplicationService } from '@nemis-desktop/application';
import { NotificationStore } from '../../stores/notification-store';
import { AcademicFoundationViewModel } from './academic-foundation-view-model';

function makeAcademics(): AcademicsApplicationService {
  return {
    listAcademicYears: vi.fn(async () => ({ data: [{
      id: 'year-1', institutionId: 'school-1', code: '2026/2027', startDate: '2026-09-01',
      endDate: '2027-07-31', isCurrent: true, status: 'ACTIVE', termCount: 0, classCount: 0,
    }] })),
    listClasses: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
    listSubjects: vi.fn(async () => ({ data: { items: [], total: 0, limit: 25, offset: 0 } })),
  } as unknown as AcademicsApplicationService;
}

describe('AcademicFoundationViewModel', () => {
  it('loads academic years through the ApplicationLayer facade', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadAcademicYears();
    const state = vm.store.getState().academicYears;
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.data[0]?.code).toBe('2026/2027');
  });

  it('represents an empty class page as an empty state', async () => {
    const vm = new AcademicFoundationViewModel({ academics: makeAcademics(), notifications: new NotificationStore() });
    await vm.loadClasses();
    expect(vm.store.getState().classes.status).toBe('empty');
  });
});
