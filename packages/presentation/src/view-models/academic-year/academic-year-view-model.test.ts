import { describe, expect, it } from 'vitest';
import { AcademicYear } from '@nemis-desktop/domain';
import { createTestApplication } from '../../testing/create-test-application';
import { AcademicYearViewModel } from './academic-year-view-model';

describe('AcademicYearViewModel', () => {
  it('is empty when no year is configured', async () => {
    const { app } = createTestApplication();
    const vm = new AcademicYearViewModel({ academics: app.academics });
    await vm.loadCurrent();
    expect(vm.store.getState().current.status).toBe('empty');
  });

  it('loads the current academic year view', async () => {
    const { app, ports } = createTestApplication();
    ports.academicYears.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', start: '2025-09-01',
        end: '2026-07-31', isCurrent: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    const vm = new AcademicYearViewModel({ academics: app.academics });
    await vm.loadCurrent();
    const current = vm.store.getState().current;
    expect(current.status).toBe('success');
    if (current.status === 'success') expect(current.data.code).toBe('2025/2026');
  });
});
