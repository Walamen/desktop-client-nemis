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
    expect(presentation.viewModels.studentsList.store).toBe(
      presentation.viewModels.students.store,
    );
    expect(presentation.viewModels.studentProfile.store).toBe(
      presentation.viewModels.students.store,
    );
    expect(presentation.viewModels.enrollment.store).toBe(
      presentation.viewModels.students.store,
    );
    expect(presentation.viewModels.studentSearch.store).toBe(
      presentation.viewModels.students.store,
    );

    const outcome = await presentation.viewModels.students.createStudent({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw outcome.error;
    // the command's notification landed in the SHARED store
    const kinds = presentation.stores.notifications.store
      .getState()
      .notifications.map((n) => n.kind);
    expect(kinds).toContain('success');

    presentation.viewModels.studentsList.toggleSelection(outcome.data.id);
    expect(presentation.viewModels.studentsList.getBulkSelection()).toEqual([
      outcome.data.id,
    ]);
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

  it('exposes the bootstrap service and academic-year ViewModel and reaches ready', async () => {
    const { app } = createTestApplication();
    const presentation = createPresentationLayer(app);
    expect(presentation.viewModels.academicYear).toBeDefined();
    expect(presentation.bootstrap).toBeDefined();
    await presentation.bootstrap.run();
    expect(presentation.stores.bootstrap.store.getState().phase).toBe('ready');
  });
});
