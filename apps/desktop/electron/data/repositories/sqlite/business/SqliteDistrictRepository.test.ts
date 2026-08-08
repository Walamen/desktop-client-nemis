import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteDistrictRepository } from './SqliteDistrictRepository';

describe('SqliteDistrictRepository', () => {
  let test: TestContext;
  let repo: SqliteDistrictRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteDistrictRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('returns an empty array when no districts have been synced', () => {
    expect(repo.findAll()).toEqual([]);
  });

  it('findAll returns every district', () => {
    test.context.connection
      .prepare(`INSERT INTO districts (id, name, countyId) VALUES (?, ?, ?)`)
      .run('district-1', 'Sinkor District', 'county-1');
    expect(repo.findAll()).toEqual([{ id: 'district-1', name: 'Sinkor District', countyId: 'county-1' }]);
  });
});
