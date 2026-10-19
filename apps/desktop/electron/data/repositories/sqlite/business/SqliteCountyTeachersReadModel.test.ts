import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyTeachersReadModel, SUBJECT_NAMES_SQL } from './SqliteCountyTeachersReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyTeachersReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyTeachersReadModel;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, name: string, districtId: string, opts: { isActive?: number; levels?: string[]; countyId?: string } = {}) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive,profile)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,'APPROVED',1,?,?,?)`,
      id, id.toUpperCase(), name, opts.countyId ?? 'county-1', districtId, NOW, opts.isActive ?? 1,
      JSON.stringify({ levels: opts.levels ?? ['PRIMARY'] }),
    );
  const staff = (
    id: string,
    institutionId: string,
    lastName: string,
    opts: { first?: string; position?: string; isActive?: number; employeeNumber?: string; qualifications?: string | null } = {},
  ) =>
    run(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,nationalId,phoneNumber,email,address,employeeNumber,
                          position,employmentType,dateOfJoining,qualifications,isActive,photoUrl,createdAt,updatedAt)
       VALUES (?,?,?,?,'1990-04-05','FEMALE',?,'0770',?,'1 Road',?,?,'FULL_TIME','2015-09-01',?,?,NULL,?,?)`,
      id, institutionId, opts.first ?? 'Tee', lastName, `NAT-${id}`, `${id}@x.lr`, opts.employeeNumber ?? `E-${id}`,
      opts.position ?? 'TEACHER', opts.qualifications === undefined ? null : opts.qualifications, opts.isActive ?? 1, NOW, NOW,
    );
  const year = (id: string, institutionId: string, isCurrent: number) =>
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,?,1,?)`,
      id, institutionId, id, '2025-09-01', '2026-07-01', isCurrent, NOW,
    );
  const klass = (id: string, institutionId: string, yearId: string, name = id) =>
    run(`INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,?,?,?,'GRADE_5',1,1,?)`,
      id, institutionId, yearId, name, NOW);
  const subject = (id: string, institutionId: string, name: string) =>
    run(`INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES (?,?,?,?,1,1,?)`,
      id, institutionId, name, id.toUpperCase(), NOW);
  const ownSubject = (staffId: string, subjectId: string, assignedAt = '2025-01-01') =>
    run(`INSERT INTO subject_teachers (id,subjectId,staffId,assignedAt,updatedAt) VALUES (?,?,?,?,?)`,
      `st-${staffId}-${subjectId}`, subjectId, staffId, assignedAt, NOW);
  const classSubject = (staffId: string, classId: string, subjectId: string, assignedAt = '2025-09-01') =>
    run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,updatedAt) VALUES (?,?,?,?,?,?)`,
      `cst-${classId}-${subjectId}`, classId, subjectId, staffId, assignedAt, NOW);
  const classTeacher = (staffId: string, classId: string, isClassTeacher = 0) =>
    run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,updatedAt) VALUES (?,?,?,?,?,?)`,
      `ct-${classId}-${staffId}`, classId, staffId, isClassTeacher, NOW, NOW);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyTeachersReadModel(test.context);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-1', { levels: ['PRIMARY', 'SECONDARY'] });
    school('sch-b', 'Beta School', 'd-1', { levels: ['SECONDARY'] });
    school('sch-closed', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-far', 'Far School', 'd-1', { countyId: 'county-2' });
    year('y-a', 'sch-a', 1);
    year('y-a-old', 'sch-a', 0);
    year('y-b', 'sch-b', 1);
  });
  afterEach(() => test.cleanup());

  const query = (extra: Record<string, unknown> = {}) => ({ page: 1, limit: 12, ...extra });
  const ids = (extra: Record<string, unknown> = {}) => readModel.listTeachers(query(extra)).data.map((t) => t.id);

  it('lists teaching staff at active county schools by last name, first name, id, 12 per page', () => {
    staff('t-3', 'sch-a', 'Kollie', { first: 'Ben' });
    staff('t-2', 'sch-a', 'Kollie', { first: 'Ada' });
    staff('t-1', 'sch-b', 'Doe', { position: 'ASSISTANT_TEACHER' });
    staff('p-1', 'sch-a', 'Aaron', { position: 'PRINCIPAL' });
    staff('t-x', 'sch-closed', 'Able');
    staff('t-far', 'sch-far', 'Abbot');
    expect(ids()).toEqual(['t-1', 't-2', 't-3']);

    const page = readModel.listTeachers(query());
    expect(page.data[1]).toMatchObject({
      firstName: 'Ada', lastName: 'Kollie', employeeNumber: 'E-t-2', position: 'TEACHER', isActive: true,
      institution: { id: 'sch-a', name: 'Alpha School', level: 'PRIMARY', districtName: 'Buchanan', countyName: 'Grand Bassa' },
      primarySubject: null,
    });
    expect(page).toMatchObject({ total: 3, page: 1, limit: 12, totalPages: 1 });

    for (let n = 0; n < 10; n += 1) staff(`t-z${n}`, 'sch-a', `Zulu${n}`);
    const second = readModel.listTeachers(query({ page: 2 }));
    expect(second.data.map((t) => t.id)).toEqual(['t-z9']);
    expect(second).toMatchObject({ total: 13, page: 2, totalPages: 2 });
  });

  it('filters by search (name or employee #), category (school level), status and subject', () => {
    subject('sub-e', 'sch-a', 'English');
    staff('t-1', 'sch-a', 'Kollie', { first: 'Musu', employeeNumber: 'GB-001' });
    staff('t-2', 'sch-b', 'Doe', { isActive: 0 });
    ownSubject('t-1', 'sub-e');
    expect(ids({ search: 'musu' })).toEqual(['t-1']);
    expect(ids({ search: 'gb-0' })).toEqual(['t-1']);
    expect(ids({ category: 'PRIMARY' })).toEqual(['t-1']);
    expect(ids({ category: 'SECONDARY' })).toEqual(['t-2', 't-1']);
    expect(ids({ status: 'active' })).toEqual(['t-1']);
    expect(ids({ status: 'inactive' })).toEqual(['t-2']);
    expect(ids({ subject: 'english' })).toEqual(['t-1']);
  });

  it('finds a teacher whose subject comes only from class_subject_teachers', () => {
    subject('sub-m', 'sch-a', 'Mathematics');
    klass('c-5a', 'sch-a', 'y-a');
    staff('t-1', 'sch-a', 'Kollie');
    classSubject('t-1', 'c-5a', 'sub-m');
    expect(ids({ subject: 'Mathematics' })).toEqual(['t-1']);
    expect(readModel.listTeachers(query()).data[0]!.primarySubject).toBe('Mathematics');
  });

  it('groups subject names by case and spaces, and counts a doubly assigned subject once', () => {
    subject('sub-m', 'sch-a', 'Mathematics');
    subject('sub-m2', 'sch-b', 'mathematics ');
    subject('sub-e', 'sch-a', 'English');
    klass('c-5a', 'sch-a', 'y-a');
    klass('c-6a', 'sch-a', 'y-a');
    staff('t-1', 'sch-a', 'Kollie');
    staff('t-2', 'sch-b', 'Doe');
    ownSubject('t-1', 'sub-m');
    classSubject('t-1', 'c-5a', 'sub-m');
    classSubject('t-1', 'c-6a', 'sub-m');
    ownSubject('t-2', 'sub-m2');
    ownSubject('t-2', 'sub-e');

    expect(readModel.listTeachers(query()).stats.subjects).toEqual(['English', 'Mathematics']);
    expect(ids({ subject: 'Mathematics' })).toEqual(['t-2', 't-1']);
    expect(readModel.getTeacher('t-1')!.subjectAssignments).toEqual([
      { id: 'sub-m', subject: { id: 'sub-m', name: 'Mathematics', code: 'SUB-M' } },
    ]);
  });

  it('primarySubject is the earliest assigned subject across both tables', () => {
    subject('sub-e', 'sch-a', 'English');
    subject('sub-m', 'sch-a', 'Maths');
    klass('c-5a', 'sch-a', 'y-a');
    staff('t-1', 'sch-a', 'Kollie');
    ownSubject('t-1', 'sub-e', '2025-03-01');
    classSubject('t-1', 'c-5a', 'sub-m', '2025-01-01');
    expect(readModel.listTeachers(query()).data[0]!.primarySubject).toBe('Maths');
    expect(readModel.getTeacher('t-1')!.primarySubject).toBe('Maths');
  });

  it('counts total, active, inactive and unassigned', () => {
    subject('sub-m', 'sch-a', 'Maths');
    klass('c-now', 'sch-a', 'y-a');
    klass('c-old', 'sch-a', 'y-a-old');
    klass('c-b-now', 'sch-b', 'y-b');
    staff('t-class', 'sch-a', 'A');
    classTeacher('t-class', 'c-now');
    staff('t-subject', 'sch-a', 'B');
    classSubject('t-subject', 'c-now', 'sub-m');
    staff('t-past', 'sch-a', 'C');
    classTeacher('t-past', 'c-old');
    staff('t-elsewhere', 'sch-a', 'D');
    classTeacher('t-elsewhere', 'c-b-now');
    staff('t-inactive', 'sch-a', 'E', { isActive: 0 });
    staff('p-1', 'sch-a', 'F', { position: 'PRINCIPAL' });
    school('sch-c', 'No Year School', 'd-1');
    staff('t-noyear', 'sch-c', 'G');

    expect(readModel.listTeachers(query()).stats).toEqual({
      total: 6, active: 5, inactive: 1, unassigned: 3, subjects: ['Maths'],
    });
  });

  it('builds the profile: classes of all years with CT flag, merged subjects, qualifications', () => {
    subject('sub-e', 'sch-a', 'English');
    subject('sub-m', 'sch-a', 'Maths');
    klass('c-now', 'sch-a', 'y-a', '5A');
    klass('c-old', 'sch-a', 'y-a-old', '4A');
    staff('t-1', 'sch-a', 'Kollie', { first: 'Musu', qualifications: '["B.Ed", 3]' });
    classTeacher('t-1', 'c-now', 1);
    classTeacher('t-1', 'c-old', 0);
    ownSubject('t-1', 'sub-e', '2025-01-01');
    classSubject('t-1', 'c-now', 'sub-m', '2025-09-01');

    expect(readModel.getTeacher('t-1')).toMatchObject({
      id: 't-1', firstName: 'Musu', lastName: 'Kollie', nationalId: 'NAT-t-1', phoneNumber: '0770', email: 't-1@x.lr',
      address: '1 Road', employmentType: 'FULL_TIME', dateOfBirth: '1990-04-05', dateOfJoining: '2015-09-01',
      dateOfLeaving: null, qualifications: ['B.Ed'], primarySubject: 'English',
      institution: { id: 'sch-a', name: 'Alpha School', level: 'PRIMARY', districtName: 'Buchanan', countyName: 'Grand Bassa' },
      classAssignments: [
        { id: 'ct-c-old-t-1', isClassTeacher: false, class: { id: 'c-old', name: '4A', gradeLevel: 'GRADE_5' } },
        { id: 'ct-c-now-t-1', isClassTeacher: true, class: { id: 'c-now', name: '5A', gradeLevel: 'GRADE_5' } },
      ],
      subjectAssignments: [
        { id: 'sub-e', subject: { id: 'sub-e', name: 'English', code: 'SUB-E' } },
        { id: 'sub-m', subject: { id: 'sub-m', name: 'Maths', code: 'SUB-M' } },
      ],
    });

    staff('t-2', 'sch-a', 'Doe', { qualifications: '{"summary":"B.Sc Physics"}' });
    expect(readModel.getTeacher('t-2')!.qualifications).toEqual(['B.Sc Physics']);
    for (const [n, raw] of ['not json', null, '7', '{"certified":true}', '{"summary":""}'].entries()) {
      staff(`t-q${n}`, 'sch-a', 'Q', { qualifications: raw });
      expect(readModel.getTeacher(`t-q${n}`)!.qualifications).toEqual([]);
    }
  });

  it('a teacher at an inactive school is absent from list and stats but their profile opens', () => {
    staff('t-x', 'sch-closed', 'Able');
    const page = readModel.listTeachers(query());
    expect(page.data).toEqual([]);
    expect(page.stats.total).toBe(0);
    expect(readModel.getTeacher('t-x')).toMatchObject({ id: 't-x', institution: { name: 'Closed School' } });
  });

  it('builds the subject list from the subject ids without materialising every assignment', () => {
    // A whole county's all-years assignment history is hundreds of thousands
    // of rows; the subject list runs on every list call on the main process.
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${SUBJECT_NAMES_SQL}`).all() as Array<{ detail: string }>)
      .map((row) => row.detail)
      .join('\n');
    expect(plan).not.toMatch(/AUTOMATIC|MATERIALIZE/);
  });

  it('returns null for staff outside the county or not on the device', () => {
    staff('t-far', 'sch-far', 'Abbot');
    expect(readModel.getTeacher('t-far')).toBeNull();
    expect(readModel.getTeacher('nope')).toBeNull();
  });
});
