import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { GetDeoInfrastructureUseCase } from './get-deo-infrastructure';

function build(districtId: string | null) {
  const rm = new InMemoryDistrictOverviewReadModel();
  rm.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  rm.county = { id: 'c-1', name: 'Grand Bassa' };
  rm.infrastructureRows = [
    { id: 'a', title: 'Roof', description: 'Leaks', severity: 'HIGH', institutionId: 's-1', schoolName: 'Alpha', metadata: { status: 'UNDER_REVIEW' }, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'b', title: 'Well', description: 'Dry', severity: 'CRITICAL', institutionId: null, schoolName: null, metadata: { category: 'Water' }, createdAt: '2026-11-02T00:00:00.000Z' },
  ];
  const useCase = new GetDeoInfrastructureUseCase({ readModel: rm, currentDistrictId: districtId, logger: new RecordingLogger() });
  return { rm, useCase };
}

describe('GetDeoInfrastructureUseCase', () => {
  it('returns an empty result with no district', async () => {
    const { rm, useCase } = build(null);
    const { data } = await useCase.execute({});
    expect(data).toEqual({
      districtId: null, district: null, county: null,
      summary: { totalIssues: 0, critical: 0, open: 0, escalated: 0 },
      issues: [],
    });
    expect(rm.calls).toEqual([]);
  });

  it('maps, sorts and summarises, with header names', async () => {
    const { useCase } = build('d-1');
    const { data } = await useCase.execute({});
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.issues.map((i) => i.id)).toEqual(['b', 'a']);
    expect(data.issues[0]).toMatchObject({ schoolId: null, schoolName: 'Buchanan', category: 'Water', status: 'OPEN' });
    expect(data.issues[1]).toMatchObject({ schoolId: 's-1', schoolName: 'Alpha', status: 'UNDER_REVIEW' });
    expect(data.summary).toEqual({ totalIssues: 2, critical: 1, open: 2, escalated: 0 });
  });
});
