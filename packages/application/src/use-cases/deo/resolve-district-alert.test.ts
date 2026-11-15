import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictAlertStore } from '../../testing/deo/in-memory-district-overview';
import { ResolveDistrictAlertUseCase } from './resolve-district-alert';

const NOW = '2026-11-16T12:00:00.000Z';

function build(districtId: string | null, store = new InMemoryDistrictAlertStore()) {
  const useCase = new ResolveDistrictAlertUseCase({
    store,
    currentDistrictId: districtId,
    currentUserId: 'deo-1',
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  });
  return { useCase, store };
}

describe('ResolveDistrictAlertUseCase', () => {
  it('resolves the alert as the signed-in officer, at the current time', async () => {
    const { useCase, store } = build('d-1');
    const { data } = await useCase.execute({ alertId: 'a-1' });
    expect(data).toBe(true);
    expect(store.calls).toEqual([{ districtId: 'd-1', alertId: 'a-1', resolvedBy: 'deo-1', at: NOW }]);
  });

  it('reports false when the store changed nothing', async () => {
    const store = new InMemoryDistrictAlertStore();
    store.result = false;
    const { useCase } = build('d-1', store);
    expect((await useCase.execute({ alertId: 'a-1' })).data).toBe(false);
  });

  it('refuses without touching the store when no district is assigned', async () => {
    const { useCase, store } = build(null);
    expect((await useCase.execute({ alertId: 'a-1' })).data).toBe(false);
    expect(store.calls).toEqual([]);
  });
});
