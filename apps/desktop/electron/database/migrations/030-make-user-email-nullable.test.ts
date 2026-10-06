import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

/** Every migration before 30, with foreign keys ON as the app runs them, plus
 * two users carrying every column and three role rows pointing at them. The
 * seed deliberately uses NON-default values (inactive rows, a non-NULL
 * districtId) so a column dropped from migration 030's copy statements falls
 * back to its default and fails the comparison instead of going unnoticed. */
function seededBefore30() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  for (const migration of migrations.filter((m) => m.version < 30)) migration.up(db);
  db.prepare(
    `INSERT INTO users (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
     VALUES ('user-1','Martha','J','Doe','martha@school.edu.lr',0,3,'2026-01-01T00:00:00.000Z','admin-1','device-1')`,
  ).run();
  db.prepare(
    `INSERT INTO users (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
     VALUES ('user-2','Samuel','K','Toe','samuel@school.edu.lr',1,7,'2026-02-03T04:05:06.000Z','admin-2','device-2')`,
  ).run();
  db.prepare(
    `INSERT INTO user_organizations (id, userId, role, institutionId, countyId, districtId, isActive)
     VALUES ('org-1','user-1','INSTITUTION_ADMIN','school-1','county-1','district-1',0)`,
  ).run();
  db.prepare(
    `INSERT INTO user_organizations (id, userId, role, institutionId, countyId, districtId, isActive)
     VALUES ('org-2','user-2','TEACHER','school-1','county-1','district-1',1)`,
  ).run();
  db.prepare(
    `INSERT INTO user_organizations (id, userId, role, institutionId, countyId, districtId, isActive)
     VALUES ('org-3','user-2','DEO',NULL,'county-2','district-2',0)`,
  ).run();
  return db;
}

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };

/** PRAGMA table_info without `cid`, so only the column definition is compared. */
function tableShape(db: Database.Database, table: string): ColumnInfo[] {
  return (db.pragma(`table_info(${table})`) as Array<ColumnInfo & { cid: number }>).map(
    ({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }),
  );
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
    expect(db.prepare(`SELECT * FROM users ORDER BY id`).all()).toEqual([
      {
        id: 'user-1', firstName: 'Martha', middleName: 'J', lastName: 'Doe',
        email: 'martha@school.edu.lr', isActive: 0, version: 3,
        updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: 'admin-1', deviceId: 'device-1',
      },
      {
        id: 'user-2', firstName: 'Samuel', middleName: 'K', lastName: 'Toe',
        email: 'samuel@school.edu.lr', isActive: 1, version: 7,
        updatedAt: '2026-02-03T04:05:06.000Z', lastModifiedBy: 'admin-2', deviceId: 'device-2',
      },
    ]);
    expect(db.prepare(`SELECT * FROM user_organizations ORDER BY id`).all()).toEqual([
      {
        id: 'org-1', userId: 'user-1', role: 'INSTITUTION_ADMIN',
        institutionId: 'school-1', countyId: 'county-1', districtId: 'district-1', isActive: 0,
      },
      {
        id: 'org-2', userId: 'user-2', role: 'TEACHER',
        institutionId: 'school-1', countyId: 'county-1', districtId: 'district-1', isActive: 1,
      },
      {
        id: 'org-3', userId: 'user-2', role: 'DEO',
        institutionId: null, countyId: 'county-2', districtId: 'district-2', isActive: 0,
      },
    ]);
    db.close();
  });

  it('accepts a user with no email', () => {
    const db = seededBefore30();
    apply30(db);
    db.prepare(
      `INSERT INTO users (id, firstName, middleName, lastName, email, isActive, version, updatedAt)
       VALUES ('user-3','Musu',NULL,'Kollie',NULL,1,1,'2026-01-01T00:00:00.000Z')`,
    ).run();
    expect(db.prepare(`SELECT email FROM users WHERE id='user-3'`).get()).toEqual({ email: null });
    db.close();
  });

  it('rebuilds users exactly as migration 002 defined it, except email may be NULL', () => {
    const db = seededBefore30();
    const before = tableShape(db, 'users');
    expect(before.find((column) => column.name === 'email')).toMatchObject({ type: 'TEXT', notnull: 1 });
    apply30(db);
    const after = tableShape(db, 'users');
    expect(after).toEqual(
      before.map((column) => (column.name === 'email' ? { ...column, notnull: 0 } : column)),
    );
    // Pin the 002 shape itself, so an edit that changes both sides cannot pass.
    expect(after).toEqual([
      { name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
      { name: 'firstName', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'middleName', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { name: 'lastName', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'email', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { name: 'isActive', type: 'INTEGER', notnull: 1, dflt_value: '1', pk: 0 },
      { name: 'version', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'updatedAt', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'lastModifiedBy', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { name: 'deviceId', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    ]);
    db.close();
  });

  it('recreates user_organizations exactly as migration 002 defined it', () => {
    const db = seededBefore30();
    const before = tableShape(db, 'user_organizations');
    apply30(db);
    expect(tableShape(db, 'user_organizations')).toEqual(before);
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
    // The cascade removes only the deleted user's role rows.
    expect(db.prepare(`SELECT id FROM user_organizations ORDER BY id`).all()).toEqual([
      { id: 'org-2' },
      { id: 'org-3' },
    ]);
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
