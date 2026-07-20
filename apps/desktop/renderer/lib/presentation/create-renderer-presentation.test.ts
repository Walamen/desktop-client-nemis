import { describe, expect, it } from 'vitest';
import { createRendererPresentation } from './create-renderer-presentation';
import { DEMO_USER_ID } from './seed-demo-data';

describe('createRendererPresentation', () => {
  it('builds a seeded presentation layer with a real student total', async () => {
    const layer = await createRendererPresentation();
    await layer.viewModels.dashboard.loadSummary();
    const summary = layer.viewModels.dashboard.store.getState().summary;
    expect(summary.status).toBe('success');
    if (summary.status === 'success') expect(summary.data.totalStudents).toBe(5);
  });

  it('seeds the current user', async () => {
    const layer = await createRendererPresentation();
    await layer.viewModels.currentUser.loadUser(DEMO_USER_ID);
    const user = layer.viewModels.currentUser.store.getState().user;
    expect(user.status).toBe('success');
    if (user.status === 'success') expect(user.data.fullName).toBe('Joseph Boakai');
  });
});
