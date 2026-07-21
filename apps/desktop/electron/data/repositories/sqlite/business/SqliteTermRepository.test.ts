import { Term } from '@nemis-desktop/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteTermRepository } from './SqliteTermRepository';

const ISO = '2026-07-21T00:00:00.000Z';

function seedYear(test: TestContext, id: string, isCurrent: 0 | 1): void {
  test.context.connection
    .prepare(
      `INSERT INTO ${TableNames.academicYears}
       (id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt)
       VALUES (?, 'inst-1', ?, '2025-09-01', '2026-07-31', ?, 1, ?)`,
    )
    .run(id, `${id}-code`, isCurrent, ISO);
}

describe('SqliteTermRepository', () => {
  let test: TestContext;
  let repo: SqliteTermRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteTermRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findById returns null when missing', () => {
    expect(repo.findById('missing')).toBeNull();
  });

  it('save() inserts then upserts on conflict', () => {
    const term = Term.create({
      id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
      start: '2025-09-01', end: '2025-12-19', occurredAt: ISO,
    });
    repo.save(term);
    expect(repo.findById('t-1')?.name).toBe('Term 1');

    term.rename('Term One', 'admin', ISO);
    repo.save(term);
    expect(repo.findById('t-1')?.name).toBe('Term One');
  });

  it('findByYear orders by startDate ASC', () => {
    repo.save(
      Term.create({
        id: 't-2', academicYearId: 'ay-1', name: 'Term 2',
        start: '2026-01-05', end: '2026-04-01', occurredAt: ISO,
      }),
    );
    repo.save(
      Term.create({
        id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', occurredAt: ISO,
      }),
    );
    const terms = repo.findByYear('ay-1');
    expect(terms.map((t) => t.id)).toEqual(['t-1', 't-2']);
  });

  it('findCurrent requires both the term and its year to be current', () => {
    seedYear(test, 'ay-1', 0);
    seedYear(test, 'ay-2', 1);
    repo.save(
      Term.create({
        id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', isCurrent: true, occurredAt: ISO,
      }),
    );
    expect(repo.findCurrent()).toBeNull();

    repo.save(
      Term.create({
        id: 't-2', academicYearId: 'ay-2', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', isCurrent: true, occurredAt: ISO,
      }),
    );
    expect(repo.findCurrent()?.id).toBe('t-2');
  });

  it('existsByName scopes to year and excludes the given id', () => {
    repo.save(
      Term.create({
        id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', occurredAt: ISO,
      }),
    );
    expect(repo.existsByName('ay-1', 'Term 1')).toBe(true);
    expect(repo.existsByName('ay-1', 'Term 1', 't-1')).toBe(false);
    expect(repo.existsByName('ay-2', 'Term 1')).toBe(false);
  });

  it('findCurrentOthers excludes the given id', () => {
    repo.save(
      Term.create({
        id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', isCurrent: true, occurredAt: ISO,
      }),
    );
    const others = repo.findCurrentOthers('ay-1', 't-1');
    expect(others).toHaveLength(0);

    repo.save(
      Term.create({
        id: 't-2', academicYearId: 'ay-1', name: 'Term 2',
        start: '2026-01-05', end: '2026-04-01', isCurrent: true, occurredAt: ISO,
      }),
    );
    expect(repo.findCurrentOthers('ay-1', 't-2').map((t) => t.id)).toEqual(['t-1']);
  });

  it('delete() removes the row', () => {
    repo.save(
      Term.create({
        id: 't-1', academicYearId: 'ay-1', name: 'Term 1',
        start: '2025-09-01', end: '2025-12-19', occurredAt: ISO,
      }),
    );
    repo.delete('t-1');
    expect(repo.findById('t-1')).toBeNull();
  });
});
