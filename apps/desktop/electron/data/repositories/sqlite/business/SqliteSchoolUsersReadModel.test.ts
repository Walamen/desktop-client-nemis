import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteSchoolUsersReadModel } from './SqliteSchoolUsersReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteSchoolUsersReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteSchoolUsersReadModel;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT','county-1','APPROVED',1,?,1)`,
      id, id.toUpperCase(), id, NOW,
    );
  const user = (id: string, first: string, last: string, opts: { lastLoginAt?: string | null } = {}) =>
    run(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,phoneNumber,lastLoginAt,photoUrl,createdAt)
       VALUES (?,?,?,?,1,1,?,'0770000001',?,NULL,?)`,
      id, first, last, `${id}@school.lr`, NOW, opts.lastLoginAt ?? null, NOW,
    );
  const link = (
    userId: string,
    role: string,
    opts: { institutionId?: string; isActive?: number; modules?: string; title?: string | null } = {},
  ) =>
    run(
      `INSERT INTO user_organizations (id,userId,role,institutionId,isActive,modules,title) VALUES (?,?,?,?,?,?,?)`,
      `o-${userId}-${role}`, userId, role, opts.institutionId ?? 'sch-a', opts.isActive ?? 1,
      opts.modules ?? '[]', opts.title ?? null,
    );
  const staff = (
    id: string,
    first: string,
    last: string,
    opts: { institutionId?: string; userId?: string | null; isActive?: number } = {},
  ) =>
    run(
      `INSERT INTO staff (id,institutionId,userId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,?,?,?,'1990-01-01','FEMALE','0770000000',?,'TEACHER','FULL_TIME','2020-01-01',?,?,?)`,
      id, opts.institutionId ?? 'sch-a', opts.userId ?? null, first, last, id, opts.isActive ?? 1, NOW, NOW,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteSchoolUsersReadModel(test.context);
    school('sch-a');
    school('sch-b');
  });
  afterEach(() => test.cleanup());

  it("lists the school's admin and office staff with parsed modules and staff link", () => {
    user('u-zed', 'Zed', 'Adams');
    link('u-zed', 'INSTITUTION_STAFF', { modules: '["STUDENTS","FINANCE_PAYMENTS"]', title: 'Registrar' });
    user('u-amy', 'Amy', 'Brown', { lastLoginAt: '2026-01-02T00:00:00.000Z' });
    link('u-amy', 'INSTITUTION_STAFF', { modules: '["REPORTS","NOT_A_MODULE"]', isActive: 0 });
    user('u-head', 'Head', 'Zulu');
    link('u-head', 'INSTITUTION_ADMIN');
    staff('st-zed', 'Zed', 'Adams', { userId: 'u-zed' });

    const { users } = readModel.list('sch-a');

    expect(users.map((u) => u.id)).toEqual(['u-head', 'u-zed', 'u-amy']);
    expect(users[0]).toMatchObject({ role: 'INSTITUTION_ADMIN', modules: [], staffId: null, isActive: true });
    expect(users[1]).toEqual({
      id: 'u-zed',
      firstName: 'Zed',
      lastName: 'Adams',
      email: 'u-zed@school.lr',
      phoneNumber: '0770000001',
      photoUrl: null,
      role: 'INSTITUTION_STAFF',
      title: 'Registrar',
      modules: ['STUDENTS', 'FINANCE_PAYMENTS'],
      isActive: true,
      lastLoginAt: null,
      staffId: 'st-zed',
    });
    expect(users[2]).toMatchObject({
      modules: ['REPORTS'],
      isActive: false,
      lastLoginAt: '2026-01-02T00:00:00.000Z',
      title: null,
    });
  });

  it('malformed modules JSON reads as []', () => {
    user('u-1', 'Ada', 'Doe');
    link('u-1', 'INSTITUTION_STAFF', { modules: '{not json' });
    user('u-2', 'Ben', 'Doe');
    link('u-2', 'INSTITUTION_STAFF', { modules: '{"STUDENTS":true}' });
    user('u-3', 'Cy', 'Doe');
    link('u-3', 'INSTITUTION_STAFF', { modules: '[1,null,"STAFF"]' });

    expect(readModel.list('sch-a').users.map((u) => u.modules)).toEqual([[], [], ['STAFF']]);
  });

  it('excludes other schools and other roles', () => {
    user('u-mine', 'Ada', 'Doe');
    link('u-mine', 'INSTITUTION_STAFF');
    user('u-other', 'Ben', 'Doe');
    link('u-other', 'INSTITUTION_STAFF', { institutionId: 'sch-b' });
    user('u-teacher', 'Cy', 'Doe');
    link('u-teacher', 'TEACHER');
    user('u-parent', 'Di', 'Doe');
    link('u-parent', 'PARENT');

    expect(readModel.list('sch-a').users.map((u) => u.id)).toEqual(['u-mine']);
    expect(readModel.list('sch-b').users.map((u) => u.id)).toEqual(['u-other']);
  });

  it('linkableStaff excludes linked and inactive staff', () => {
    user('u-1', 'Ada', 'Doe');
    staff('st-linked', 'Ada', 'Doe', { userId: 'u-1' });
    staff('st-inactive', 'Old', 'Hand', { isActive: 0 });
    staff('st-other', 'Far', 'Away', { institutionId: 'sch-b' });
    staff('st-b', 'Bea', 'Kollie');
    staff('st-a', 'Abe', 'Kollie');
    staff('st-c', 'Cal', 'Johnson');

    expect(readModel.list('sch-a').linkableStaff).toEqual([
      { id: 'st-c', firstName: 'Cal', lastName: 'Johnson', position: 'TEACHER' },
      { id: 'st-a', firstName: 'Abe', lastName: 'Kollie', position: 'TEACHER' },
      { id: 'st-b', firstName: 'Bea', lastName: 'Kollie', position: 'TEACHER' },
    ]);
  });
});
