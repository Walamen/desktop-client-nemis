import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Gender, GradeLevel, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createDataLayer, type DataLayer } from '../factories/createDataLayer';
import { createApplicationComposition } from './createApplicationComposition';

const TEST_DEVICE = { deviceName: 'business-e2e', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };
const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe('business application layer end-to-end against real SQLite', () => {
  let directory: string;
  let manager: DatabaseManager;
  let dataLayer: DataLayer;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-business-e2e-'));
    manager = new DatabaseManager({ userDataDir: directory, device: TEST_DEVICE });
    manager.initialize();
    dataLayer = createDataLayer(manager, silent);
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('dashboard overview is all zeros on a fresh install', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    const res = await app.reporting.getDashboardOverview();
    expect(res.data).toEqual({
      totalStudents: 0,
      totalClasses: 0,
      totalSubjects: 0,
      studentsByGrade: [],
      recentlyEnrolled: [],
      attendanceToday: { present: 0, total: 0 },
    });
  });

  it('current user is the seeded Local Admin; school and academic year are null', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.identity.getCurrentUser()).data?.fullName).toBe('Local Admin');
    expect((await app.institution.getCurrentSchool()).data).toBeNull();
    expect((await app.academics.getCurrentAcademicYear()).data).toBeNull();
  });

  it('device info reflects the seeded device', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    expect((await app.infra.getDeviceInfo()).data?.deviceName).toBe('business-e2e');
  });

  it('creating a student through the use case increments the overview count', async () => {
    const app = createApplicationComposition(dataLayer, silent);
    await app.students.create({
      institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    expect((await app.reporting.getDashboardOverview()).data.totalStudents).toBe(1);
  });

  function seedInstitution(): void {
    manager.connection
      .prepare(
        `INSERT INTO institutions (id, code, name, type, ownership, countyId, approvalStatus, version, updatedAt)
         VALUES ('inst-1', 'SCH-1', 'Test School', ?, ?, 'county-1', 'APPROVED', 1, '2026-07-21T00:00:00.000Z')`,
      )
      .run(InstitutionType.SCHOOL, OwnershipType.GOVERNMENT);
  }

  it('academic foundation: year -> term -> class -> subject -> assignment, real SQLite joins', async () => {
    seedInstitution();
    const app = createApplicationComposition(dataLayer, silent);

    const year = await app.academics.createAcademicYear({
      code: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', makeCurrent: true,
    });
    expect(year.data.isCurrent).toBe(true);

    const term = await app.academics.createTerm({
      academicYearId: year.data.id, name: 'Term 1', startDate: '2025-09-01', endDate: '2025-12-19',
      makeCurrent: true,
    });
    expect(term.data.isCurrent).toBe(true);

    const klass = await app.academics.createClass({
      academicYearId: year.data.id, name: 'JSS1-A', gradeLevel: GradeLevel.GRADE_7, capacity: 40,
    });
    const subject = await app.academics.createSubject({ name: 'Mathematics', code: 'math' });
    expect(subject.data.code).toBe('MATH');

    const link = await app.academics.assignSubjectToClass({
      classId: klass.data.id, subjectId: subject.data.id,
    });
    expect(link.data.subjectCode).toBe('MATH');

    const years = await app.academics.listAcademicYears();
    expect(years.data[0]).toMatchObject({ termCount: 1, classCount: 1 });

    const classes = await app.academics.listClasses({ limit: 25, offset: 0 });
    expect(classes.data.items[0]).toMatchObject({ subjectCount: 1 });

    const subjects = await app.academics.listSubjects({ limit: 25, offset: 0 });
    expect(subjects.data.items[0]).toMatchObject({ classCount: 1 });

    const currentTerm = await app.academics.getCurrentTerm();
    expect(currentTerm.data?.id).toBe(term.data.id);

    const overview = await app.reporting.getDashboardOverview();
    expect(overview.data.totalClasses).toBe(1);
    expect(overview.data.totalSubjects).toBe(1);
  });
});
