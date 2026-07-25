import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../data/testing/createTestContext';
import { removeLegacyLocalUser } from './008-remove-legacy-local-user';

describe('removeLegacyLocalUser', () => {
  let test: TestContext | undefined;

  afterEach(() => test?.cleanup());

  it('removes only the old placeholder identity', () => {
    test = createTestContext();
    const db = test.context.connection;
    db.prepare(
      `INSERT INTO users
        (id, firstName, lastName, email, isActive, version, updatedAt)
       VALUES (?, ?, ?, ?, 1, 1, ?)`,
    ).run('legacy-user', 'Local', 'Admin', 'admin@local.nemis', new Date().toISOString());
    db.prepare(
      `INSERT INTO users
        (id, firstName, lastName, email, isActive, version, updatedAt)
       VALUES (?, ?, ?, ?, 1, 1, ?)`,
    ).run('real-user', 'Martha', 'Doe', 'martha@school.edu.lr', new Date().toISOString());
    db.prepare(
      `INSERT INTO user_organizations
        (id, userId, role, isActive)
       VALUES (?, ?, 'INSTITUTION_ADMIN', 1)`,
    ).run('legacy-organization', 'legacy-user');

    removeLegacyLocalUser.up(db);

    expect(db.prepare('SELECT email FROM users ORDER BY email').all()).toEqual([
      { email: 'martha@school.edu.lr' },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_organizations').get()).toEqual({
      count: 0,
    });
  });
});
