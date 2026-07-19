import { describe, expect, it } from 'vitest';
import { NotImplementedPresentationError } from '../errors';
import { ConnectivityStore } from '../stores/connectivity-store';
import { DashboardViewModel } from './dashboard/dashboard-view-model';
import { SyncViewModel } from './sync/sync-view-model';
import { TeachersViewModel } from './teachers/teachers-view-model';

describe('extension-point view models', () => {
  it('dashboard and teachers expose typed idle state and throw NotImplemented', () => {
    const dashboard = new DashboardViewModel();
    expect(dashboard.store.getState().summary.status).toBe('idle');
    expect(() => dashboard.loadSummary()).toThrow(NotImplementedPresentationError);

    const teachers = new TeachersViewModel();
    expect(teachers.store.getState().list.status).toBe('idle');
    expect(() => teachers.loadTeachers()).toThrow(NotImplementedPresentationError);
  });

  it('sync reflects live connectivity state but has stub actions', () => {
    const connectivity = new ConnectivityStore();
    const sync = new SyncViewModel(connectivity);
    expect(sync.statusPresentation().label).toBe('Not synced yet');
    connectivity.setSyncStatus('syncing');
    expect(sync.store.getState().syncStatus).toBe('syncing');
    expect(sync.statusPresentation().label).toBe('Syncing…');
    expect(() => sync.startSync()).toThrow(NotImplementedPresentationError);
  });
});
