import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProvisioningRow } from '@nemis-desktop/types';
import { migrations } from '@app/database/migrations/registry';
import { applyDepartures } from './applyDepartures';

let db: Database.Database;

function addStudent(id: string, institutionId = 'school-1', updatedAt = '2026-01-01T00:00:00.000Z') {
  db.prepare(
    `INSERT INTO students (id, institutionId, firstName, lastName, nemisId, dateOfBirth, gender, isActive, version, updatedAt)
     VALUES (?,?,?,?,?,?,?,1,1,?)`,
  ).run(id, institutionId, 'Musu', 'Kollie', null, '2012-04-01', 'FEMALE', updatedAt);
}

function institutionOf(id: string) {
  return (db.prepare(`SELECT institutionId FROM students WHERE id=?`).get(id) as { institutionId: string }).institutionId;
}

function transfer(overrides: Partial<ProvisioningRow>): ProvisioningRow {
  return {
    id: 't1', studentId: 's1', fromInstitutionId: 'school-1', toInstitutionId: 'school-2',
    status: 'APPROVED', reviewedAt: '2026-09-10T00:00:00.000Z', ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  addStudent('s1');
});

describe('applyDepartures', () => {
  it('moves a student this school released', () => {
    applyDepartures(db, 'school-1', [transfer({})], []);
    expect(institutionOf('s1')).toBe('school-2');
  });

  it('only APPROVED moves a student', () => {
    applyDepartures(db, 'school-1', [
      transfer({ id: 't1', status: 'PENDING' }),
      transfer({ id: 't2', status: 'REJECTED' }),
      transfer({ id: 't3', status: 'CANCELLED' }),
    ], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('ignores a transfer INTO this school', () => {
    applyDepartures(db, 'school-1', [transfer({ fromInstitutionId: 'school-3', toInstitutionId: 'school-1' })], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('returned in the same pull: the pulled student row wins', () => {
    applyDepartures(db, 'school-1', [transfer({})], [{ id: 's1', institutionId: 'school-1' }]);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('latest move wins when a child left this school twice', () => {
    applyDepartures(db, 'school-1', [
      // Ids sort opposite to time, so array order cannot be what decides.
      transfer({ id: 'a', toInstitutionId: 'school-3', reviewedAt: '2026-09-20T00:00:00.000Z' }),
      transfer({ id: 'b', toInstitutionId: 'school-2', reviewedAt: '2026-03-01T00:00:00.000Z' }),
    ], []);
    expect(institutionOf('s1')).toBe('school-3');
  });

  it('a returned child is not moved by a re-sent historic departure', () => {
    db.prepare(`DELETE FROM students WHERE id='s1'`).run();
    addStudent('s1', 'school-1', '2026-09-15T00:00:00.000Z');
    applyDepartures(db, 'school-1', [transfer({ reviewedAt: '2026-09-10T00:00:00.000Z' })], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('an APPROVED transfer with no reviewedAt moves nobody', () => {
    applyDepartures(db, 'school-1', [transfer({ reviewedAt: null })], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('no institution (district/county/ministry workspace): does nothing', () => {
    applyDepartures(db, null, [transfer({})], []);
    applyDepartures(db, undefined, [transfer({})], []);
    expect(institutionOf('s1')).toBe('school-1');
  });

  it('tolerates a transfer for a student this device never had', () => {
    expect(() => applyDepartures(db, 'school-1', [transfer({ studentId: 'ghost' })], [])).not.toThrow();
  });
});
