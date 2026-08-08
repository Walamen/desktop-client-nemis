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
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
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

  it('has no user, school, or academic year before authenticated provisioning', async () => {
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
    expect((await app.identity.getCurrentUser()).data).toBeNull();
    expect((await app.institution.getCurrentSchool()).data).toBeNull();
    expect((await app.academics.getCurrentAcademicYear()).data).toBeNull();
  });

  it('device info reflects the seeded device', async () => {
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
    expect((await app.infra.getDeviceInfo()).data?.deviceName).toBe('business-e2e');
  });

  it('creating a student through the use case increments the overview count', async () => {
    const app = createApplicationComposition(dataLayer, 'test-user', silent);
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

  function seedInstitutionWith(id: string, code: string, name: string): void {
    manager.connection
      .prepare(
        `INSERT INTO institutions (id, code, name, type, ownership, countyId, approvalStatus, version, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'county-1', 'APPROVED', 1, '2026-07-21T00:00:00.000Z')`,
      )
      .run(id, code, name, InstitutionType.SCHOOL, OwnershipType.GOVERNMENT);
  }

  function seedDistrict(id: string, name: string): void {
    manager.connection
      .prepare(`INSERT INTO districts (id, name, countyId) VALUES (?, ?, 'county-1')`)
      .run(id, name);
  }

  it('keeps institutions and student counts separated when a device holds more than one institution (County/DEO/Ministry scope)', async () => {
    // Two institutions land in the same local database — exactly what a
    // COUNTY_ADMIN device's sync snapshot produces (see
    // Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts
    // authorizedInstitutionIds), which the old findFirst()-only
    // IInstitutionRepository could never represent.
    seedInstitutionWith('inst-1', 'SCH-1', 'Monrovia Central');
    seedInstitutionWith('inst-2', 'SCH-2', 'Zorzor Elementary');
    seedDistrict('district-1', 'Greater Monrovia District');
    manager.connection
      .prepare(`UPDATE institutions SET districtId = 'district-1' WHERE id = 'inst-1'`)
      .run();

    const app = createApplicationComposition(dataLayer, 'test-user', silent);
    await app.students.create({
      institutionId: 'inst-1', firstName: 'Grace', lastName: 'Toe',
      admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });
    await app.students.create({
      institutionId: 'inst-1', firstName: 'John', lastName: 'Doe',
      admissionNumber: 'ADM-2', dateOfBirth: '2015-01-01', gender: Gender.MALE,
    });
    await app.students.create({
      institutionId: 'inst-2', firstName: 'Mary', lastName: 'Kollie',
      admissionNumber: 'ADM-3', dateOfBirth: '2015-01-01', gender: Gender.FEMALE,
    });

    const institutions = dataLayer.repositories.institutions.findAll();
    expect(institutions.map((i) => i.id).sort()).toEqual(['inst-1', 'inst-2']);

    const counts = dataLayer.repositories.students.countByInstitution();
    expect(counts).toContainEqual({ institutionId: 'inst-1', studentCount: 2 });
    expect(counts).toContainEqual({ institutionId: 'inst-2', studentCount: 1 });

    // Exercise the actual composed use case (ListInstitutionsUseCase), not just
    // the repositories directly — this is what proves the district-name join
    // and per-institution student counts work through the real application
    // layer over real SQLite, not merely at the repository layer.
    const listed = (await app.institution.listInstitutions()).data;
    const listedInst1 = listed.find((i) => i.id === 'inst-1');
    const listedInst2 = listed.find((i) => i.id === 'inst-2');
    expect(listedInst1).toMatchObject({ districtName: 'Greater Monrovia District', studentCount: 2 });
    expect(listedInst2).toMatchObject({ districtName: undefined, studentCount: 1 });
  });

  it('academic foundation: year -> term -> class -> subject -> assignment, real SQLite joins', async () => {
    seedInstitution();
    const app = createApplicationComposition(dataLayer, 'test-user', silent);

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
