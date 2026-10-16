import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

const NOW = '2026-01-01T00:00:00.000Z';

type ColumnInfo = { name: string; notnull: number; dflt_value: string | null };

function migratedThrough(version: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations.filter((m) => m.version <= version)) migration.up(db);
  return db;
}

function column(db: Database.Database, table: string, name: string): ColumnInfo | undefined {
  return (db.pragma(`table_info(${table})`) as ColumnInfo[]).find((c) => c.name === name);
}

function seedSchool(db: Database.Database): void {
  db.prepare(
    `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
     VALUES ('school-1','SCH','School','PRIMARY','PUBLIC','county-1','APPROVED',1,?)`,
  ).run(NOW);
}

describe('migration 031 add-county-dashboard-columns', () => {
  it('adds the counties table and the three dashboard columns with their defaults', () => {
    const db = migratedThrough(31);
    expect((db.pragma('table_info(counties)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id',
      'code',
      'name',
    ]);
    expect(column(db, 'students', 'createdAt')).toMatchObject({ notnull: 0, dflt_value: null });
    expect(column(db, 'institutions', 'isActive')).toMatchObject({ notnull: 1, dflt_value: '1' });
    expect(column(db, 'districts', 'isActive')).toMatchObject({ notnull: 1, dflt_value: '1' });
  });

  it('keeps existing rows: schools and districts become active, students get a NULL createdAt', () => {
    const db = migratedThrough(30);
    seedSchool(db);
    db.prepare(`INSERT INTO districts (id,name,countyId) VALUES ('district-1','Sinkor','county-1')`).run();
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES ('s-1','school-1','Ada','Kollie','000000000018','2015-01-01','FEMALE',1,1,?)`,
    ).run(NOW);

    migrations.find((m) => m.version === 31)!.up(db);

    expect(db.prepare(`SELECT isActive FROM institutions`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT isActive FROM districts`).get()).toEqual({ isActive: 1 });
    expect(db.prepare(`SELECT firstName, createdAt FROM students`).get()).toEqual({
      firstName: 'Ada',
      createdAt: null,
    });
  });

  it('never puts the server-owned students.createdAt into a push payload', () => {
    const db = migratedThrough(31);
    seedSchool(db);
    db.prepare(`DELETE FROM sync_queue`).run();
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt,createdAt)
       VALUES ('s-1','school-1','Ada','Kollie','000000000018','2015-01-01','FEMALE',1,1,?,'2026-03-15T12:00:00.000Z')`,
    ).run(NOW);

    const row = db
      .prepare(`SELECT payload FROM sync_queue WHERE entityType = 'students'`)
      .get() as { payload: string };
    const record = (JSON.parse(row.payload) as { record: Record<string, unknown> }).record;
    expect(record).toHaveProperty('firstName', 'Ada');
    expect(record).not.toHaveProperty('createdAt');
  });
});
