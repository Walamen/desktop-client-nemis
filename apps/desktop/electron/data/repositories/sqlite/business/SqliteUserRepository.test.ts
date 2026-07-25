import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteUserRepository } from './SqliteUserRepository';

describe('SqliteUserRepository', () => {
  let test: TestContext;
  let repo: SqliteUserRepository;

  beforeEach(() => {
    test = createTestContext();
    repo = new SqliteUserRepository(test.context);
  });
  afterEach(() => test.cleanup());

  it('findFirst returns null before provisioning', () => {
    expect(repo.findFirst()).toBeNull();
  });

  it('findFirst returns a provisioned user with its role', () => {
    test.context.connection
      .prepare(
        `INSERT INTO users
          (id, firstName, middleName, lastName, email, isActive, version, updatedAt)
         VALUES ('user-1', 'Martha', NULL, 'Doe', 'martha@school.edu.lr', 1, 1, ?);
         `,
      )
      .run(new Date().toISOString());
    test.context.connection
      .prepare(
        `INSERT INTO user_organizations
          (id, userId, role, institutionId, countyId, districtId, isActive)
         VALUES ('organization-1', 'user-1', ?, NULL, NULL, NULL, 1)`,
      )
      .run(SystemRole.INSTITUTION_ADMIN);
    const user = repo.findFirst();
    expect(user?.name.full).toBe('Martha Doe');
    expect(user?.email.value).toBe('martha@school.edu.lr');
    expect(user?.hasRole(SystemRole.INSTITUTION_ADMIN)).toBe(true);
  });
});
