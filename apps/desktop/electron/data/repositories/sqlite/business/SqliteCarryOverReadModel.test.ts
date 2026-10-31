import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCarryOverReadModel } from './SqliteCarryOverReadModel';

describe('SqliteCarryOverReadModel', () => {
  let test: TestContext;
  let model: SqliteCarryOverReadModel;
  const NOW = '2026-10-20T00:00:00.000Z';

  const year = (id: string, status: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,?,?,1,?,1,?)`,
      )
      .run(id, 'i-1', id, '2025-09-01', '2026-07-31', status, NOW);
  const student = (id: string, firstName: string, lastName: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,1,?)`,
      )
      .run(id, 'i-1', firstName, lastName, `n-${id}`, '2012-05-01', 'FEMALE', NOW);
  const carryOver = (id: string, studentId: string, yearId: string, status: string, createdAt = NOW) =>
    test.context.connection
      .prepare(
        `INSERT INTO transfer_carry_overs (id,studentId,institutionId,academicYearId,fromInstitutionName,enrolledAt,status,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, studentId, 'i-1', yearId, 'Alpha School', NOW, status, createdAt, NOW);

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    model = new SqliteCarryOverReadModel(test.context);
  });
  afterEach(() => test.cleanup());

  it('lists the PENDING tasks of the ACTIVE year, oldest first, with the student name', () => {
    year('y-active', 'ACTIVE');
    year('y-closed', 'CLOSED');
    student('s-1', 'Ama', 'Kofi');
    student('s-2', 'Kofi', 'Mensah');
    carryOver('co-2', 's-2', 'y-active', 'PENDING', '2026-10-21T00:00:00.000Z');
    carryOver('co-1', 's-1', 'y-active', 'PENDING', '2026-10-19T00:00:00.000Z');
    carryOver('co-saved', 's-1', 'y-active', 'SAVED');
    carryOver('co-old', 's-1', 'y-closed', 'PENDING');
    expect(model.listPending()).toEqual([
      { id: 'co-1', studentId: 's-1', studentName: 'Ama Kofi', fromInstitutionName: 'Alpha School', createdAt: '2026-10-19T00:00:00.000Z' },
      { id: 'co-2', studentId: 's-2', studentName: 'Kofi Mensah', fromInstitutionName: 'Alpha School', createdAt: '2026-10-21T00:00:00.000Z' },
    ]);
  });

  it('lists nothing when there are no tasks', () => {
    expect(model.listPending()).toEqual([]);
  });
});
