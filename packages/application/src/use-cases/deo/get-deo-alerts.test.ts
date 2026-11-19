import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import {
  InMemoryDistrictOverviewReadModel,
} from '../../testing/deo/in-memory-district-overview';
import type { DistrictAlertListRow } from '../../interfaces/deo/district-overview-read-model';
import { GetDeoAlertsUseCase } from './get-deo-alerts';

function row(n: number): DistrictAlertListRow {
  return {
    id: `a-${n}`,
    type: 'LOW_ATTENDANCE',
    severity: 'warning',
    title: `Alert ${n}`,
    description: 'desc',
    institutionId: 's-1',
    schoolName: 'Alpha',
    isResolved: false,
    resolvedAt: null,
    createdAt: '2026-11-16T12:00:00.000Z',
  };
}

function readModel(count: number) {
  const rm = new InMemoryDistrictOverviewReadModel();
  rm.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  rm.county = { id: 'c-1', name: 'Grand Bassa' };
  rm.districtAlerts = Array.from({ length: count }, (_, i) => row(i + 1));
  return rm;
}

function run(
  rm: InMemoryDistrictOverviewReadModel,
  query: { filter: 'open' | 'resolved' | 'all'; page: number },
  districtId: string | null = 'd-1',
) {
  return new GetDeoAlertsUseCase({
    readModel: rm,
    currentDistrictId: districtId,
    logger: new RecordingLogger(),
  }).execute(query);
}

describe('GetDeoAlertsUseCase', () => {
  it('no district', async () => {
    const rm = readModel(3);
    const { data } = await run(rm, { filter: 'open', page: 1 }, null);
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      alerts: [],
      meta: { page: 1, limit: 15, total: 0, totalPages: 0 },
    });
    expect(rm.calls).toEqual([]);
  });

  it('pages 15 at a time', async () => {
    const { data } = await run(readModel(16), { filter: 'open', page: 2 });
    expect(data.alerts.map((a) => a.id)).toEqual(['a-16']);
    expect(data.meta).toEqual({ page: 2, limit: 15, total: 16, totalPages: 2 });
  });

  it('a page past the end returns the last page', async () => {
    const { data } = await run(readModel(16), { filter: 'open', page: 5 });
    expect(data.meta.page).toBe(2);
    expect(data.alerts).toHaveLength(1);
  });

  it('passes the filter and the session district', async () => {
    const rm = readModel(1);
    await run(rm, { filter: 'resolved', page: 1 });
    expect(rm.argsOf('listDistrictAlerts')).toEqual(['d-1', 'resolved']);
  });

  it('header names', async () => {
    const { data } = await run(readModel(1), { filter: 'all', page: 1 });
    expect(data.districtId).toBe('d-1');
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
  });
});
