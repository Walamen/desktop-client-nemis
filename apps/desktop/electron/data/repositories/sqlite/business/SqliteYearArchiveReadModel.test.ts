import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteYearArchiveReadModel } from './SqliteYearArchiveReadModel';

describe('SqliteYearArchiveReadModel', () => {
  let test: TestContext;
  let model: SqliteYearArchiveReadModel;
  const NOW = '2026-07-01T00:00:00.000Z';

  const school = (id: string, name: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,?)`,
      )
      .run(id, id, name, 'PRIMARY', 'PUBLIC', 'c-1', 'APPROVED', NOW);
  const year = (id: string, institutionId: string, code: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,?,?,0,'CLOSED',1,?)`,
      )
      .run(id, institutionId, code, '2025-09-01', '2026-07-31', NOW);
  const archive = (id: string, yearId: string, institutionId: string, version: number, over: Record<string, unknown> = {}) =>
    test.context.connection
      .prepare(
        `INSERT INTO academic_year_archives (id,academicYearId,institutionId,version,closedBy,closedAt,summary,reopenedBy,reopenedAt,reopenReason,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id, yearId, institutionId, version, 'u-1',
        (over.closedAt as string) ?? '2026-07-10T00:00:00.000Z',
        (over.summary as string) ??
          JSON.stringify({ present: 30, withdrawn: 1, promoted: 20, retained: 5, graduated: 4, byGrade: {} }),
        null, (over.reopenedAt as string | null) ?? null, null, NOW, NOW,
      );

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    model = new SqliteYearArchiveReadModel(test.context);
  });
  afterEach(() => test.cleanup());

  it('lists each school-year once, using the latest version, with summary counts', () => {
    school('s-1', 'Monrovia Central High');
    year('y-1', 's-1', '2025/2026');
    archive('a-1', 'y-1', 's-1', 1, { summary: JSON.stringify({ promoted: 1, retained: 1, graduated: 1 }) });
    archive('a-2', 'y-1', 's-1', 2);
    expect(model.list()).toEqual([
      {
        academicYearId: 'y-1',
        yearCode: '2025/2026',
        institutionId: 's-1',
        schoolName: 'Monrovia Central High',
        status: 'CLOSED',
        closedAt: '2026-07-10T00:00:00.000Z',
        promoted: 20,
        retained: 5,
        graduated: 4,
      },
    ]);
  });

  it('reports a reopened year and orders newest close first', () => {
    school('s-1', 'Alpha School');
    school('s-2', 'Beta School');
    year('y-1', 's-1', '2025/2026');
    year('y-2', 's-2', '2025/2026');
    archive('a-1', 'y-1', 's-1', 1, { closedAt: '2026-07-01T00:00:00.000Z', reopenedAt: '2026-08-01T00:00:00.000Z' });
    archive('a-2', 'y-2', 's-2', 1, { closedAt: '2026-07-20T00:00:00.000Z' });
    const rows = model.list();
    expect(rows.map((r) => [r.schoolName, r.status])).toEqual([
      ['Beta School', 'CLOSED'],
      ['Alpha School', 'REOPENED'],
    ]);
  });

  it('tolerates a missing or malformed summary', () => {
    school('s-1', 'Alpha School');
    year('y-1', 's-1', '2025/2026');
    archive('a-1', 'y-1', 's-1', 1, { summary: 'not json' });
    expect(model.list()[0]).toMatchObject({ promoted: 0, retained: 0, graduated: 0 });
  });

  it('is empty when no school has closed a year', () => {
    expect(model.list()).toEqual([]);
  });
});
