import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteAcademicContextReadModel } from './SqliteAcademicContextReadModel';

describe('SqliteAcademicContextReadModel', () => {
  let test: TestContext;
  let model: SqliteAcademicContextReadModel;
  const NOW = '2026-07-01T00:00:00.000Z';

  const year = (id: string, institutionId: string, code: string, isCurrent: number, status: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,?)`,
      )
      .run(id, institutionId, code, '2026-09-01', '2027-07-31', isCurrent, status, NOW);
  const term = (id: string, yearId: string, name: string, isCurrent: number) =>
    test.context.connection
      .prepare(
        `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt)
         VALUES (?,?,?,?,?,?,1,?)`,
      )
      .run(id, yearId, name, '2026-09-01', '2027-01-31', isCurrent, NOW);
  const period = (id: string, yearId: string, termId: string, name: string, sequence: number, start: string, end: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,weight,startDate,endDate,isActive,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,100,50,NULL,?,?,1,?,?)`,
      )
      .run(id, 'inst-1', yearId, termId, name, `P${sequence}`, 'PERIOD', sequence, start, end, NOW, NOW);

  beforeEach(() => {
    test = createTestContext();
    model = new SqliteAcademicContextReadModel(test.context);
  });
  afterEach(() => test.cleanup());

  function seed() {
    year('y-old', 'inst-1', '2025/2026', 0, 'CLOSED');
    year('y-other', 'inst-2', '2026/2027', 1, 'ACTIVE');
    year('y-1', 'inst-1', '2026/2027', 1, 'ACTIVE');
    term('t-1', 'y-1', 'First Semester', 0);
    term('t-2', 'y-1', 'Second Semester', 1);
    term('t-other', 'y-other', 'Other Term', 1);
    period('p-1', 'y-1', 't-2', 'Period 1', 1, '2027-02-01', '2027-03-15');
    period('p-2', 'y-1', 't-2', 'Period 2', 2, '2027-03-16', '2027-05-01');
    period('p-x', 'y-1', 't-1', 'Wrong Term Period', 1, '2027-03-16', '2027-05-01');
  }

  it('returns the current year, its current term and the period containing today', () => {
    seed();
    expect(model.get('inst-1', '2027-03-20')).toEqual({
      year: { id: 'y-1', code: '2026/2027', status: 'ACTIVE' },
      term: { id: 't-2', name: 'Second Semester' },
      period: { id: 'p-2', name: 'Period 2' },
    });
  });

  it('treats period boundary days as inside the period', () => {
    seed();
    expect(model.get('inst-1', '2027-03-15').period?.id).toBe('p-1');
    expect(model.get('inst-1', '2027-03-16').period?.id).toBe('p-2');
  });

  it('has a null period when today is outside every period', () => {
    seed();
    const result = model.get('inst-1', '2027-06-01');
    expect(result.period).toBeNull();
    expect(result.term?.id).toBe('t-2');
    expect(result.year?.id).toBe('y-1');
  });

  it('has a null term and period when the year has no current term', () => {
    year('y-1', 'inst-1', '2026/2027', 1, 'ACTIVE');
    term('t-1', 'y-1', 'First Semester', 0);
    expect(model.get('inst-1', '2026-10-01')).toEqual({
      year: { id: 'y-1', code: '2026/2027', status: 'ACTIVE' },
      term: null,
      period: null,
    });
  });

  it('has a null year when no year is current', () => {
    year('y-old', 'inst-1', '2025/2026', 0, 'CLOSED');
    year('y-other', 'inst-2', '2026/2027', 1, 'ACTIVE');
    expect(model.get('inst-1', '2026-10-01')).toEqual({ year: null, term: null, period: null });
  });
});
