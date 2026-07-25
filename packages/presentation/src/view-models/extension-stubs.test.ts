import { describe, expect, it } from 'vitest';
import { NotImplementedPresentationError } from '../errors';
import { ConnectivityStore } from '../stores/connectivity-store';
import { SyncViewModel } from './sync/sync-view-model';
import { TeachersViewModel } from './teachers/teachers-view-model';
import { NotificationStore } from '../stores/notification-store';
import { createTestApplication } from '../testing/create-test-application';

describe('extension-point view models', () => {
  it('teachers exposes typed idle state and loads the empty directory', async () => {
    const { app } = createTestApplication();
    const teachers = new TeachersViewModel({ teachers: app.teachers, notifications: new NotificationStore() });
    expect(teachers.store.getState().list.status).toBe('idle');
    await teachers.loadTeachers();
    expect(teachers.store.getState().list.status).toBe('empty');
  });

  it('sync reflects live connectivity state but has stub actions', async () => {
    const connectivity = new ConnectivityStore();
    const sync = new SyncViewModel(connectivity);
    expect(sync.statusPresentation().label).toBe('Not synced yet');
    connectivity.setSyncStatus('syncing');
    expect(sync.store.getState().syncStatus).toBe('syncing');
    expect(sync.statusPresentation().label).toBe('Syncing…');
    await expect(sync.startSync()).rejects.toBeInstanceOf(NotImplementedPresentationError);
  });
});
