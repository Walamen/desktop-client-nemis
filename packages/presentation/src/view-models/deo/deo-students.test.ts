import { describe, expect, it } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { createTestApplication } from '../../testing/create-test-application';
import { DeoStudentsViewModel } from './deo-students-view-model';
import { atRiskLabel, attendanceColor, levelChipClass, performanceChipClass } from './deo-students-views';

describe('Students & Enrollment helpers (same rules as portal-web lib/deo-dashboard.ts)', () => {
  it('colours attendance at 90 and 75, grey with no data', () => {
    expect([90, 89, 75, 74].map(attendanceColor)).toEqual([
      'text-green-600',
      'text-orange-600',
      'text-orange-600',
      'text-red-600',
    ]);
    expect(attendanceColor(null)).toBe('text-gray-400');
  });

  it('colours the level chip purple only for Primary', () => {
    expect(levelChipClass('Primary')).toBe('bg-purple-100 text-purple-700');
    expect(levelChipClass('Primary, Junior High')).toBe('bg-indigo-100 text-indigo-700');
  });

  it('colours each performance status, No Data grey', () => {
    expect(performanceChipClass('Good')).toBe('bg-green-100 text-green-700');
    expect(performanceChipClass('Warning')).toBe('bg-amber-100 text-amber-700');
    expect(performanceChipClass('Critical')).toBe('bg-red-100 text-red-700');
    expect(performanceChipClass('No Data')).toBe('bg-gray-100 text-gray-600');
  });

  it('words the at-risk count', () => {
    expect(atRiskLabel(3)).toBe('3 pupils at risk');
    expect(atRiskLabel(1)).toBe('1 pupil at risk');
    expect(atRiskLabel(0)).toBe('No pupil below 80%');
  });
});

describe('DeoStudentsViewModel', () => {
  it('loads the enrollment of the signed-in officer', async () => {
    const { app } = createTestApplication();
    const vm = new DeoStudentsViewModel({ deo: app.deo });
    const loading = vm.load();
    expect(vm.store.getState().enrollment.status).toBe('loading');
    await loading;
    expect(vm.store.getState().enrollment.status).toBe('success');
  });

  it('moves to error when the service fails', async () => {
    const failing = {
      listStudents: async () => {
        throw new Error('database locked');
      },
    } as unknown as DeoApplicationService;
    const vm = new DeoStudentsViewModel({ deo: failing });
    await vm.load();
    expect(vm.store.getState().enrollment.status).toBe('error');
  });
});
