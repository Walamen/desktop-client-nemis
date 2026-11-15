import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteDistrictOverviewReadModel } from './SqliteDistrictOverviewReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteDistrictOverviewReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteDistrictOverviewReadModel;
  let seq = 0;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  function district(id: string, name: string, countyId = 'county-1') {
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES (?,?,?,1)`, id, name, countyId);
  }
  function school(id: string, districtId: string | null, opts: { name?: string; isActive?: number; levels?: string[] } = {}) {
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,profile,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',?,1,?,?)`,
      id,
      id.toUpperCase(),
      opts.name ?? `School ${id}`,
      districtId,
      opts.levels ? JSON.stringify({ levels: opts.levels }) : null,
      NOW,
      opts.isActive ?? 1,
    );
  }
  function student(institutionId: string, opts: { gender?: string; isActive?: number; createdAt?: string | null } = {}) {
    seq += 1;
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt,createdAt)
       VALUES (?,?,'First','Last',?,'2015-01-01',?,NULL,?,1,?,?)`,
      `st-${seq}`,
      institutionId,
      String(seq).padStart(12, '0'),
      opts.gender ?? 'MALE',
      opts.isActive ?? 1,
      NOW,
      opts.createdAt ?? null,
    );
    return `st-${seq}`;
  }
  function staff(institutionId: string, position = 'TEACHER', isActive = 1) {
    seq += 1;
    run(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'Tee','Cher','1990-01-01','FEMALE','0770000000',?,?,'FULL_TIME','2020-01-01',?,?,?)`,
      `stf-${seq}`,
      institutionId,
      `E-${seq}`,
      position,
      isActive,
      NOW,
      NOW,
    );
  }
  function year(id: string, institutionId: string) {
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
       VALUES (?,?,'2026','2026-09-01','2027-07-01',1,'ACTIVE',1,?)`,
      id,
      institutionId,
      NOW,
    );
  }
  function term(id: string, academicYearId: string, startDate: string, endDate: string) {
    run(
      `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt)
       VALUES (?,?,'Term 1',?,?,1,1,?)`,
      id,
      academicYearId,
      startDate,
      endDate,
      NOW,
    );
  }
  function klass(id: string, institutionId: string) {
    run(
      `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt)
       VALUES (?,?,'y-any',?,'GRADE_1',1,1,?)`,
      id,
      institutionId,
      `Class ${id}`,
      NOW,
    );
  }
  function attendance(classId: string, date: string, status: string) {
    seq += 1;
    run(
      `INSERT INTO attendance (id,studentId,classId,date,status,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
      `att-${seq}`,
      `st-x${seq}`,
      classId,
      date,
      status,
      NOW,
    );
  }
  function alert(
    id: string,
    opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isResolved?: number; severity?: string },
  ) {
    run(
      `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
       VALUES (?,?,?,?,'DATA',?,?,'D',?,NULL,NULL,NULL,?,?)`,
      id,
      opts.countyId ?? null,
      opts.districtId ?? null,
      opts.institutionId ?? null,
      opts.severity ?? 'HIGH',
      `Alert ${id}`,
      opts.isResolved ?? 0,
      NOW,
      NOW,
    );
  }
  function report(id: string, schoolId: string, submittedAt: string | null, title = `Report ${id}`) {
    run(
      `INSERT INTO reports (id,type,title,description,data,status,comments,schoolId,districtId,countyId,submittedById,reviewedById,submittedAt,reviewedAt,createdAt,updatedAt)
       VALUES (?,'WEEKLY_SUMMARY',?,NULL,'{}',?,NULL,?,NULL,NULL,NULL,NULL,?,NULL,?,?)`,
      id,
      title,
      submittedAt ? 'SUBMITTED' : 'DRAFT',
      schoolId,
      submittedAt,
      NOW,
      NOW,
    );
  }

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteDistrictOverviewReadModel(test.context);
    seq = 0;
  });
  afterEach(() => test.cleanup());

  /** d-1 with two active schools, one inactive school, and a school of d-2. */
  function seedDistrict() {
    district('d-1', 'Buchanan');
    district('d-2', 'Compound 3');
    school('s-b', 'd-1', { name: 'Beta', levels: ['PRIMARY', 'JUNIOR_HIGH'] });
    school('s-a', 'd-1', { name: 'Alpha' });
    school('s-off', 'd-1', { name: 'Closed', isActive: 0 });
    school('s-other', 'd-2', { name: 'Elsewhere' });
  }

  it('reads nothing from an empty device', () => {
    expect(readModel.getDistrict('d-1')).toBeNull();
    expect(readModel.getCounty('county-1')).toBeNull();
    expect(readModel.listActiveSchools('d-1')).toEqual([]);
    expect(readModel.countActiveStudentsBySchool('d-1')).toEqual([]);
    expect(readModel.countTeachingStaffBySchool('d-1')).toEqual([]);
    expect(readModel.countActiveStudentsByGender('d-1')).toEqual([]);
    expect(readModel.listActiveStudentCreations('d-1', '2000-01-01T00:00:00.000Z')).toEqual([]);
    expect(readModel.attendanceBySchool('d-1', '2000-01-01')).toEqual([]);
    expect(readModel.lastAttendanceDateBySchool('d-1')).toEqual([]);
    expect(readModel.attendanceByMonth('d-1', '2000-01-01')).toEqual([]);
    expect(readModel.schoolsWithRunningTerm('d-1', '2026-11-16')).toEqual([]);
    expect(readModel.listOpenAlerts('d-1')).toEqual([]);
    expect(readModel.listSubmittedReports('d-1', 50)).toEqual([]);
    expect(readModel.lastSubmissionBySchool('d-1')).toEqual([]);
  });

  it('names the district, and the county once its row is synced', () => {
    seedDistrict();
    expect(readModel.getDistrict('d-1')).toEqual({ id: 'd-1', name: 'Buchanan', countyId: 'county-1' });
    // Older server: no counties row on a district device.
    expect(readModel.getCounty('county-1')).toBeNull();
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    expect(readModel.getCounty('county-1')).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });

  it('lists the active schools of the district by name, with their levels', () => {
    seedDistrict();
    expect(readModel.listActiveSchools('d-1')).toEqual([
      { id: 's-a', name: 'Alpha', code: 'S-A', levels: [] },
      { id: 's-b', name: 'Beta', code: 'S-B', levels: ['PRIMARY', 'JUNIOR_HIGH'] },
    ]);
  });

  it('counts active students and active teaching staff per school', () => {
    seedDistrict();
    student('s-a');
    student('s-a', { gender: 'FEMALE' });
    student('s-a', { isActive: 0 });
    student('s-b', { gender: 'FEMALE' });
    student('s-off');
    student('s-other');
    staff('s-a', 'TEACHER');
    staff('s-a', 'ASSISTANT_TEACHER');
    staff('s-a', 'PRINCIPAL');
    staff('s-a', 'TEACHER', 0);
    staff('s-other', 'TEACHER');
    const sorted = <T extends { institutionId: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.institutionId.localeCompare(b.institutionId));
    expect(sorted(readModel.countActiveStudentsBySchool('d-1'))).toEqual([
      { institutionId: 's-a', count: 2 },
      { institutionId: 's-b', count: 1 },
    ]);
    expect(readModel.countTeachingStaffBySchool('d-1')).toEqual([{ institutionId: 's-a', count: 2 }]);
    expect([...readModel.countActiveStudentsByGender('d-1')].sort((a, b) => a.gender.localeCompare(b.gender))).toEqual([
      { gender: 'FEMALE', count: 2 },
      { gender: 'MALE', count: 1 },
    ]);
  });

  it('lists creation dates of active students on or after the given instant', () => {
    seedDistrict();
    student('s-a', { createdAt: '2026-05-01T00:00:00.000Z' });
    student('s-a', { createdAt: '2026-08-01T00:00:00.000Z' });
    student('s-a', { createdAt: null });
    student('s-a', { createdAt: '2026-09-01T00:00:00.000Z', isActive: 0 });
    student('s-other', { createdAt: '2026-09-01T00:00:00.000Z' });
    expect(readModel.listActiveStudentCreations('d-1', '2026-06-01T00:00:00.000Z')).toEqual([
      { createdAt: '2026-08-01T00:00:00.000Z' },
    ]);
  });

  it('totals attendance per school from the window start, counting PRESENT and LATE as attended', () => {
    seedDistrict();
    klass('c-a1', 's-a');
    klass('c-a2', 's-a');
    klass('c-b', 's-b');
    klass('c-other', 's-other');
    attendance('c-a1', '2026-11-10', 'PRESENT');
    attendance('c-a1', '2026-11-10', 'LATE');
    attendance('c-a2', '2026-11-11T00:00:00.000Z', 'ABSENT');
    attendance('c-a2', '2026-11-11', 'EXCUSED');
    attendance('c-a1', '2026-10-16', 'PRESENT'); // before the window
    attendance('c-b', '2026-10-17', 'PRESENT'); // first day of the window
    attendance('c-other', '2026-11-10', 'PRESENT');
    const rows = [...readModel.attendanceBySchool('d-1', '2026-10-17')].sort((a, b) =>
      a.institutionId.localeCompare(b.institutionId),
    );
    expect(rows).toEqual([
      { institutionId: 's-a', records: 4, attended: 2 },
      { institutionId: 's-b', records: 1, attended: 1 },
    ]);
  });

  it('finds the latest attendance date per school', () => {
    seedDistrict();
    klass('c-a1', 's-a');
    klass('c-a2', 's-a');
    klass('c-b', 's-b');
    attendance('c-a1', '2026-11-02', 'PRESENT');
    attendance('c-a2', '2026-11-09T00:00:00.000Z', 'ABSENT');
    expect(readModel.lastAttendanceDateBySchool('d-1')).toEqual([{ institutionId: 's-a', date: '2026-11-09' }]);
  });

  it('groups attendance by month', () => {
    seedDistrict();
    klass('c-a1', 's-a');
    klass('c-other', 's-other');
    attendance('c-a1', '2026-09-03', 'PRESENT');
    attendance('c-a1', '2026-09-04', 'ABSENT');
    attendance('c-a1', '2026-11-04T00:00:00.000Z', 'LATE');
    attendance('c-a1', '2026-05-30', 'PRESENT'); // before the window
    attendance('c-other', '2026-09-03', 'PRESENT');
    expect(readModel.attendanceByMonth('d-1', '2026-06-01')).toEqual([
      { month: '2026-09', records: 2, attended: 1 },
      { month: '2026-11', records: 1, attended: 1 },
    ]);
  });

  it('knows which schools have a term running today, inclusive of both ends', () => {
    seedDistrict();
    year('y-a', 's-a');
    year('y-b', 's-b');
    year('y-other', 's-other');
    term('t-a', 'y-a', '2026-09-01', '2026-11-16');
    term('t-b', 'y-b', '2026-09-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z');
    term('t-other', 'y-other', '2026-09-01', '2026-12-20');
    expect(readModel.schoolsWithRunningTerm('d-1', '2026-11-16')).toEqual(['s-a']);
    expect(readModel.schoolsWithRunningTerm('d-1', '2026-09-01').sort()).toEqual(['s-a', 's-b']);
    expect(readModel.schoolsWithRunningTerm('d-1', '2026-08-31')).toEqual([]);
  });

  it('lists the unresolved alerts of the district and of its schools only', () => {
    seedDistrict();
    alert('a-district', { districtId: 'd-1', severity: 'LOW' });
    alert('a-school', { institutionId: 's-a', severity: 'CRITICAL' });
    alert('a-both', { countyId: 'county-1', districtId: 'd-1', institutionId: 's-b' });
    alert('a-resolved', { districtId: 'd-1', isResolved: 1 });
    alert('a-county', { countyId: 'county-1' });
    alert('a-other-district', { districtId: 'd-2' });
    alert('a-other-school', { institutionId: 's-other' });
    const rows = readModel.listOpenAlerts('d-1');
    expect(rows.map((row) => row.id).sort()).toEqual(['a-both', 'a-district', 'a-school']);
    expect(rows.find((row) => row.id === 'a-school')).toEqual({
      id: 'a-school',
      type: 'DATA',
      severity: 'CRITICAL',
      title: 'Alert a-school',
      description: 'D',
      institutionId: 's-a',
      createdAt: NOW,
    });
  });

  it("leaves a school's own staff requests out, and survives unreadable metadata", () => {
    seedDistrict();
    alert('a-roof', { institutionId: 's-a' });
    alert('a-request', { institutionId: 's-a' });
    alert('a-garbled', { institutionId: 's-a' });
    run(`UPDATE alerts SET metadata = ? WHERE id = 'a-request'`, JSON.stringify({ attendanceId: 'att-1', staffId: 'stf-1' }));
    run(`UPDATE alerts SET metadata = 'not json' WHERE id = 'a-garbled'`);
    expect(readModel.listOpenAlerts('d-1').map((row) => row.id).sort()).toEqual(['a-garbled', 'a-roof']);
  });

  it('lists submitted reports newest first, and the newest per school', () => {
    seedDistrict();
    report('r-old', 's-a', '2026-11-01T08:00:00.000Z');
    report('r-new', 's-a', '2026-11-12T08:00:00.000Z', 'Week 2 summary');
    report('r-b', 's-b', '2026-11-05T08:00:00.000Z');
    report('r-draft', 's-b', null);
    report('r-other', 's-other', '2026-11-13T08:00:00.000Z');
    expect(readModel.listSubmittedReports('d-1', 50).map((row) => row.id)).toEqual(['r-new', 'r-b', 'r-old']);
    expect(readModel.listSubmittedReports('d-1', 2).map((row) => row.id)).toEqual(['r-new', 'r-b']);
    expect(readModel.listSubmittedReports('d-1', 1)[0]).toEqual({
      id: 'r-new',
      schoolId: 's-a',
      schoolName: 'Alpha',
      title: 'Week 2 summary',
      type: 'WEEKLY_SUMMARY',
      submittedAt: '2026-11-12T08:00:00.000Z',
    });
    expect(
      [...readModel.lastSubmissionBySchool('d-1')].sort((a, b) => a.institutionId.localeCompare(b.institutionId)),
    ).toEqual([
      { institutionId: 's-a', submittedAt: '2026-11-12T08:00:00.000Z' },
      { institutionId: 's-b', submittedAt: '2026-11-05T08:00:00.000Z' },
    ]);
  });

  it('answers the attendance questions quickly at district scale', () => {
    district('d-1', 'Buchanan');
    const insertSchool = db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1','d-1','APPROVED',1,?,1)`,
    );
    const insertClass = db.prepare(
      `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt)
       VALUES (?,?,'y-any',?,'GRADE_1',1,1,?)`,
    );
    const insertAttendance = db.prepare(
      `INSERT INTO attendance (id,studentId,classId,date,status,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
    );
    const classIds: string[] = [];
    db.transaction(() => {
      for (let s = 0; s < 100; s += 1) {
        insertSchool.run(`big-${s}`, `B${s}`, `Big ${s}`, NOW);
        for (let c = 0; c < 4; c += 1) {
          const classId = `big-${s}-c${c}`;
          insertClass.run(classId, `big-${s}`, `Class ${c}`, NOW);
          classIds.push(classId);
        }
      }
      for (let i = 0; i < 200_000; i += 1) {
        const day = new Date(Date.UTC(2026, 8, 18 + (i % 60))).toISOString().slice(0, 10);
        insertAttendance.run(`big-att-${i}`, `st-${i % 5000}`, classIds[i % classIds.length], day, i % 10 === 0 ? 'ABSENT' : 'PRESENT', NOW);
      }
    })();

    const started = performance.now();
    const bySchool = readModel.attendanceBySchool('d-1', '2026-10-17');
    const last = readModel.lastAttendanceDateBySchool('d-1');
    const byMonth = readModel.attendanceByMonth('d-1', '2026-06-01');
    const elapsed = performance.now() - started;

    expect(bySchool).toHaveLength(100);
    expect(last).toHaveLength(100);
    expect(byMonth.map((row) => row.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(byMonth.reduce((total, row) => total + row.records, 0)).toBe(200_000);
    expect(elapsed).toBeLessThan(1500);
  }, 60_000);
});
