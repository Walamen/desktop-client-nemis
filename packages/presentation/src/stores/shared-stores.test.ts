import { describe, expect, it } from 'vitest';
import {
  selectConnectivityPresentation,
  selectIsOffline,
  selectSyncPresentation,
} from '../selectors/connectivity-selectors';
import { selectCurrentUserId, selectSelectedStudentId } from '../selectors/session-selectors';
import { ConnectivityStore } from './connectivity-store';
import { DialogStore } from './dialog-store';
import { NavigationStore } from './navigation-store';
import { NotificationStore } from './notification-store';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  it('tracks selection state', () => {
    const session = new SessionStore();
    session.setCurrentUser('usr-1');
    session.selectStudent('stu-1');
    session.setActiveAcademicYear('ay-1', 'term-2');
    session.setCurrentDevice('dev-1');
    const state = session.store.getState();
    expect(selectCurrentUserId(state)).toBe('usr-1');
    expect(selectSelectedStudentId(state)).toBe('stu-1');
    expect(state.activeAcademicYearId).toBe('ay-1');
    expect(state.activeTermId).toBe('term-2');
    expect(state.currentDeviceId).toBe('dev-1');
    session.selectStudent(null);
    expect(session.store.getState().selectedStudentId).toBeNull();
  });
});

describe('ConnectivityStore', () => {
  it('notifies on connectivity transitions and tracks sync', () => {
    const notifications = new NotificationStore();
    const connectivity = new ConnectivityStore(notifications);
    connectivity.setOnline(false);
    connectivity.setOnline(false); // no duplicate notification
    connectivity.setOnline(true);
    const kinds = notifications.store.getState().notifications.map((n) => n.kind);
    expect(kinds).toEqual(['warning', 'info']);

    expect(selectIsOffline(connectivity.store.getState())).toBe(false);
    connectivity.setSyncStatus('syncing');
    expect(selectSyncPresentation(connectivity.store.getState()).label).toBe('Syncing…');
    connectivity.markSyncCompleted('2026-07-19T12:00:00.000Z');
    const state = connectivity.store.getState();
    expect(state.syncStatus).toBe('idle');
    expect(selectSyncPresentation(state).label).toBe('Last synced 19 Jul 2026, 12:00');
    expect(selectConnectivityPresentation(state).label).toBe('Online');
  });
});

describe('DialogStore', () => {
  it('opens custom dialogs and resolves confirms', async () => {
    const dialogs = new DialogStore();
    dialogs.open('link-guardian', { studentId: 'stu-1' });
    expect(dialogs.store.getState().current).toEqual({
      kind: 'custom',
      name: 'link-guardian',
      payload: { studentId: 'stu-1' },
    });
    dialogs.close();
    expect(dialogs.store.getState().current).toBeNull();

    const answer = dialogs.confirm({ message: 'Deactivate this student?' });
    const current = dialogs.store.getState().current;
    expect(current?.kind).toBe('confirm');
    if (current?.kind === 'confirm') expect(current.payload.confirmLabel).toBe('Confirm');
    dialogs.resolveConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(dialogs.store.getState().current).toBeNull();
  });

  it('close resolves a pending confirm as false', async () => {
    const dialogs = new DialogStore();
    const answer = dialogs.confirm({ message: 'Sure?' });
    dialogs.close();
    await expect(answer).resolves.toBe(false);
  });

  it('open() cancels a pending confirm by resolving it false', async () => {
    const dialogs = new DialogStore();
    const answer = dialogs.confirm({ message: 'Sure?' });
    dialogs.open('link-guardian', { studentId: 'stu-1' });
    await expect(answer).resolves.toBe(false);
    expect(dialogs.store.getState().current).toEqual({
      kind: 'custom',
      name: 'link-guardian',
      payload: { studentId: 'stu-1' },
    });
  });
});

describe('NavigationStore', () => {
  it('starts on dashboard, navigates, and goes back', () => {
    const nav = new NavigationStore();
    expect(nav.store.getState().current).toEqual({ screen: 'dashboard', params: {} });
    nav.navigate('students');
    nav.navigate('class-roster', { classId: 'cls-1' });
    expect(nav.store.getState().current.params['classId']).toBe('cls-1');
    nav.back();
    expect(nav.store.getState().current.screen).toBe('students');
    nav.back();
    nav.back(); // extra back is a no-op
    expect(nav.store.getState().current.screen).toBe('dashboard');
  });
});
