import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { NotificationStore } from '../../stores/notification-store';
import { createTestApplication } from '../../testing/create-test-application';
import { StudentStatisticsViewModel } from './student-statistics-view-model';

describe('StudentStatisticsViewModel', () => {
  it('loads real active-student counts from the reporting service', async () => {
    const { app } = createTestApplication();
    await app.students.create({
      institutionId: 'inst-1', firstName: 'A', lastName: 'B',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.MALE,
    });
    await app.students.create({
      institutionId: 'inst-1', firstName: 'C', lastName: 'D',
      admissionNumber: 'ADM-2', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    const vm = new StudentStatisticsViewModel({
      reporting: app.reporting,
      notifications: new NotificationStore(),
    });
    await vm.loadStatistics();
    const stats = vm.store.getState().stats;
    expect(stats.status).toBe('success');
    if (stats.status === 'success') {
      expect(stats.data).toEqual({
        totalStudents: 2,
        maleStudents: 1,
        femaleStudents: 1,
        recentEnrollments: 2,
      });
    }
  });

  it('renders real zeros (success, not empty) on a fresh install', async () => {
    const { app } = createTestApplication();
    const vm = new StudentStatisticsViewModel({
      reporting: app.reporting,
      notifications: new NotificationStore(),
    });
    await vm.loadStatistics();
    const stats = vm.store.getState().stats;
    expect(stats.status).toBe('success');
    if (stats.status === 'success') {
      expect(stats.data).toEqual({
        totalStudents: 0,
        maleStudents: 0,
        femaleStudents: 0,
        recentEnrollments: 0,
      });
    }
  });
});
