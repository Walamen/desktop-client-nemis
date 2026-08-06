import { describe, expect, it } from 'vitest';
import { Gender } from '@nemis-desktop/types';
import { createApplicationLayer } from './create-application-layer';
import {
  CollectingEventPublisher,
  FixedClock,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
  InMemoryTimetableRepository,
} from '../testing';
import { InMemoryStudentRepository } from '../testing/students/in-memory-student-repository';
import { InMemoryGuardianRepository } from '../testing/students/in-memory-guardian-repository';
import { InMemoryEnrollmentRepository } from '../testing/academics/in-memory-enrollment-repository';
import { InMemoryClassRepository } from '../testing/academics/in-memory-class-repository';
import { InMemoryAcademicYearRepository } from '../testing/academics/in-memory-academic-year-repository';
import { InMemoryTermRepository } from '../testing/academics/in-memory-term-repository';
import { InMemorySubjectRepository } from '../testing/academics/in-memory-subject-repository';
import { InMemoryAttendanceRepository } from '../testing/attendance/in-memory-attendance-repository';
import { InMemoryAssessmentRepository } from '../testing/assessments/in-memory-assessment-repository';
import { InMemoryGradeRepository } from '../testing/assessments/in-memory-grade-repository';
import { InMemoryUserRepository } from '../testing/identity/in-memory-user-repository';
import { InMemoryInstitutionRepository } from '../testing/institution/in-memory-institution-repository';
import { InMemoryGradingConfigRepository } from '../testing/institution/in-memory-grading-config-repository';
import { InMemoryDeviceGateway } from '../testing/infra/in-memory-device-gateway';
import { InMemorySettingsGateway } from '../testing/infra/in-memory-settings-gateway';
import { InMemoryTeacherRepository } from '../testing/teachers/in-memory-teacher-repository';
import { InMemoryAssignmentRepository } from '../testing/assignments/in-memory-assignment-repository';
import { InMemoryAssignmentSubmissionRepository } from '../testing/assignments/in-memory-assignment-submission-repository';

function buildLayer() {
  const subjects = new InMemorySubjectRepository();
  const classes = new InMemoryClassRepository(subjects);
  const terms = new InMemoryTermRepository();
  const academicYears = new InMemoryAcademicYearRepository(terms, classes);
  return createApplicationLayer({
    students: new InMemoryStudentRepository(),
    guardians: new InMemoryGuardianRepository(),
    enrollments: new InMemoryEnrollmentRepository(),
    classes,
    academicYears,
    terms,
    subjects,
    attendance: new InMemoryAttendanceRepository(),
    assessments: new InMemoryAssessmentRepository(),
    grades: new InMemoryGradeRepository(),
    users: new InMemoryUserRepository(),
    institutions: new InMemoryInstitutionRepository(),
    gradingConfigs: new InMemoryGradingConfigRepository(),
    currentUserId: 'test-user',
    deviceGateway: new InMemoryDeviceGateway(),
    settingsGateway: new InMemorySettingsGateway(),
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    ids: new SequentialIdGenerator('stu'),
    events: new CollectingEventPublisher(),
    logger: new RecordingLogger(),
    teachers: new InMemoryTeacherRepository(),
    timetables: new InMemoryTimetableRepository(),
    assignments: new InMemoryAssignmentRepository(),
    assignmentSubmissions: new InMemoryAssignmentSubmissionRepository(),
  });
}

describe('createApplicationLayer', () => {
  it('assembles services that run a create → get flow end to end', async () => {
    const layer = buildLayer();
    const created = await layer.students.create({
      institutionId: 'inst-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      admissionNumber: 'ADM-001',
      dateOfBirth: '2015-06-01',
      gender: Gender.FEMALE,
    });
    const fetched = await layer.students.getById({ studentId: created.data.id });
    expect(fetched.data?.id).toBe(created.data.id);
  });

  it('exposes an infra service that registers a device', async () => {
    const layer = buildLayer();
    const res = await layer.infra.registerDevice({
      deviceName: 'lab-01',
      platform: 'win32',
      osVersion: '10.0',
      appVersion: '1.0.0',
    });
    expect(res.data.id).toBe('dev-1');
  });
});
