import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import type { DistrictTransferRow } from '../../interfaces/deo/district-overview-read-model';
import { GetDeoTransfersUseCase } from './get-deo-transfers';

const NOW = '2026-11-17T12:00:00.000Z';

function row(id: string, overrides: Partial<DistrictTransferRow> = {}): DistrictTransferRow {
  return {
    id,
    studentName: 'Musu Kollie',
    studentNemisId: '100000000001',
    fromSchool: { id: 'a', name: 'Alpha' },
    toSchool: { id: 'b', name: 'Beta' },
    fromInDistrict: true,
    toInDistrict: true,
    status: 'PENDING',
    initiatedBy: 'ORIGIN_SCHOOL',
    lapsesAt: null,
    requestedGrade: 'GRADE_4',
    reason: 'Family moved',
    reviewNotes: null,
    createdAt: '2026-11-10T09:00:00.000Z',
    requestedDate: null,
    reviewedAt: null,
    ...overrides,
  };
}

function run(readModel: InMemoryDistrictOverviewReadModel, districtId: string | null = 'd-1') {
  return new GetDeoTransfersUseCase({
    readModel,
    currentDistrictId: districtId,
    clock: new FixedClock(NOW),
    logger: new RecordingLogger(),
  }).execute({});
}

describe('GetDeoTransfersUseCase', () => {
  it('names the district and labels each direction, in the read model order', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    model.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
    model.county = { id: 'c-1', name: 'Grand Bassa' };
    model.transferRows = [
      row('within'),
      row('out', { toInDistrict: false }),
      row('into', { fromInDistrict: false }),
    ];
    const { data } = await run(model);
    expect(data.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(data.county).toEqual({ id: 'c-1', name: 'Grand Bassa' });
    expect(data.transfers.map((t) => [t.id, t.direction])).toEqual([
      ['within', 'WITHIN'],
      ['out', 'OUT_OF'],
      ['into', 'INTO'],
    ]);
  });

  it('keeps a lapsed pull PENDING and awaits the asker; otherwise the side that did not ask', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    model.transferRows = [
      row('lapsed', { initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: '2026-11-17T11:59:59.000Z' }),
      row('pull', { initiatedBy: 'RECEIVING_SCHOOL', lapsesAt: '2026-11-17T12:00:00.000Z' }), // not before now
      row('push'),
      row('done', { status: 'APPROVED', reviewNotes: 'Welcome', reviewedAt: '2026-11-12T00:00:00.000Z' }),
      row('stopped', { status: 'CANCELLED' }),
    ];
    const { data } = await run(model);
    expect(data.transfers.map((t) => [t.id, t.status, t.lapsed, t.awaitingSchool?.id ?? null])).toEqual([
      ['lapsed', 'PENDING', true, 'b'],
      ['pull', 'PENDING', false, 'a'],
      ['push', 'PENDING', false, 'b'],
      ['done', 'APPROVED', false, null],
      ['stopped', 'CANCELLED', false, null],
    ]);
    expect(data.summary).toEqual({ pending: 2, lapsed: 1 });
  });

  it('returns the page fields without the read model internals', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    model.transferRows = [row('t-1')];
    const { data } = await run(model);
    expect(data.transfers[0]).toEqual({
      id: 't-1',
      studentName: 'Musu Kollie',
      studentNemisId: '100000000001',
      fromSchool: { id: 'a', name: 'Alpha' },
      toSchool: { id: 'b', name: 'Beta' },
      direction: 'WITHIN',
      status: 'PENDING',
      lapsed: false,
      initiatedBy: 'ORIGIN_SCHOOL',
      awaitingSchool: { id: 'b', name: 'Beta' },
      requestedGrade: 'GRADE_4',
      reason: 'Family moved',
      reviewNotes: null,
      createdAt: '2026-11-10T09:00:00.000Z',
      requestedDate: null,
      reviewedAt: null,
    });
  });

  it('reads nothing when no district is assigned', async () => {
    const model = new InMemoryDistrictOverviewReadModel();
    const { data } = await run(model, null);
    expect(data).toEqual({
      districtId: null,
      district: null,
      county: null,
      transfers: [],
      summary: { pending: 0, lapsed: 0 },
    });
    expect(model.calls).toEqual([]);
  });
});
