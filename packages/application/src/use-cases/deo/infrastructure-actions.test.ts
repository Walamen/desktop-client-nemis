import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictAlertStore, InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import {
  EscalateInfrastructureIssueUseCase,
  ReviewInfrastructureIssueUseCase,
  ResolveInfrastructureIssueUseCase,
} from './infrastructure-actions';

const NOW = '2026-11-20T12:00:00.000Z';
const BY = { id: 'deo-1', name: 'Ama Kollie' };

function deps(districtId: string | null = 'd-1') {
  const store = new InMemoryDistrictAlertStore();
  const readModel = new InMemoryDistrictOverviewReadModel();
  readModel.userProfile = { firstName: 'Ama', lastName: 'Kollie', email: null, phoneNumber: null };
  return {
    store,
    readModel,
    d: { store, readModel, currentDistrictId: districtId, currentUserId: 'deo-1', clock: new FixedClock(NOW), logger: new RecordingLogger() },
  };
}

describe('infrastructure action use cases', () => {
  it('review passes district, officer, trimmed comments and time', async () => {
    const { store, d } = deps();
    expect((await new ReviewInfrastructureIssueUseCase(d).execute({ issueId: 'a-1', comments: '  looking ' })).data).toBe(true);
    expect(store.actions).toEqual([{ action: 'review', districtId: 'd-1', alertId: 'a-1', by: BY, text: 'looking', at: NOW }]);
  });

  it('blank or missing comments become null', async () => {
    const { store, d } = deps();
    await new ReviewInfrastructureIssueUseCase(d).execute({ issueId: 'a-1', comments: '   ' });
    await new ResolveInfrastructureIssueUseCase(d).execute({ issueId: 'a-1' });
    expect(store.actions.map((a) => a.text)).toEqual([null, null]);
  });

  it('resolve passes district and officer', async () => {
    const { store, d } = deps();
    await new ResolveInfrastructureIssueUseCase(d).execute({ issueId: 'a-2', comments: 'fixed' });
    expect(store.actions).toEqual([{ action: 'resolveInfrastructure', districtId: 'd-1', alertId: 'a-2', by: BY, text: 'fixed', at: NOW }]);
  });

  it('escalate passes the trimmed reason', async () => {
    const { store, d } = deps();
    expect((await new EscalateInfrastructureIssueUseCase(d).execute({ issueId: 'a-3', reason: ' unsafe ' })).data).toBe(true);
    expect(store.actions).toEqual([{ action: 'escalate', districtId: 'd-1', alertId: 'a-3', by: BY, text: 'unsafe', at: NOW }]);
  });

  it('escalate with a blank reason is false with no store call', async () => {
    const { store, d } = deps();
    expect((await new EscalateInfrastructureIssueUseCase(d).execute({ issueId: 'a-3', reason: '  ' })).data).toBe(false);
    expect(store.actions).toEqual([]);
  });

  it('names the officer DEO without a profile', async () => {
    const { store, readModel, d } = deps();
    readModel.userProfile = null;
    await new ReviewInfrastructureIssueUseCase(d).execute({ issueId: 'a-1' });
    expect(store.actions[0]?.by).toEqual({ id: 'deo-1', name: 'DEO' });
  });

  it('refuses all three with no district', async () => {
    const { store, d } = deps(null);
    expect((await new ReviewInfrastructureIssueUseCase(d).execute({ issueId: 'a' })).data).toBe(false);
    expect((await new ResolveInfrastructureIssueUseCase(d).execute({ issueId: 'a' })).data).toBe(false);
    expect((await new EscalateInfrastructureIssueUseCase(d).execute({ issueId: 'a', reason: 'x' })).data).toBe(false);
    expect(store.actions).toEqual([]);
  });

  it('reports false when the store changed nothing', async () => {
    const { store, d } = deps();
    store.result = false;
    expect((await new ResolveInfrastructureIssueUseCase(d).execute({ issueId: 'a' })).data).toBe(false);
  });
});
