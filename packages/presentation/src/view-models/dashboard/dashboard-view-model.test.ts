import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { DashboardViewModel } from './dashboard-view-model';

async function seedStudents(count: number) {
  const { app, ports } = createTestApplication();
  for (let i = 0; i < count; i += 1) {
    await app.students.create({
      institutionId: 'inst-1',
      firstName: `Student${i}`,
      lastName: 'Test',
      admissionNumber: `ADM-${i}`,
      dateOfBirth: '2015-01-01',
      gender: Gender.MALE,
    });
  }
  return { app, ports };
}

describe('DashboardViewModel', () => {
  it('loads the real total-students count from listStudents', async () => {
    const { app } = await seedStudents(3);
    const vm = new DashboardViewModel({ students: app.students, notifications: new NotificationStore() });
    await vm.loadSummary();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') {
      expect(summary.data.totalStudents).toBe(3);
      const total = summary.data.stats.find((s) => s.key === 'total-students');
      expect(total).toEqual({ key: 'total-students', label: 'Total Students', value: 3, placeholder: false });
      expect(summary.data.stats.filter((s) => s.placeholder).length).toBeGreaterThan(0);
    }
  });

  it('reports success with zero when no students exist', async () => {
    const { app } = await seedStudents(0);
    const vm = new DashboardViewModel({ students: app.students, notifications: new NotificationStore() });
    await vm.loadSummary();
    const summary = vm.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') expect(summary.data.totalStudents).toBe(0);
  });
});
