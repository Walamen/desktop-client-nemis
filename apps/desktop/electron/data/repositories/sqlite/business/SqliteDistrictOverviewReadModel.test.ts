import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import {
  ATTENDANCE_SINCE,
  AT_RISK_STUDENTS_SQL,
  CURRENT_ASSESSMENTS_SQL,
  SqliteDistrictOverviewReadModel,
} from './SqliteDistrictOverviewReadModel';

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
  function school(
    id: string,
    districtId: string | null,
    opts: {
      name?: string;
      isActive?: number;
      levels?: string[];
      street?: string | null;
      communityTown?: string | null;
      details?: string | null;
    } = {},
  ) {
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,profile,version,updatedAt,isActive,street,communityTown,details)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',?,1,?,?,?,?,?)`,
      id,
      id.toUpperCase(),
      opts.name ?? `School ${id}`,
      districtId,
      opts.levels ? JSON.stringify({ levels: opts.levels }) : null,
      NOW,
      opts.isActive ?? 1,
      opts.street ?? null,
      opts.communityTown ?? null,
      opts.details ?? null,
    );
  }
  function student(
    institutionId: string,
    opts: { gender?: string; isActive?: number; createdAt?: string | null; gradeLevel?: string | null } = {},
  ) {
    seq += 1;
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt,createdAt)
       VALUES (?,?,'First','Last',?,'2015-01-01',?,?,?,1,?,?)`,
      `st-${seq}`,
      institutionId,
      String(seq).padStart(12, '0'),
      opts.gender ?? 'MALE',
      opts.gradeLevel ?? null,
      opts.isActive ?? 1,
      NOW,
      opts.createdAt ?? null,
    );
    return `st-${seq}`;
  }
  function staff(
    institutionId: string,
    position = 'TEACHER',
    isActive = 1,
    opts: { approvalStatus?: string; createdAt?: string } = {},
  ) {
    seq += 1;
    run(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'Tee','Cher','1990-01-01','FEMALE','0770000000',?,?,'FULL_TIME','2020-01-01',?,?,?)`,
      `stf-${seq}`,
      institutionId,
      `E-${seq}`,
      position,
      isActive,
      opts.createdAt ?? NOW,
      NOW,
    );
    if (opts.approvalStatus) run(`UPDATE staff SET approvalStatus = ? WHERE id = ?`, opts.approvalStatus, `stf-${seq}`);
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
    opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isResolved?: number; severity?: string; createdAt?: string; resolvedAt?: string },
  ) {
    run(
      `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
       VALUES (?,?,?,?,'DATA',?,?,'D',?,?,NULL,NULL,?,?)`,
      id,
      opts.countyId ?? null,
      opts.districtId ?? null,
      opts.institutionId ?? null,
      opts.severity ?? 'HIGH',
      `Alert ${id}`,
      opts.isResolved ?? 0,
      opts.resolvedAt ?? null,
      opts.createdAt ?? NOW,
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
  });

  it('listSchoolRegistrations reads dates from details', () => {
    district('d-1', 'Buchanan');
    district('d-2', 'Compound 3');
    school('s-a', 'd-1', {
      details: '{"approvedAt":"2025-02-10T00:00:00.000Z","createdAt":"2025-01-05T00:00:00.000Z"}',
    });
    school('s-null', 'd-1');
    school('s-bad', 'd-1', { details: 'not json' });
    school('s-odd', 'd-1', { details: '{"approvedAt":5,"createdAt":""}' });
    school('s-date', 'd-1', { details: '{"approvedAt":"not-a-date","createdAt":"2025-01-05T00:00:00.000Z"}' });
    school('s-off', 'd-1', { isActive: 0, details: '{"createdAt":"2025-01-05T00:00:00.000Z"}' });
    school('s-other', 'd-2', { details: '{"createdAt":"2025-01-05T00:00:00.000Z"}' });
    const rows = [...readModel.listSchoolRegistrations('d-1')].sort((a, b) =>
      a.institutionId.localeCompare(b.institutionId),
    );
    expect(rows).toEqual([
      { institutionId: 's-a', approvalStatus: 'APPROVED', approvedAt: '2025-02-10T00:00:00.000Z', createdAt: '2025-01-05T00:00:00.000Z' },
      { institutionId: 's-bad', approvalStatus: 'APPROVED', approvedAt: null, createdAt: null },
      { institutionId: 's-date', approvalStatus: 'APPROVED', approvedAt: null, createdAt: '2025-01-05T00:00:00.000Z' },
      { institutionId: 's-null', approvalStatus: 'APPROVED', approvedAt: null, createdAt: null },
      { institutionId: 's-odd', approvalStatus: 'APPROVED', approvedAt: null, createdAt: null },
    ]);
  });

  it('teacherRosterBySchool counts active teaching staff', () => {
    seedDistrict();
    school('s-none', 'd-1');
    staff('s-a', 'TEACHER', 1, { approvalStatus: 'APPROVED', createdAt: '2025-03-01T00:00:00.000Z' });
    staff('s-a', 'ASSISTANT_TEACHER', 1, { approvalStatus: 'PENDING', createdAt: '2025-05-01T00:00:00.000Z' });
    staff('s-a', 'TEACHER', 1, { approvalStatus: 'UNDER_REVIEW', createdAt: '2025-04-01T00:00:00.000Z' });
    staff('s-a', 'TEACHER', 0, { approvalStatus: 'PENDING', createdAt: '2025-09-01T00:00:00.000Z' });
    staff('s-a', 'PRINCIPAL', 1, { approvalStatus: 'PENDING', createdAt: '2025-10-01T00:00:00.000Z' });
    staff('s-other', 'TEACHER', 1, { approvalStatus: 'PENDING' });
    expect(readModel.teacherRosterBySchool('d-1')).toEqual([
      { institutionId: 's-a', total: 3, awaitingApproval: 2, newestCreatedAt: '2025-05-01T00:00:00.000Z' },
    ]);
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
      { id: 's-a', name: 'Alpha', code: 'S-A', levels: [], metadataPrincipal: null },
      { id: 's-b', name: 'Beta', code: 'S-B', levels: ['PRIMARY', 'JUNIOR_HIGH'], metadataPrincipal: null },
    ]);
  });

  it('reads the principal from the school profile, and survives a malformed one', () => {
    seedDistrict();
    const profile = (id: string, value: string | null) =>
      run(`UPDATE institutions SET profile = ? WHERE id = ?`, value, id);
    profile('s-a', JSON.stringify({ contact: { principal: '  Musu Kollie ' } }));
    profile('s-b', JSON.stringify({ principalName: 'Jallah Doe', levels: ['PRIMARY'] }));
    expect(readModel.listActiveSchools('d-1').map((s) => s.metadataPrincipal)).toEqual(['Musu Kollie', 'Jallah Doe']);
    profile('s-a', 'not json');
    profile('s-b', JSON.stringify({ contact: { principal: 42 } }));
    expect(readModel.listActiveSchools('d-1').map((s) => [s.metadataPrincipal, s.levels])).toEqual([
      [null, []],
      [null, []],
    ]);
  });

  it('names the first active School Admin of each school', () => {
    seedDistrict();
    const admin = (id: string, institutionId: string, first: string, last: string, isActive = 1) =>
      run(
        `INSERT INTO institution_admin (id,institutionId,firstName,lastName,position,isActive) VALUES (?,?,?,?,'PRINCIPAL',?)`,
        id, institutionId, first, last, isActive,
      );
    admin('adm-2', 's-a', 'Second', 'Admin');
    admin('adm-1', 's-a', 'Jallah', 'Doe');
    admin('adm-3', 's-b', 'Gone', 'Away', 0);
    admin('adm-4', 's-other', 'Else', 'Where');
    expect(readModel.schoolAdminNameBySchool('d-1')).toEqual([{ institutionId: 's-a', name: 'Jallah Doe' }]);
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

  it('leaves an inactive school’s alert out of the open list', () => {
    seedDistrict();
    alert('a-active', { institutionId: 's-a' });
    alert('a-off', { institutionId: 's-off' });
    expect(readModel.listOpenAlerts('d-1').map((row) => row.id)).toEqual(['a-active']);
  });

  describe('listDistrictAlerts', () => {
    const ids = (filter: 'open' | 'resolved' | 'all') => readModel.listDistrictAlerts('d-1', filter).map((row) => row.id);
    const seedMixed = () => {
      seedDistrict();
      alert('a-district', { districtId: 'd-1', severity: 'LOW' });
      alert('a-school', { institutionId: 's-a', severity: 'LOW', createdAt: '2026-01-02T00:00:00.000Z' });
      alert('a-off', { institutionId: 's-off' });
      alert('a-other', { districtId: 'd-2' });
      alert('a-other-school', { institutionId: 's-other' });
      alert('a-county', { countyId: 'county-1' });
      alert('a-request', { institutionId: 's-a' });
      run(`UPDATE alerts SET metadata = ? WHERE id = 'a-request'`, JSON.stringify({ staffId: 'stf-1' }));
    };

    it("open: the district's and an active school's alerts, in order; nothing else", () => {
      seedMixed();
      expect(ids('open')).toEqual(['a-school', 'a-district']);
    });

    it('resolved: only resolved alerts, with resolvedAt', () => {
      seedMixed();
      alert('a-done', { districtId: 'd-1', isResolved: 1, resolvedAt: '2026-02-01T00:00:00.000Z' });
      const rows = readModel.listDistrictAlerts('d-1', 'resolved');
      expect(rows.map((row) => row.id)).toEqual(['a-done']);
      expect(rows[0]).toMatchObject({ isResolved: true, resolvedAt: '2026-02-01T00:00:00.000Z' });
    });

    it('all: open before resolved', () => {
      seedMixed();
      alert('a-done', { districtId: 'd-1', isResolved: 1, severity: 'CRITICAL', resolvedAt: NOW });
      expect(ids('all')).toEqual(['a-school', 'a-district', 'a-done']);
    });

    it('returns schoolName (null when district-tagged) and a boolean isResolved', () => {
      seedMixed();
      const rows = readModel.listDistrictAlerts('d-1', 'open');
      expect(rows.find((row) => row.id === 'a-school')).toEqual({
        id: 'a-school',
        type: 'DATA',
        severity: 'LOW',
        title: 'Alert a-school',
        description: 'D',
        institutionId: 's-a',
        schoolName: 'Alpha',
        isResolved: false,
        resolvedAt: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      expect(rows.find((row) => row.id === 'a-district')).toMatchObject({ schoolName: null, institutionId: null, isResolved: false });
    });

    it('orders open alerts CRITICAL, HIGH, MEDIUM, LOW, then newest, then id', () => {
      seedDistrict();
      alert('a-low', { districtId: 'd-1', severity: 'LOW' });
      alert('a-med', { districtId: 'd-1', severity: 'MEDIUM' });
      alert('a-high-b', { districtId: 'd-1', severity: 'HIGH' });
      alert('a-high-a', { districtId: 'd-1', severity: 'HIGH' });
      alert('a-high-new', { districtId: 'd-1', severity: 'HIGH', createdAt: '2026-06-01T00:00:00.000Z' });
      alert('a-crit', { districtId: 'd-1', severity: 'CRITICAL' });
      expect(ids('open')).toEqual(['a-crit', 'a-high-new', 'a-high-a', 'a-high-b', 'a-med', 'a-low']);
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

  describe('school admin directory', () => {
    function account(id: string, opts: { isActive?: number; photoUrl?: string | null; createdAt?: string | null; lastLoginAt?: string | null } = {}) {
      run(
        `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,photoUrl,createdAt,lastLoginAt)
         VALUES (?,?, 'Doe', ?, ?, 1, ?, ?, ?, ?)`,
        id, `First ${id}`, `${id}@moe.gov.lr`, opts.isActive ?? 1, NOW,
        opts.photoUrl ?? null, opts.createdAt === undefined ? '2025-02-03T00:00:00.000Z' : opts.createdAt,
        opts.lastLoginAt === undefined ? '2026-11-14T09:00:00.000Z' : opts.lastLoginAt,
      );
    }
    function schoolAdmin(id: string, institutionId: string, first: string) {
      run(
        `INSERT INTO institution_admin (id,institutionId,firstName,lastName,position,photoUrl,isActive) VALUES (?,?,?,'Doe','PRINCIPAL',NULL,1)`,
        id, institutionId, first,
      );
    }
    function staffFor(userId: string, institutionId: string, employeeNumber: string) {
      seq += 1;
      run(
        `INSERT INTO staff (id,institutionId,userId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
         VALUES (?,?,?,'A','B','1990-01-01','MALE','0770000000',?,'PRINCIPAL','FULL_TIME','2020-01-01',1,?,?)`,
        `stf-${seq}`, institutionId, userId, employeeNumber, NOW, NOW,
      );
    }
    it('lists each School Admin of the district with the account details', () => {
      seedDistrict();
      account('u-1', { isActive: 0, photoUrl: 'https://img/a.png' });
      schoolAdmin('u-1', 's-a', 'Ann');
      account('u-9');
      schoolAdmin('u-9', 's-other', 'Elsewhere');
      expect(readModel.listSchoolAdmins('d-1')).toEqual([
        {
          userId: 'u-1',
          firstName: 'Ann',
          lastName: 'Doe',
          photoUrl: 'https://img/a.png',
          schoolId: 's-a',
          schoolName: 'Alpha',
          employeeNumber: null,
          isActive: false,
          joinedAt: '2025-02-03T00:00:00.000Z',
          lastLoginAt: '2026-11-14T09:00:00.000Z',
        },
      ]);
    });

    it('treats an admin whose account row has not synced as active, with no dates', () => {
      seedDistrict();
      schoolAdmin('u-2', 's-b', 'Musu');
      expect(readModel.listSchoolAdmins('d-1')[0]).toMatchObject({
        userId: 'u-2',
        isActive: true,
        photoUrl: null,
        joinedAt: null,
        lastLoginAt: null,
      });
    });

    it('takes the employee number from the staff record at that school only', () => {
      seedDistrict();
      account('u-1');
      schoolAdmin('u-1', 's-a', 'Ann');
      staffFor('u-1', 's-b', 'EMP-OTHER');
      expect(readModel.listSchoolAdmins('d-1')[0]!.employeeNumber).toBeNull();
      run(`DELETE FROM staff`);
      staffFor('u-1', 's-a', 'EMP-007');
      expect(readModel.listSchoolAdmins('d-1')[0]!.employeeNumber).toBe('EMP-007');
    });

    it('shows a person who runs two schools once at each school', () => {
      seedDistrict();
      account('u-1');
      const membership = (id: string, institutionId: string) =>
        run(
          `INSERT INTO institution_admin (id,userId,institutionId,firstName,lastName,position,photoUrl,isActive)
           VALUES (?,'u-1',?,'Ann','Doe','PRINCIPAL',NULL,1)`,
          id, institutionId,
        );
      membership('org-a', 's-a');
      membership('org-b', 's-b');
      staffFor('u-1', 's-b', 'EMP-B');
      const rows = readModel
        .listSchoolAdmins('d-1')
        .map((row) => [row.userId, row.schoolId, row.employeeNumber])
        .sort();
      expect(rows).toEqual([
        ['u-1', 's-a', null],
        ['u-1', 's-b', 'EMP-B'],
      ]);
    });

    it('names the School Admin with the lowest user id, as the server does', () => {
      seedDistrict();
      run(
        `INSERT INTO institution_admin (id,userId,institutionId,firstName,lastName,position,isActive)
         VALUES ('org-a','u-9','s-a','Zed','Last','PRINCIPAL',1), ('org-z','u-1','s-a','Ann','First','PRINCIPAL',1)`,
      );
      expect(readModel.schoolAdminNameBySchool('d-1')).toEqual([{ institutionId: 's-a', name: 'Ann First' }]);
    });

    it('skips an admin with a blank name, as the server does', () => {
      seedDistrict();
      run(
        `INSERT INTO institution_admin (id,userId,institutionId,firstName,lastName,position,isActive)
         VALUES ('org-blank','u-0','s-a',' ','','PRINCIPAL',1), ('org-z','u-1','s-a','Ann','First','PRINCIPAL',1)`,
      );
      expect(readModel.schoolAdminNameBySchool('d-1')).toEqual([{ institutionId: 's-a', name: 'Ann First' }]);
    });

    it('counts open infrastructure issues per school, without school staff requests', () => {
      seedDistrict();
      const issue = (id: string, institutionId: string, opts: { type?: string; isResolved?: number; metadata?: string | null } = {}) =>
        run(
          `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
           VALUES (?,NULL,NULL,?,?,'HIGH','T','D',?,NULL,NULL,?,?,?)`,
          id, institutionId, opts.type ?? 'INFRASTRUCTURE_ISSUE', opts.isResolved ?? 0, opts.metadata ?? null, NOW, NOW,
        );
      issue('i-1', 's-a');
      issue('i-2', 's-a');
      issue('i-3', 's-a', { isResolved: 1 });
      issue('i-4', 's-a', { type: 'ATTENDANCE_CONCERN' });
      issue('i-5', 's-a', { metadata: JSON.stringify({ staffId: 'stf-1' }) });
      issue('i-6', 's-other');
      expect(readModel.countOpenInfrastructureIssuesBySchool('d-1')).toEqual([{ institutionId: 's-a', count: 2 }]);
    });
  });

  describe('district transfers', () => {
    function transferRow(
      id: string,
      from: string,
      to: string,
      opts: {
        createdAt?: string;
        status?: string;
        studentName?: string | null;
        fromName?: string | null;
        toName?: string | null;
      } = {},
    ) {
      run(
        `INSERT INTO student_transfers (id,studentId,fromInstitutionId,toInstitutionId,requestedBy,reason,status,
           createdAt,updatedAt,initiatedBy,lapsesAt,studentName,studentNemisId,fromInstitutionName,toInstitutionName,
           toGradeLevel,requestedDate,reviewNotes,reviewedAt)
         VALUES (?,?,?,?,'u-1','Family moved',?,?,?,'RECEIVING_SCHOOL','2026-11-20T00:00:00.000Z',?,'100000000001',?,?,
           'GRADE_4','2026-11-25T00:00:00.000Z',NULL,NULL)`,
        id,
        `st-${id}`,
        from,
        to,
        opts.status ?? 'PENDING',
        opts.createdAt ?? '2026-11-10T09:00:00.000Z',
        NOW,
        opts.studentName === undefined ? 'Musu Kollie' : opts.studentName,
        opts.fromName === undefined ? `Synced ${from}` : opts.fromName,
        opts.toName === undefined ? `Synced ${to}` : opts.toName,
      );
    }

    it('lists transfers into, out of and within the district, newest first, others excluded', () => {
      seedDistrict();
      transferRow('within', 's-a', 's-b', { createdAt: '2026-11-12T00:00:00.000Z' });
      transferRow('out', 's-a', 's-far', { createdAt: '2026-11-11T00:00:00.000Z' });
      transferRow('into', 's-far', 's-b', { createdAt: '2026-11-11T00:00:00.000Z' });
      transferRow('closed', 's-off', 's-other', { createdAt: '2026-11-09T00:00:00.000Z' });
      transferRow('elsewhere', 's-other', 's-far');
      expect(
        readModel.listTransfers('d-1').map((t) => [t.id, t.fromInDistrict, t.toInDistrict]),
      ).toEqual([
        ['within', true, true],
        ['into', false, true],
        ['out', true, false],
        ['closed', true, false],
      ]);
    });

    it('carries the fields the page shows', () => {
      seedDistrict();
      transferRow('t-1', 's-a', 's-b');
      expect(readModel.listTransfers('d-1')[0]).toEqual({
        id: 't-1',
        studentName: 'Musu Kollie',
        studentNemisId: '100000000001',
        // District schools read their current local name, not the copy saved with the transfer.
        fromSchool: { id: 's-a', name: 'Alpha' },
        toSchool: { id: 's-b', name: 'Beta' },
        fromInDistrict: true,
        toInDistrict: true,
        status: 'PENDING',
        initiatedBy: 'RECEIVING_SCHOOL',
        lapsesAt: '2026-11-20T00:00:00.000Z',
        requestedGrade: 'GRADE_4',
        reason: 'Family moved',
        reviewNotes: null,
        createdAt: '2026-11-10T09:00:00.000Z',
        requestedDate: '2026-11-25T00:00:00.000Z',
        reviewedAt: null,
      });
    });

    it('names an outside school from the transfer copy', () => {
      seedDistrict();
      transferRow('t-1', 's-a', 's-far');
      expect(readModel.listTransfers('d-1')[0]!.toSchool).toEqual({ id: 's-far', name: 'Synced s-far' });
    });

    it('falls back to the local school name, then "Unknown school"; a nameless pupil is "Unknown pupil"', () => {
      seedDistrict();
      transferRow('t-1', 's-a', 's-far', { fromName: null, toName: null, studentName: null });
      const [row] = readModel.listTransfers('d-1');
      expect(row).toMatchObject({
        studentName: 'Unknown pupil',
        fromSchool: { id: 's-a', name: 'Alpha' },
        toSchool: { id: 's-far', name: 'Unknown school' },
      });
    });
  });

  describe('pupils at risk', () => {
    /** n records for one pupil from a start day, one per day. */
    function marks(studentId: string, classId: string, status: string, n: number, from = '2026-10-20') {
      for (let i = 0; i < n; i += 1) {
        seq += 1;
        const day = new Date(`${from}T00:00:00.000Z`);
        day.setUTCDate(day.getUTCDate() + i + seq);
        run(
          `INSERT INTO attendance (id,studentId,classId,date,status,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
          `att-${seq}`,
          studentId,
          classId,
          day.toISOString().slice(0, 10),
          status,
          NOW,
        );
      }
    }
    const since = '2026-10-17';
    const counts = () =>
      Object.fromEntries(readModel.countAtRiskStudentsBySchool('d-1', since).map((r) => [r.institutionId, r.count]));

    it('counts active pupils with 5+ records under 80% attended, at their own school', () => {
      seedDistrict();
      klass('c-a', 's-a');
      klass('c-b', 's-b');
      const risk = student('s-a');
      marks(risk, 'c-a', 'PRESENT', 3);
      marks(risk, 'c-a', 'ABSENT', 2); // 60%
      const edge = student('s-a');
      marks(edge, 'c-a', 'PRESENT', 4);
      marks(edge, 'c-a', 'ABSENT', 1); // exactly 80%: fine
      const few = student('s-a');
      marks(few, 'c-a', 'PRESENT', 1);
      marks(few, 'c-a', 'ABSENT', 3); // 4 records: not judged
      const late = student('s-b');
      marks(late, 'c-b', 'LATE', 4);
      marks(late, 'c-b', 'ABSENT', 1); // LATE attends: 80%
      const gone = student('s-a', { isActive: 0 });
      marks(gone, 'c-a', 'ABSENT', 10);
      const visitor = student('s-a'); // pupil of s-a, marked in an s-b class
      marks(visitor, 'c-b', 'ABSENT', 6);
      expect(counts()).toEqual({ 's-a': 2 });
    });

    it('reads only the window and only the district', () => {
      seedDistrict();
      klass('c-a', 's-a');
      klass('c-x', 's-other');
      const old = student('s-a');
      marks(old, 'c-a', 'ABSENT', 10, '2026-08-01'); // before the window
      marks(old, 'c-a', 'PRESENT', 5);
      const elsewhere = student('s-other');
      marks(elsewhere, 'c-x', 'ABSENT', 10);
      expect(counts()).toEqual({});
    });

    it('ignores classes of an inactive school and pupils whose own school is inactive', () => {
      seedDistrict();
      klass('c-a', 's-a');
      klass('c-off', 's-off');
      const markedAtClosed = student('s-a'); // their absences are in a closed school's class
      marks(markedAtClosed, 'c-off', 'ABSENT', 10);
      const ofClosed = student('s-off'); // marked in an open school, but belongs to the closed one
      marks(ofClosed, 'c-a', 'ABSENT', 10);
      expect(counts()).toEqual({});
    });

    it('reads attendance through an index, never a full scan', () => {
      const plan = (
        db.prepare(`EXPLAIN QUERY PLAN ${AT_RISK_STUDENTS_SQL}`).all(since, 'd-1', 'd-1') as { detail: string }[]
      )
        .map((row) => row.detail)
        .join(String.fromCharCode(10));
      expect(plan).toMatch(/USING (COVERING )?INDEX idx_attendance_/);
      expect(plan).not.toMatch(/SCAN a(\s|$)/m);
    });
  });

  describe('teacher monitoring', () => {
    function teacherRow(id: string, institutionId: string, opts: { position?: string; isActive?: number; approvalStatus?: string; lastName?: string } = {}) {
      run(
        `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,approvalStatus,createdAt,updatedAt)
         VALUES (?,?,'First',?,'1990-01-01','FEMALE','0770000000',?,?,'FULL_TIME','2020-01-01',?,?,?,?)`,
        id, institutionId, opts.lastName ?? `Last ${id}`, `E-${id}`, opts.position ?? 'TEACHER', opts.isActive ?? 1,
        opts.approvalStatus ?? 'APPROVED', NOW, NOW,
      );
    }
    function yearOf(id: string, institutionId: string, isCurrent: number) {
      run(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?, '2026-01-01','2026-12-31',?,?,1,?)`,
        id, institutionId, id, isCurrent, isCurrent ? 'ACTIVE' : 'SETUP', NOW,
      );
    }
    function termOf(id: string, yearId: string, isCurrent: number) {
      run(
        `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,'2026-01-01','2026-12-31',?,1,?)`,
        id, yearId, id, isCurrent, NOW,
      );
    }
    function classIn(id: string, institutionId: string, yearId: string, gradeLevel: string) {
      run(
        `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,?,?,?,?,1,1,?)`,
        id, institutionId, yearId, `Class ${id}`, gradeLevel, NOW,
      );
    }
    function subjectIn(id: string, institutionId: string, name: string) {
      run(`INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES (?,?,?,?,1,1,?)`, id, institutionId, name, id, NOW);
    }
    function period(id: string, institutionId: string, yearId: string, termId: string) {
      run(
        `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,startDate,endDate,isActive,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,'PERIOD',1,100,50,'2026-01-01','2026-12-31',1,?,?)`,
        id, institutionId, yearId, termId, id, id, NOW, NOW,
      );
    }
    function assessment(id: string, classId: string, subjectId: string, gradingPeriodId: string) {
      run(
        `INSERT INTO assessment_templates (id,classId,subjectId,name,type,totalMarks,weight,date,createdAt,updatedAt)
         VALUES (?,?,?,?,'TEST',100,1,'2026-11-01',?,?)`,
        `tpl-${id}`, classId, subjectId, id, NOW, NOW,
      );
      run(
        `INSERT INTO assessments (id,templateId,classId,subjectId,gradingPeriodId,name,type,totalMarks,weight,date,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,'TEST',100,1,'2026-11-01',?,?)`,
        id, `tpl-${id}`, classId, subjectId, gradingPeriodId, id, NOW, NOW,
      );
    }
    function grade(id: string, assessmentId: string, classId: string, subjectId: string, gradingPeriodId: string) {
      run(
        `INSERT INTO grades (id,studentId,subjectId,assessmentId,marksObtained,classId,gradingPeriodId,isPublished,maxMarks,status,createdAt,updatedAt)
         VALUES (?,'st-1',?,?,80,?,?,0,100,'DRAFT',?,?)`,
        id, subjectId, assessmentId, classId, gradingPeriodId, NOW, NOW,
      );
    }
    const pair = (staffId: string, classId: string, subjectId: string) =>
      run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,version,updatedAt) VALUES (?,?,?,?,?,1,?)`, `cst-${staffId}-${classId}-${subjectId}`, classId, subjectId, staffId, NOW, NOW);
    const bySubject = (staffId: string, subjectId: string) =>
      run(`INSERT INTO subject_teachers (id,subjectId,staffId,assignedAt,version,updatedAt) VALUES (?,?,?,?,1,?)`, `st-${staffId}-${subjectId}`, subjectId, staffId, NOW, NOW);
    const classTeacher = (staffId: string, classId: string) =>
      run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,version,updatedAt) VALUES (?,?,?,1,?,1,?)`, `ct-${staffId}-${classId}`, classId, staffId, NOW, NOW);

    /** s-a: current year y-a (term t-a current, t-old past), last year y-past. */
    function seedSchool() {
      seedDistrict();
      yearOf('y-a', 's-a', 1);
      yearOf('y-past', 's-a', 0);
      termOf('t-a', 'y-a', 1);
      termOf('t-old', 'y-a', 0);
      termOf('t-past', 'y-past', 1);
      classIn('c-1', 's-a', 'y-a', 'GRADE_3');
      classIn('c-2', 's-a', 'y-a', 'GRADE_1');
      classIn('c-past', 's-a', 'y-past', 'GRADE_9');
      subjectIn('sj-m', 's-a', 'Mathematics');
      subjectIn('sj-e', 's-a', ' English ');
      period('gp-a', 's-a', 'y-a', 't-a');
      period('gp-old', 's-a', 'y-a', 't-old');
      period('gp-past', 's-a', 'y-past', 't-past');
    }

    it('lists active teaching staff of the district only', () => {
      seedSchool();
      teacherRow('t-1', 's-a');
      teacherRow('t-2', 's-a', { position: 'PRINCIPAL' });
      teacherRow('t-3', 's-a', { isActive: 0 });
      teacherRow('t-4', 's-other');
      teacherRow('t-5', 's-off');
      expect(readModel.listTeachers('d-1').map((t) => t.id)).toEqual(['t-1']);
    });

    it('reads subjects from both assignment tables, trimmed and distinct', () => {
      seedSchool();
      teacherRow('t-1', 's-a');
      bySubject('t-1', 'sj-m');
      pair('t-1', 'c-1', 'sj-e');
      pair('t-1', 'c-2', 'sj-m');
      expect(readModel.listTeachers('d-1')[0]).toMatchObject({
        subjects: ['English', 'Mathematics'],
        firstClassGrade: 'GRADE_1',
        unassigned: false,
      });
    });

    it('is unassigned with no class in the current year, even with a past one', () => {
      seedSchool();
      teacherRow('t-1', 's-a');
      classTeacher('t-1', 'c-past');
      expect(readModel.listTeachers('d-1')[0]).toMatchObject({ firstClassGrade: null, unassigned: true });
    });

    it('counts owned and ungraded current-term assessments by class pair or by subject', () => {
      seedSchool();
      teacherRow('t-pair', 's-a');
      teacherRow('t-subject', 's-a');
      teacherRow('t-none', 's-a');
      pair('t-pair', 'c-1', 'sj-m');
      bySubject('t-subject', 'sj-e');
      assessment('a-1', 'c-1', 'sj-m', 'gp-a'); // t-pair, ungraded
      assessment('a-2', 'c-2', 'sj-m', 'gp-a'); // other class: nobody's
      assessment('a-3', 'c-1', 'sj-e', 'gp-a'); // t-subject, graded
      assessment('a-4', 'c-2', 'sj-e', 'gp-a'); // t-subject, graded
      assessment('a-5', 'c-1', 'sj-m', 'gp-old'); // past term: ignored
      assessment('a-6', 'c-past', 'sj-e', 'gp-past'); // past year: ignored
      grade('g-1', 'a-3', 'c-1', 'sj-e', 'gp-a');
      grade('g-2', 'a-4', 'c-2', 'sj-e', 'gp-a');
      const rows = Object.fromEntries(
        readModel.listTeachers('d-1').map((t) => [t.id, [t.ownedAssessments, t.ungradedAssessments]]),
      );
      expect(rows).toEqual({ 't-pair': [1, 1], 't-subject': [2, 0], 't-none': [0, 0] });
    });

    it('takes the first class in grade order, not text order (KG first, GRADE_2 before GRADE_10)', () => {
      seedSchool();
      classIn('c-10', 's-a', 'y-a', 'GRADE_10');
      classIn('c-g2', 's-a', 'y-a', 'GRADE_2');
      classIn('c-kg', 's-a', 'y-a', 'KG');
      classIn('c-g1', 's-a', 'y-a', 'GRADE_1');
      teacherRow('t-1', 's-a', { lastName: 'A' });
      teacherRow('t-2', 's-a', { lastName: 'B' });
      classTeacher('t-1', 'c-10');
      classTeacher('t-1', 'c-g2');
      classTeacher('t-2', 'c-g1');
      classTeacher('t-2', 'c-kg');
      const rows = Object.fromEntries(readModel.listTeachers('d-1').map((t) => [t.id, t.firstClassGrade]));
      expect(rows).toEqual({ 't-1': 'GRADE_2', 't-2': 'KG' });
    });

    it('trims subject names as the server does (tabs and no-break spaces too)', () => {
      seedSchool();
      subjectIn('sj-tab', 's-a', 'Science\t');
      subjectIn('sj-nbsp', 's-a', ' Science');
      teacherRow('t-1', 's-a');
      bySubject('t-1', 'sj-tab');
      bySubject('t-1', 'sj-nbsp');
      expect(readModel.listTeachers('d-1')[0]!.subjects).toEqual(['Science']);
    });

    it('owns nothing through a class pair or subject at another school', () => {
      seedSchool();
      yearOf('y-b', 's-b', 1);
      termOf('t-b', 'y-b', 1);
      classIn('c-b', 's-b', 'y-b', 'GRADE_2');
      period('gp-b', 's-b', 'y-b', 't-b');
      teacherRow('t-1', 's-a');
      pair('t-1', 'c-b', 'sj-m');
      bySubject('t-1', 'sj-e');
      assessment('a-b1', 'c-b', 'sj-m', 'gp-b');
      assessment('a-b2', 'c-b', 'sj-e', 'gp-b');
      expect(readModel.listTeachers('d-1')[0]).toMatchObject({ ownedAssessments: 0, ungradedAssessments: 0 });
    });

    it('carries the approval status and school name', () => {
      seedSchool();
      teacherRow('t-1', 's-a', { approvalStatus: 'PENDING' });
      expect(readModel.listTeachers('d-1')[0]).toMatchObject({
        approvalStatus: 'PENDING',
        schoolId: 's-a',
        schoolName: 'Alpha',
        employeeNumber: 'E-t-1',
      });
    });

    it('looks grades up by assessment through an index', () => {
      const plan = (db.prepare(`EXPLAIN QUERY PLAN ${CURRENT_ASSESSMENTS_SQL}`).all('d-1') as { detail: string }[])
        .map((row) => row.detail)
        .join(String.fromCharCode(10));
      expect(plan).toMatch(/USING (COVERING )?INDEX idx_grades_assessment/);
    });
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
    // The plan, not the clock, is what proves there is no table scan: the
    // timing below is only a loose backstop for a much slower machine.
    const plan = (db.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) ${ATTENDANCE_SINCE}`).all('2026-10-17', 'd-1') as { detail: string }[])
      .map((row) => row.detail)
      .join(String.fromCharCode(10));
    // Either attendance index reads only the window (a district device holds
    // only its own district); what must never happen is a full scan.
    expect(plan).toMatch(/SEARCH a USING (COVERING )?INDEX idx_attendance_(class_)?date/);
    expect(plan).not.toMatch(/SCAN a(\s|$)/m);
    expect(elapsed).toBeLessThan(5000);
  }, 60_000);

  describe('district finance', () => {
    function yearRow(id: string, institutionId: string, isCurrent: number) {
      run(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,'2026-09-01','2027-07-01',?,'ACTIVE',1,?)`,
        id, institutionId, id, isCurrent, NOW,
      );
    }
    function obligation(id: string, institutionId: string, academicYearId: string, requiredAmount: number, totalPaid: number) {
      run(
        `INSERT INTO fee_obligations (id,studentId,feeRuleId,institutionId,academicYearId,termId,requiredAmount,totalPaid,status,createdBy,createdAt,updatedAt)
         VALUES (?,'st-1',?,?,?,'t-1',?,?,'PARTIALLY_PAID','u',?,?)`,
        id, `rule-${id}`, institutionId, academicYearId, requiredAmount, totalPaid, NOW, NOW,
      );
    }
    function payment(id: string, institutionId: string, amount: number, paidAt: string, isReversed = 0) {
      run(
        `INSERT INTO fee_payments (id,obligationId,studentId,institutionId,amount,method,receiptNumber,recordedBy,isReversed,paidAt,createdAt,updatedAt)
         VALUES (?,'o-1','st-1',?,?,'CASH',?,'u',?,?,?,?)`,
        id, institutionId, amount, `R-${id}`, isReversed, paidAt, NOW, NOW,
      );
    }
    function audit(id: string, entityType: string, timestamp: string) {
      run(
        `INSERT INTO audit_logs (id,userId,action,entityType,entityId,timestamp,actorName,actorScope)
         VALUES (?,'u-1','CREATE',?,?,?,'Ama Bursar','School')`,
        id, entityType, `ent-${id}`, timestamp,
      );
    }

    beforeEach(() => {
      district('d-1', 'Buchanan');
      district('d-2', 'Owensgrove');
      school('a', 'd-1');
      school('b', 'd-1');
      school('x', 'd-1', { isActive: 0 });
      school('o', 'd-2');
      yearRow('y-a', 'a', 1);
      yearRow('y-a-old', 'a', 0);
      yearRow('y-b', 'b', 1);
      yearRow('y-x', 'x', 1);
      yearRow('y-o', 'o', 1);
      obligation('o1', 'a', 'y-a', 100, 40);
      obligation('o2', 'a', 'y-a', 50, 50);
      obligation('o3', 'a', 'y-a-old', 999, 999);
      obligation('o4', 'b', 'y-b', 200, 0);
      obligation('o5', 'x', 'y-x', 70, 70);
      obligation('o6', 'o', 'y-o', 30, 30);
      payment('p1', 'a', 40, '2026-11-10T12:00:00.000Z');
      payment('p2', 'a', 50, '2026-11-12T12:00:00.000Z', 1);
      payment('p3', 'a', 25, '2026-11-14T12:00:00.000Z');
      run(
        `INSERT INTO fee_payment_reversals (id,paymentId,institutionId,reason,reversedBy,reversedAt,createdAt,updatedAt)
         VALUES ('r-1','p3','a','Wrong amount','u',?,?,?)`,
        NOW, NOW, NOW,
      );
      payment('p4', 'a', 30, '2026-06-15T12:00:00.000Z');
      payment('p5', 'o', 9, '2026-11-15T12:00:00.000Z');
      payment('p6', 'x', 7, '2026-11-15T12:00:00.000Z');
    });

    it("sums each active school's current-year obligations only", () => {
      expect(readModel.financeBySchool('d-1').sort((l, r) => l.institutionId.localeCompare(r.institutionId))).toEqual([
        { institutionId: 'a', allocation: 150, collected: 90 },
        { institutionId: 'b', allocation: 200, collected: 0 },
      ]);
    });

    it('takes the newest payment per school, skipping reversed ones and pending local reversals', () => {
      expect(readModel.lastPaymentBySchool('d-1')).toEqual([{ institutionId: 'a', paidAt: '2026-11-10T12:00:00.000Z' }]);
    });

    it('sums non-reversed payments per local month from the window start', () => {
      expect(readModel.paymentsByMonth('d-1', '2026-06-01T00:00:00.000Z')).toEqual([
        { month: '2026-06', amount: 30 },
        { month: '2026-11', amount: 40 },
      ]);
      expect(readModel.paymentsByMonth('d-1', '2026-07-01T00:00:00.000Z')).toEqual([{ month: '2026-11', amount: 40 }]);
    });

    it('lists the newest finance audit entries only', () => {
      audit('e1', 'feePayment', '2026-11-10T10:00:00.000Z');
      audit('e2', 'Student', '2026-11-16T10:00:00.000Z');
      audit('e3', 'feeRule', '2026-11-12T10:00:00.000Z');
      audit('e4', 'feeObligation', '2026-11-12T10:00:00.000Z');
      expect(readModel.listFinanceAudit(2)).toEqual([
        { id: 'e4', timestamp: '2026-11-12T10:00:00.000Z', actorName: 'Ama Bursar', action: 'CREATE', entityType: 'feeObligation', entityId: 'ent-e4' },
        { id: 'e3', timestamp: '2026-11-12T10:00:00.000Z', actorName: 'Ama Bursar', action: 'CREATE', entityType: 'feeRule', entityId: 'ent-e3' },
      ]);
      expect(readModel.listFinanceAudit(50).map((e) => e.id)).toEqual(['e4', 'e3', 'e1']);
    });
  });

  describe('message contacts', () => {
    const user = (id: string, firstName: string, lastName: string, isActive = 1) =>
      run(
        `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,photoUrl) VALUES (?,?,?,?,?,1,?,NULL)`,
        id, firstName, lastName, `${id}@x.lr`, isActive, NOW,
      );
    const org = (
      id: string,
      userId: string,
      role: string,
      opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isActive?: number } = {},
    ) =>
      run(
        `INSERT INTO user_organizations (id,userId,role,institutionId,countyId,districtId,isActive) VALUES (?,?,?,?,?,?,?)`,
        id, userId, role, opts.institutionId ?? null, opts.countyId ?? null, opts.districtId ?? null, opts.isActive ?? 1,
      );

    beforeEach(() => {
      district('d-1', 'Buchanan', 'county-1');
      district('d-2', 'Owensgrove', 'county-1');
      school('s-a', 'd-1', { name: 'Alpha' });
      school('s-o', 'd-2', { name: 'Other District School' });
      user('deo-1', 'Me', 'Self');
      org('o-me', 'deo-1', 'DEO', { districtId: 'd-1', countyId: 'county-1' });
      user('ceo-1', 'Cee', 'Oh');
      org('o-ceo', 'ceo-1', 'COUNTY_ADMIN', { countyId: 'county-1' });
      user('ceo-x', 'Far', 'County');
      org('o-ceo-x', 'ceo-x', 'COUNTY_ADMIN', { countyId: 'county-2' });
      user('ceo-gone', 'Old', 'Ceo');
      org('o-ceo-gone', 'ceo-gone', 'COUNTY_ADMIN', { countyId: 'county-1', isActive: 0 });
      user('adm-a', 'Ann', 'Admin');
      org('o-adm-a', 'adm-a', 'INSTITUTION_ADMIN', { institutionId: 's-a' });
      user('adm-d', 'Bea', 'Direct');
      org('o-adm-d', 'adm-d', 'INSTITUTION_ADMIN', { districtId: 'd-1' });
      user('adm-o', 'Out', 'Side');
      org('o-adm-o', 'adm-o', 'INSTITUTION_ADMIN', { institutionId: 's-o' });
      user('adm-off', 'Off', 'Line', 0);
      org('o-adm-off', 'adm-off', 'INSTITUTION_ADMIN', { institutionId: 's-a' });
      user('teacher', 'Tee', 'Cher');
      org('o-teacher', 'teacher', 'TEACHER', { institutionId: 's-a' });
    });

    it("lists the county's County Admin and the district's School Admins, active, without me, by name", () => {
      const contacts = readModel.listMessageContacts('d-1', 'deo-1');
      expect(contacts.map((c) => c.userId)).toEqual(['adm-a', 'adm-d', 'ceo-1']);
      expect(contacts[0]).toEqual({
        userId: 'adm-a',
        firstName: 'Ann',
        lastName: 'Admin',
        photoUrl: null,
        role: 'INSTITUTION_ADMIN',
        institutionId: 's-a',
        institutionName: 'Alpha',
        districtId: 'd-1',
        districtName: 'Buchanan',
      });
      expect(contacts[2]).toMatchObject({ role: 'COUNTY_ADMIN', institutionId: null, districtId: null });
    });

    it('keeps one organisation per person, the lowest id', () => {
      org('o-adm-a-2', 'adm-a', 'INSTITUTION_ADMIN', { districtId: 'd-1' });
      expect(readModel.listMessageContacts('d-1', 'deo-1').filter((c) => c.userId === 'adm-a')).toHaveLength(1);
    });

    it("reads the signed-in user's synced profile, null when the row is missing", () => {
      run("UPDATE users SET phoneNumber = '0770000000' WHERE id = 'deo-1'");
      expect(readModel.getUserProfile('deo-1')).toEqual({
        firstName: 'Me',
        lastName: 'Self',
        email: 'deo-1@x.lr',
        phoneNumber: '0770000000',
      });
      expect(readModel.getUserProfile('nobody')).toBeNull();
    });

    it('has no County Admin when the district row is missing', () => {
      expect(readModel.listMessageContacts('d-unknown', 'deo-1')).toEqual([]);
    });
  });
  describe('school detail reads', () => {
    it('getSchoolProfile joins trimmed address parts and reads an integer establishedYear', () => {
      school('s-a', 'd-1', { street: '  ', communityTown: 'Sinkor', details: '{"establishedYear":1998}' });
      expect(readModel.getSchoolProfile('s-a')).toEqual({ address: 'Sinkor', establishedYear: 1998 });
    });

    it('getSchoolProfile gives nulls for no address and a non-integer year', () => {
      school('s-a', 'd-1', { details: '{"establishedYear":"1998"}' });
      expect(readModel.getSchoolProfile('s-a')).toEqual({ address: null, establishedYear: null });
    });

    it('getSchoolProfile is null for an unknown id', () => {
      expect(readModel.getSchoolProfile('nope')).toBeNull();
    });

    it('countSchoolStudentsByGender counts active students of one school', () => {
      school('s-a', 'd-1');
      school('s-b', 'd-1');
      student('s-a', { gender: 'MALE' });
      student('s-a', { gender: 'MALE' });
      student('s-a', { gender: 'FEMALE' });
      student('s-a', { gender: 'OTHER' });
      student('s-a', { gender: 'FEMALE', isActive: 0 });
      student('s-b', { gender: 'MALE' });
      const rows = [...readModel.countSchoolStudentsByGender('s-a')].sort((a, b) => a.gender.localeCompare(b.gender));
      expect(rows).toEqual([
        { gender: 'FEMALE', count: 1 },
        { gender: 'MALE', count: 2 },
        { gender: 'OTHER', count: 1 },
      ]);
    });

    it('countSchoolStudentsByGrade orders by GradeLevel with null last', () => {
      school('s-a', 'd-1');
      student('s-a', { gradeLevel: 'GRADE_10' });
      student('s-a', { gradeLevel: 'GRADE_2' });
      student('s-a', { gradeLevel: 'GRADE_2' });
      student('s-a', { gradeLevel: null });
      student('s-a', { gradeLevel: 'KG' });
      student('s-a', { gradeLevel: 'GRADE_1', isActive: 0 });
      expect(readModel.countSchoolStudentsByGrade('s-a')).toEqual([
        { gradeLevel: 'KG', students: 1 },
        { gradeLevel: 'GRADE_2', students: 2 },
        { gradeLevel: 'GRADE_10', students: 1 },
        { gradeLevel: null, students: 1 },
      ]);
    });
  });
});
