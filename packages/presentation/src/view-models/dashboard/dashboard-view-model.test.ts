import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DashboardViewModel } from './dashboard-view-model';

async function seedStudents(count: number) {
  const { app, ports } = createTestApplication();
  for (let i = 0; i < count; i += 1) {
    await app.students.create({
      institutionId: 'inst-1', firstName: `Student${i}`, lastName: 'Test',
      admissionNumber: `ADM-${i}`, dateOfBirth: '2015-01-01', gender: Gender.MALE,
    });
  }
  return { app, ports };
}

describe('DashboardViewModel', () => {
  it('loads the real overview from the reporting service', async () => {
    const { app } = await seedStudents(3);
    const vm = new DashboardViewModel({ reporting: app.reporting, notifications: new NotificationStore() });
    await vm.loadOverview();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      const students = summary.data.stats.find((s) => s.key === 'total-students');
      expect(students).toEqual({ key: 'total-students', label: 'Total Students', value: 3 });
      expect(summary.data.attendanceToday).toEqual({ present: 0, total: 0 });
    }
  });

  it('renders real zeros (success, not empty) on a fresh install', async () => {
    const { app } = await seedStudents(0);
    const vm = new DashboardViewModel({ reporting: app.reporting, notifications: new NotificationStore() });
    await vm.loadOverview();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.data.stats.find((s) => s.key === 'total-students')?.value).toBe(0);
      expect(summary.data.stats.find((s) => s.key === 'total-classes')?.value).toBe(0);
    }
  });
});
