import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

/** Every migration before 30, with foreign keys ON as the app runs them, plus
 * one user carrying every column and one role row pointing at it. */
function seededBefore30() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  for (const migration of migrations.filter((m) => m.version < 30)) migration.up(db);
  db.prepare(
    `INSERT INTO users (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
     VALUES ('user-1','Martha','J','Doe','martha@school.edu.lr',1,3,'2026-01-01T00:00:00.000Z','admin-1','device-1')`,
  ).run();
  db.prepare(
    `INSERT INTO user_organizations (id, userId, role, institutionId, countyId, districtId, isActive)
     VALUES ('org-1','user-1','INSTITUTION_ADMIN','school-1','county-1',NULL,1)`,
  ).run();
  return db;
}

/** As MigrationService runs it: inside one transaction. */
function apply30(db: Database.Database) {
  const migration = migrations.find((m) => m.version === 30);
  expect(migration).toBeDefined();
  db.transaction(() => migration!.up(db))();
}

describe('030-make-user-email-nullable', () => {
  it('keeps every user column and every role row (no cascade with FKs on)', () => {
    const db = seededBefore30();
    apply30(db);
    expect(db.prepare(`SELECT * FROM users`).all()).toEqual([
      {
        id: 'user-1', firstName: 'Martha', middleName: 'J', lastName: 'Doe',
        email: 'martha@school.edu.lr', isActive: 1, version: 3,
        updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: 'admin-1', deviceId: 'device-1',
      },
    ]);
    expect(db.prepare(`SELECT * FROM user_organizations`).all()).toEqual([
      {
        id: 'org-1', userId: 'user-1', role: 'INSTITUTION_ADMIN',
        institutionId: 'school-1', countyId: 'county-1', districtId: null, isActive: 1,
      },
    ]);
    db.close();
  });

  it('accepts a user with no email', () => {
    const db = seededBefore30();
    apply30(db);
    db.prepare(
      `INSERT INTO users (id, firstName, middleName, lastName, email, isActive, version, updatedAt)
       VALUES ('user-2','Musu',NULL,'Kollie',NULL,1,1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    expect(db.prepare(`SELECT email FROM users WHERE id='user-2'`).get()).toEqual({ email: null });
    db.close();
  });

  it('restores the foreign key, its cascade, and the userId index', () => {
    const db = seededBefore30();
    apply30(db);
    const fks = db.pragma('foreign_key_list(user_organizations)') as Array<{ table: string; from: string; to: string; on_delete: string }>;
    expect(fks).toEqual([expect.objectContaining({ table: 'users', from: 'userId', to: 'id', on_delete: 'CASCADE' })]);
    expect(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_organizations_userId'`).get(),
    ).toEqual({ name: 'idx_user_organizations_userId' });
    expect(() =>
      db.prepare(
        `INSERT INTO user_organizations (id, userId, role, isActive) VALUES ('org-ghost','nobody','TEACHER',1)`,
      ).run(),
    ).toThrow(/FOREIGN KEY/);
    db.prepare(`DELETE FROM users WHERE id='user-1'`).run();
    expect(db.prepare(`SELECT count(*) c FROM user_organizations`).get()).toEqual({ c: 0 });
    db.close();
  });

  it('leaves no temporary tables and a clean foreign-key check', () => {
    const db = seededBefore30();
    apply30(db);
    expect(
      db.prepare(
        `SELECT name FROM sqlite_master WHERE name IN ('users_new','user_organizations_hold')`,
      ).all(),
    ).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  });
});
