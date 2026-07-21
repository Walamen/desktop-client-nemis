import {
  CollectingEventPublisher,
  FixedClock,
  InMemoryAcademicYearRepository,
  InMemoryAssessmentRepository,
  InMemoryAttendanceRepository,
  InMemoryClassRepository,
  InMemoryDeviceGateway,
  InMemoryEnrollmentRepository,
  InMemoryGradeRepository,
  InMemoryGradingConfigRepository,
  InMemoryGuardianRepository,
  InMemoryInstitutionRepository,
  InMemorySettingsGateway,
  InMemoryStudentRepository,
  InMemorySubjectRepository,
  InMemoryTermRepository,
  InMemoryUserRepository,
  PassthroughUnitOfWork,
  RecordingLogger,
  SequentialIdGenerator,
  createApplicationLayer,
  type ApplicationLayer,
} from '@nemis-desktop/application';

/** Concrete fake types so tests can seed via the exposed `.store` maps. */
export interface TestPorts {
  students: InMemoryStudentRepository;
  guardians: InMemoryGuardianRepository;
  enrollments: InMemoryEnrollmentRepository;
  classes: InMemoryClassRepository;
  academicYears: InMemoryAcademicYearRepository;
  terms: InMemoryTermRepository;
  subjects: InMemorySubjectRepository;
  attendance: InMemoryAttendanceRepository;
  assessments: InMemoryAssessmentRepository;
  grades: InMemoryGradeRepository;
  users: InMemoryUserRepository;
  institutions: InMemoryInstitutionRepository;
  gradingConfigs: InMemoryGradingConfigRepository;
  deviceGateway: InMemoryDeviceGateway;
  settingsGateway: InMemorySettingsGateway;
  unitOfWork: PassthroughUnitOfWork;
  clock: FixedClock;
  ids: SequentialIdGenerator;
  events: CollectingEventPublisher;
  logger: RecordingLogger;
}

/** Builds the REAL Phase-5 application layer over in-memory fakes so
 * presentation tests exercise the full presentation→application path
 * without SQLite. */
export function createTestApplication(): { app: ApplicationLayer; ports: TestPorts } {
  const subjects = new InMemorySubjectRepository();
  const classes = new InMemoryClassRepository(subjects);
  const terms = new InMemoryTermRepository();
  const academicYears = new InMemoryAcademicYearRepository(terms, classes);
  const ports: TestPorts = {
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
    deviceGateway: new InMemoryDeviceGateway(),
    settingsGateway: new InMemorySettingsGateway(),
    unitOfWork: new PassthroughUnitOfWork(),
    clock: new FixedClock('2026-07-19T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    events: new CollectingEventPublisher(),
    logger: new RecordingLogger(),
  };
  return { app: createApplicationLayer(ports), ports };
}
