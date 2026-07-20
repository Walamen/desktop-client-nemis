import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableNames } from '../../../../database/schema/tableNames';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteInstitutionRepository } from './SqliteInstitutionRepository';

function seedInstitution(raw: TestContext['context']['connection'], id: string): void {
  raw
    .prepare(
      `INSERT INTO ${TableNames.institutions}
       (id, code, name, type, ownership, countyId, approvalStatus, communityTown, version, updatedAt)
       VALUES (?, 'LIB-001', 'Monrovia Central', 'SCHOOL', 'GOVERNMENT', 'county-1', 'APPROVED', 'Sinkor', 1, '2026-07-20T00:00:00.000Z')`,
    )
    .run(id);
}

describe('SqliteInstitutionRepository', () => {
  let test: TestContext;
  let repo: SqliteInstitutionRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteInstitutionRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findFirst returns null on an empty table', () => {
    expect(repo.findFirst()).toBeNull();
  });

  it('findById and findFirst return a reconstituted institution', () => {
    seedInstitution(test.context.connection, 'inst-1');
    expect(repo.findById('inst-1')?.name).toBe('Monrovia Central');
    expect(repo.findFirst()?.code.value).toBe('LIB-001');
    expect(repo.findFirst()?.address.communityTown).toBe('Sinkor');
  });
});
