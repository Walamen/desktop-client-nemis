import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemRole } from '@nemis-desktop/types';
import { initializeLocalUser } from '../../../../database/seed/initializeLocalUser';
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

  it('findFirst returns null before the seed', () => {
    expect(repo.findFirst()).toBeNull();
  });

  it('findFirst returns the seeded local user with its role', () => {
    initializeLocalUser(test.context.connection);
    const user = repo.findFirst();
    expect(user?.name.full).toBe('Local Admin');
    expect(user?.email.value).toBe('admin@local.nemis');
    expect(user?.hasRole(SystemRole.INSTITUTION_ADMIN)).toBe(true);
  });
});
