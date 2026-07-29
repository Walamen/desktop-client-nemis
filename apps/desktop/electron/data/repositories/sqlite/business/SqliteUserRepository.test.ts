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

  it('findById returns null when the user is not provisioned', () => {
    expect(repo.findById('user-1')).toBeNull();
  });

  it('findById returns the matching provisioned user with its role', () => {
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
    const user = repo.findById('user-1');
    expect(user?.name.full).toBe('Martha Doe');
    expect(user?.email.value).toBe('martha@school.edu.lr');
    expect(user?.hasRole(SystemRole.INSTITUTION_ADMIN)).toBe(true);
  });

  it('findById does not return a different user\'s row', () => {
    test.context.connection
      .prepare(
        `INSERT INTO users
          (id, firstName, middleName, lastName, email, isActive, version, updatedAt)
         VALUES ('user-1', 'Martha', NULL, 'Doe', 'martha@school.edu.lr', 1, 1, ?);
         `,
      )
      .run(new Date().toISOString());
    expect(repo.findById('someone-else')).toBeNull();
  });
});
