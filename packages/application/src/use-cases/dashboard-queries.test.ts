import { describe, expect, it } from 'vitest';
import {
  AcademicYear,
  Attendance,
  Class,
  Student,
  User,
  UserOrganization,
} from '@nemis-desktop/domain';
import { AttendanceStatus, SystemRole } from '@nemis-desktop/types';
import { FixedClock } from '../testing/fixed-clock';
import { RecordingLogger } from '../testing/recording-logger';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import { InMemoryClassRepository } from '../testing/academics/in-memory-class-repository';
import { InMemorySubjectRepository } from '../testing/academics/in-memory-subject-repository';
import { InMemoryAttendanceRepository } from '../testing/attendance/in-memory-attendance-repository';
import { InMemoryAcademicYearRepository } from '../testing/academics/in-memory-academic-year-repository';
import { InMemoryInstitutionRepository } from '../testing/institution/in-memory-institution-repository';
import { InMemoryUserRepository } from '../testing/identity/in-memory-user-repository';
import { InMemoryDeviceGateway } from '../testing/infra/in-memory-device-gateway';
import { GetDashboardOverviewUseCase } from './reporting/get-dashboard-overview';
import { GetCurrentAcademicYearUseCase } from './academics/get-current-academic-year';
import { GetCurrentUserUseCase } from './identity/get-current-user';
import { GetCurrentSchoolUseCase } from './institution/get-current-school';
import { GetDeviceInformationUseCase } from './infra/get-device-information';

const logger = new RecordingLogger();

describe('dashboard query use cases', () => {
  it('GetDashboardOverview composes real counts and today attendance', async () => {
    const students = new InMemoryStudentRepository();
    const classes = new InMemoryClassRepository();
    const subjects = new InMemorySubjectRepository();
    const attendance = new InMemoryAttendanceRepository();
    students.save(
      Student.create({
        id: 's-1', institutionId: 'inst-1', firstName: 'A', lastName: 'B',
        admissionNumber: 'ADM-1', dateOfBirth: '2015-01-01', gender: 'MALE',
        occurredAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    classes.store.set(
      'c-1',
      Class.reconstitute({
        id: 'c-1', institutionId: 'inst-1', academicYearId: 'ay-1', name: 'Grade 1 A',
        gradeLevel: 'GRADE_1', isActive: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    attendance.save(
      Attendance.record({
        id: 'a-1', studentId: 's-1', classId: 'c-1', date: '2026-07-20',
        status: AttendanceStatus.PRESENT, occurredAt: '2026-07-20T08:00:00.000Z',
      }),
    );
    const useCase = new GetDashboardOverviewUseCase({
      students, classes, subjects, attendance, clock: new FixedClock('2026-07-20T09:00:00.000Z'), logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({
      totalStudents: 1,
      totalClasses: 1,
      totalSubjects: 0,
      studentsByGrade: [],
      recentlyEnrolled: [{ id: 's-1', fullName: 'A B', admissionNumber: 'ADM-1', updatedAt: '2026-07-20T00:00:00.000Z' }],
      attendanceToday: { present: 1, total: 1 },
    });
  });

  it('GetDashboardOverview returns zeros on an empty installation', async () => {
    const useCase = new GetDashboardOverviewUseCase({
      students: new InMemoryStudentRepository(),
      classes: new InMemoryClassRepository(),
      subjects: new InMemorySubjectRepository(),
      attendance: new InMemoryAttendanceRepository(),
      clock: new FixedClock('2026-07-20T09:00:00.000Z'),
      logger,
    });
    const res = await useCase.execute({});
    expect(res.data).toEqual({
      totalStudents: 0,
      totalClasses: 0,
      totalSubjects: 0,
      studentsByGrade: [],
      recentlyEnrolled: [],
      attendanceToday: { present: 0, total: 0 },
    });
  });

  it('GetCurrentAcademicYear returns null when none configured, DTO when current', async () => {
    const years = new InMemoryAcademicYearRepository();
    const useCase = new GetCurrentAcademicYearUseCase({ academicYears: years, logger });
    expect((await useCase.execute({})).data).toBeNull();
    years.store.set(
      'ay-1',
      AcademicYear.reconstitute({
        id: 'ay-1', institutionId: 'inst-1', code: '2025/2026', start: '2025-09-01',
        end: '2026-07-31', isCurrent: true, version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect((await useCase.execute({})).data?.code).toBe('2025/2026');
  });

  it('GetCurrentUser returns the seeded user or null', async () => {
    const users = new InMemoryUserRepository();
    const useCase = new GetCurrentUserUseCase({ users, logger });
    expect((await useCase.execute({})).data).toBeNull();
    users.store.set(
      'usr-1',
      User.reconstitute({
        id: 'usr-1', firstName: 'Local', lastName: 'Admin', email: 'admin@local.nemis',
        isActive: true,
        organizations: [UserOrganization.reconstitute({ id: 'o-1', role: SystemRole.INSTITUTION_ADMIN, isActive: true })],
        version: 1, updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    );
    expect((await useCase.execute({})).data?.fullName).toBe('Local Admin');
  });

  it('GetCurrentSchool returns null when no institution exists', async () => {
    const useCase = new GetCurrentSchoolUseCase({ institutions: new InMemoryInstitutionRepository(), logger });
    expect((await useCase.execute({})).data).toBeNull();
  });

  it('GetDeviceInformation returns the current device or null', async () => {
    const deviceGateway = new InMemoryDeviceGateway();
    const useCase = new GetDeviceInformationUseCase({ deviceGateway, logger });
    expect((await useCase.execute({})).data).toBeNull();
    deviceGateway.register({ deviceName: 'lab', platform: 'win32', osVersion: '10', appVersion: '1.0.0' });
    expect((await useCase.execute({})).data?.deviceName).toBe('lab');
  });
});
