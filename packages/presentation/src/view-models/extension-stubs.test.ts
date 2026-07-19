import { describe, expect, it } from 'vitest';
import { NotImplementedPresentationError } from '../errors';
import { ConnectivityStore } from '../stores/connectivity-store';
import { SyncViewModel } from './sync/sync-view-model';
import { TeachersViewModel } from './teachers/teachers-view-model';

describe('extension-point view models', () => {
  it('teachers exposes typed idle state and throws NotImplemented', async () => {
    const teachers = new TeachersViewModel();
    expect(teachers.store.getState().list.status).toBe('idle');
    await expect(teachers.loadTeachers()).rejects.toBeInstanceOf(NotImplementedPresentationError);
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
