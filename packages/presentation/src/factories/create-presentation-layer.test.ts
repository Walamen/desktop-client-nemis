import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createTestApplication } from '../testing/create-test-application';
import { createPresentationLayer } from './create-presentation-layer';

describe('createPresentationLayer', () => {
  it('wires every store and ViewModel around one shared notification store', async () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app);

    expect(presentation.stores.navigation.store.getState().current.screen).toBe('dashboard');
    expect(presentation.viewModels.sync.statusPresentation().label).toBe('Not synced yet');

    const outcome = await presentation.viewModels.students.createStudent({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    expect(outcome.ok).toBe(true);
    // the command's notification landed in the SHARED store
    const kinds = presentation.stores.notifications.store
      .getState()
      .notifications.map((n) => n.kind);
    expect(kinds).toContain('success');
  });

  it('honours notification auto-dismiss overrides', () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app, {
      autoDismissOverrides: { success: 999 },
    });
    presentation.stores.notifications.success('hi');
    expect(presentation.stores.notifications.store.getState().notifications[0]?.autoDismissMs).toBe(
      999,
    );
  });
});
