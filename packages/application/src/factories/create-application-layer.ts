import type { IStudentRepository } from '../interfaces/students/student-repository';
import type { IGuardianRepository } from '../interfaces/students/guardian-repository';
import type { IEnrollmentRepository } from '../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../interfaces/academics/class-repository';
import type { IAcademicYearRepository } from '../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../interfaces/academics/term-repository';
import type { ISubjectRepository } from '../interfaces/academics/subject-repository';
import type { IAttendanceRepository } from '../interfaces/attendance/attendance-repository';
import type { IAssessmentRepository } from '../interfaces/assessments/assessment-repository';
import type { IGradeRepository } from '../interfaces/assessments/grade-repository';
import type { IUserRepository } from '../interfaces/identity/user-repository';
import type { IInstitutionRepository } from '../interfaces/institution/institution-repository';
import type { IGradingConfigRepository } from '../interfaces/institution/grading-config-repository';
import type { IDeviceGateway } from '../interfaces/infra/device-gateway';
import type { ISettingsGateway } from '../interfaces/infra/settings-gateway';
import type { IUnitOfWork } from '../interfaces/unit-of-work';
import type { IClock } from '../interfaces/clock';
import type { IIdGenerator } from '../interfaces/id-generator';
import type { IEventPublisher } from '../interfaces/event-publisher';
import type { IAppLogger } from '../interfaces/app-logger';
import type { ITeacherRepository } from '../interfaces/teachers';
import type { ITimetableRepository } from '../interfaces/timetables';

import { CreateStudentUseCase } from '../use-cases/students/create-student';
import { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import { ListStudentsUseCase } from '../use-cases/students/list-students';
import { StudentApplicationService } from '../services/student-application-service';
import { UpdateStudentUseCase } from '../use-cases/students/update-student';
import { SetStudentActiveUseCase } from '../use-cases/students/set-student-active';
import { CreateGuardianUseCase } from '../use-cases/students/create-guardian';
import { ListStudentEnrollmentsUseCase } from '../use-cases/students/list-student-enrollments';

import { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import { MoveEnrollmentClassUseCase } from '../use-cases/academics/move-enrollment-class';
import { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';
import { ListAcademicYearsUseCase } from '../use-cases/academics/list-academic-years';
import { CreateAcademicYearUseCase } from '../use-cases/academics/create-academic-year';
import { UpdateAcademicYearUseCase } from '../use-cases/academics/update-academic-year';
import { SetCurrentAcademicYearUseCase } from '../use-cases/academics/set-current-academic-year';
import { SetAcademicYearStatusUseCase } from '../use-cases/academics/set-academic-year-status';
import { ListTermsUseCase } from '../use-cases/academics/list-terms';
import { GetCurrentTermUseCase } from '../use-cases/academics/get-current-term';
import { CreateTermUseCase } from '../use-cases/academics/create-term';
import { UpdateTermUseCase } from '../use-cases/academics/update-term';
import { SetCurrentTermUseCase } from '../use-cases/academics/set-current-term';
import { DeleteTermUseCase } from '../use-cases/academics/delete-term';
import { ListClassesUseCase } from '../use-cases/academics/list-classes';
import { CreateClassUseCase } from '../use-cases/academics/create-class';
import { UpdateClassUseCase } from '../use-cases/academics/update-class';
import { SetClassActiveUseCase } from '../use-cases/academics/set-class-active';
import { GetGradeLevelCountsUseCase } from '../use-cases/academics/get-grade-level-counts';
import { ListSubjectsUseCase } from '../use-cases/academics/list-subjects';
import { CreateSubjectUseCase } from '../use-cases/academics/create-subject';
import { UpdateSubjectUseCase } from '../use-cases/academics/update-subject';
import { SetSubjectActiveUseCase } from '../use-cases/academics/set-subject-active';
import { ListClassSubjectsUseCase } from '../use-cases/academics/list-class-subjects';
import { AssignSubjectToClassUseCase } from '../use-cases/academics/assign-subject-to-class';
import { UnassignSubjectFromClassUseCase } from '../use-cases/academics/unassign-subject-from-class';
import { AcademicsApplicationService } from '../services/academics-application-service';

import { RecordAttendanceUseCase } from '../use-cases/attendance/record-attendance';
import { GetAttendanceByClassAndDateUseCase } from '../use-cases/attendance/get-attendance-by-class-and-date';
import { AttendanceApplicationService } from '../services/attendance-application-service';

import { CreateAssessmentUseCase } from '../use-cases/assessments/create-assessment';
import { RecordGradeUseCase } from '../use-cases/assessments/record-grade';
import { PublishGradeUseCase } from '../use-cases/assessments/publish-grade';
import { GetGradesByStudentUseCase } from '../use-cases/assessments/get-grades-by-student';
import { AssessmentsApplicationService } from '../services/assessments-application-service';

import { GetUserByIdUseCase } from '../use-cases/identity/get-user-by-id';
import { GetCurrentUserUseCase } from '../use-cases/identity/get-current-user';
import { IdentityApplicationService } from '../services/identity-application-service';

import { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';
import { GetCurrentSchoolUseCase } from '../use-cases/institution/get-current-school';
import { InstitutionApplicationService } from '../services/institution-application-service';

import { RegisterDeviceUseCase } from '../use-cases/infra/register-device';
import { UpdateSettingsUseCase } from '../use-cases/infra/update-settings';
import { GetDeviceInformationUseCase } from '../use-cases/infra/get-device-information';
import { InfraApplicationService } from '../services/infra-application-service';

import { GetCurrentAcademicYearUseCase } from '../use-cases/academics/get-current-academic-year';
import { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';
import { GetStudentStatisticsUseCase } from '../use-cases/reporting/get-student-statistics';
import { ReportingApplicationService } from '../services/reporting-application-service';
import {
  ArchiveTeacherUseCase,
  AssignTeacherUseCase,
  CreateTeacherUseCase,
  GetTeacherDashboardUseCase,
  GetTeacherProfileUseCase,
  GetTeachingAssignmentsUseCase,
  RemoveAssignmentUseCase,
  RestoreTeacherUseCase,
  SearchTeachersUseCase,
  SetTeacherActiveUseCase,
  UpdateAssignmentUseCase,
  UpdateTeacherUseCase,
} from '../use-cases/teachers/teacher-use-cases';
import { TeacherApplicationService } from '../services/teacher-application-service';
import {
  CopyTimetable,
  CreateTimetable,
  DeleteTimetable,
  DetectScheduleConflicts,
  GetTimetableDashboard,
  GetTimetablePeriods,
  SearchTimetables,
  UpdateTimetable,
  ValidateTimetable,
} from '../use-cases/timetables/timetable-use-cases';
import { TimetableApplicationService } from '../services/timetable-application-service';

export interface ApplicationPorts {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  academicYears: IAcademicYearRepository;
  terms: ITermRepository;
  subjects: ISubjectRepository;
  attendance: IAttendanceRepository;
  assessments: IAssessmentRepository;
  grades: IGradeRepository;
  users: IUserRepository;
  institutions: IInstitutionRepository;
  gradingConfigs: IGradingConfigRepository;
  /** The authenticated user's id for this workspace (see GetCurrentUserDeps). */
  currentUserId: string;
  deviceGateway: IDeviceGateway;
  settingsGateway: ISettingsGateway;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
  teachers: ITeacherRepository;
  timetables: ITimetableRepository;
}

export interface ApplicationLayer {
  students: StudentApplicationService;
  academics: AcademicsApplicationService;
  attendance: AttendanceApplicationService;
  assessments: AssessmentsApplicationService;
  identity: IdentityApplicationService;
  institution: InstitutionApplicationService;
  infra: InfraApplicationService;
  reporting: ReportingApplicationService;
  teachers: TeacherApplicationService;
  timetables: TimetableApplicationService;
}

/** Composition root: constructs every use case from injected ports and groups
 * them into application services. The Electron app calls this once with real
 * adapters; tests call it with in-memory fakes. */
export function createApplicationLayer(ports: ApplicationPorts): ApplicationLayer {
  const { unitOfWork, clock, ids, events, logger } = ports;

  const students = new StudentApplicationService({
    create: new CreateStudentUseCase({
      students: ports.students,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    deactivate: new DeactivateStudentUseCase({
      students: ports.students,
      unitOfWork,
      clock,
      logger,
    }),
    linkGuardian: new LinkGuardianToStudentUseCase({
      students: ports.students,
      guardians: ports.guardians,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    getById: new GetStudentByIdUseCase({ students: ports.students, logger }),
    list: new ListStudentsUseCase({ students: ports.students, logger }),
    update: new UpdateStudentUseCase({ students: ports.students, unitOfWork, clock, logger }),
    setActive: new SetStudentActiveUseCase({ students: ports.students, unitOfWork, clock, logger }),
    createGuardian: new CreateGuardianUseCase({ students: ports.students, guardians: ports.guardians, unitOfWork, clock, ids, logger }),
    listEnrollments: new ListStudentEnrollmentsUseCase({ enrollments: ports.enrollments, logger }),
  });

  const academics = new AcademicsApplicationService({
    enroll: new EnrollStudentUseCase({
      enrollments: ports.enrollments,
      classes: ports.classes,
      students: ports.students,
      academicYears: ports.academicYears,
      terms: ports.terms,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    withdraw: new WithdrawEnrollmentUseCase({
      enrollments: ports.enrollments,
      unitOfWork,
      clock,
      logger,
    }),
    moveEnrollmentClass: new MoveEnrollmentClassUseCase({
      enrollments: ports.enrollments,
      classes: ports.classes,
      unitOfWork,
      clock,
      logger,
    }),
    getClassRoster: new GetClassRosterUseCase({ enrollments: ports.enrollments, logger }),
    getCurrentAcademicYear: new GetCurrentAcademicYearUseCase({ academicYears: ports.academicYears, logger }),
    listAcademicYears: new ListAcademicYearsUseCase({ academicYears: ports.academicYears, logger }),
    createAcademicYear: new CreateAcademicYearUseCase({
      academicYears: ports.academicYears,
      institutions: ports.institutions,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    updateAcademicYear: new UpdateAcademicYearUseCase({
      academicYears: ports.academicYears,
      unitOfWork,
      clock,
      logger,
    }),
    setCurrentAcademicYear: new SetCurrentAcademicYearUseCase({
      academicYears: ports.academicYears,
      unitOfWork,
      clock,
      logger,
    }),
    setAcademicYearStatus: new SetAcademicYearStatusUseCase({
      academicYears: ports.academicYears,
      unitOfWork,
      clock,
      logger,
    }),
    listTerms: new ListTermsUseCase({ terms: ports.terms, logger }),
    getCurrentTerm: new GetCurrentTermUseCase({ terms: ports.terms, logger }),
    createTerm: new CreateTermUseCase({
      terms: ports.terms,
      academicYears: ports.academicYears,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    updateTerm: new UpdateTermUseCase({
      terms: ports.terms,
      academicYears: ports.academicYears,
      unitOfWork,
      clock,
      logger,
    }),
    setCurrentTerm: new SetCurrentTermUseCase({ terms: ports.terms, unitOfWork, clock, logger }),
    deleteTerm: new DeleteTermUseCase({ terms: ports.terms, unitOfWork, logger }),
    listClasses: new ListClassesUseCase({ classes: ports.classes, logger }),
    createClass: new CreateClassUseCase({
      classes: ports.classes,
      academicYears: ports.academicYears,
      institutions: ports.institutions,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    updateClass: new UpdateClassUseCase({ classes: ports.classes, unitOfWork, clock, logger }),
    setClassActive: new SetClassActiveUseCase({ classes: ports.classes, unitOfWork, clock, logger }),
    getGradeLevelCounts: new GetGradeLevelCountsUseCase({ classes: ports.classes, logger }),
    listSubjects: new ListSubjectsUseCase({ subjects: ports.subjects, logger }),
    createSubject: new CreateSubjectUseCase({
      subjects: ports.subjects,
      institutions: ports.institutions,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    updateSubject: new UpdateSubjectUseCase({ subjects: ports.subjects, unitOfWork, clock, logger }),
    setSubjectActive: new SetSubjectActiveUseCase({
      subjects: ports.subjects,
      unitOfWork,
      clock,
      logger,
    }),
    listClassSubjects: new ListClassSubjectsUseCase({ subjects: ports.subjects, logger }),
    assignSubjectToClass: new AssignSubjectToClassUseCase({
      classes: ports.classes,
      subjects: ports.subjects,
      unitOfWork,
      clock,
      ids,
      logger,
    }),
    unassignSubjectFromClass: new UnassignSubjectFromClassUseCase({
      subjects: ports.subjects,
      unitOfWork,
      logger,
    }),
  });

  const attendance = new AttendanceApplicationService({
    record: new RecordAttendanceUseCase({
      attendance: ports.attendance,
      students: ports.students,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    getByClassAndDate: new GetAttendanceByClassAndDateUseCase({
      attendance: ports.attendance,
      logger,
    }),
  });

  const assessments = new AssessmentsApplicationService({
    createAssessment: new CreateAssessmentUseCase({
      assessments: ports.assessments,
      unitOfWork,
      clock,
      ids,
      events,
      logger,
    }),
    recordGrade: new RecordGradeUseCase({ grades: ports.grades, unitOfWork, clock, ids, logger }),
    publishGrade: new PublishGradeUseCase({
      grades: ports.grades,
      unitOfWork,
      clock,
      events,
      logger,
    }),
    getGradesByStudent: new GetGradesByStudentUseCase({ grades: ports.grades, logger }),
  });

  const identity = new IdentityApplicationService({
    getUserById: new GetUserByIdUseCase({ users: ports.users, logger }),
    getCurrentUser: new GetCurrentUserUseCase({
      users: ports.users,
      logger,
      currentUserId: ports.currentUserId,
    }),
  });

  const institution = new InstitutionApplicationService({
    getProfile: new GetInstitutionProfileUseCase({ institutions: ports.institutions, logger }),
    updateGradingConfig: new UpdateGradingConfigUseCase({
      configs: ports.gradingConfigs,
      unitOfWork,
      logger,
    }),
    getCurrentSchool: new GetCurrentSchoolUseCase({ institutions: ports.institutions, logger }),
  });

  const infra = new InfraApplicationService({
    registerDevice: new RegisterDeviceUseCase({
      deviceGateway: ports.deviceGateway,
      clock,
      events,
      logger,
    }),
    updateSettings: new UpdateSettingsUseCase({
      settingsGateway: ports.settingsGateway,
      clock,
      events,
      logger,
    }),
    getDeviceInfo: new GetDeviceInformationUseCase({ deviceGateway: ports.deviceGateway, logger }),
  });

  const reporting = new ReportingApplicationService({
    getDashboardOverview: new GetDashboardOverviewUseCase({
      students: ports.students,
      classes: ports.classes,
      subjects: ports.subjects,
      attendance: ports.attendance,
      clock,
      logger,
    }),
    getStudentStatistics: new GetStudentStatisticsUseCase({
      students: ports.students,
      clock,
      logger,
    }),
  });

  const teacherDeps = { teachers: ports.teachers, clock, logger };
  const archiveTeacher = new ArchiveTeacherUseCase(teacherDeps);
  const restoreTeacher = new RestoreTeacherUseCase(teacherDeps);
  const teachers = new TeacherApplicationService({
    create: new CreateTeacherUseCase({ ...teacherDeps, ids }),
    update: new UpdateTeacherUseCase(teacherDeps),
    setActive: new SetTeacherActiveUseCase(archiveTeacher, restoreTeacher),
    search: new SearchTeachersUseCase({ teachers: ports.teachers, logger }),
    getProfile: new GetTeacherProfileUseCase({ teachers: ports.teachers, logger }),
    getAssignments: new GetTeachingAssignmentsUseCase({ teachers: ports.teachers, logger }),
    assign: new AssignTeacherUseCase({ ...teacherDeps, ids, classes: ports.classes, subjects: ports.subjects }),
    updateAssignment: new UpdateAssignmentUseCase({ ...teacherDeps, subjects: ports.subjects }),
    removeAssignment: new RemoveAssignmentUseCase({ teachers: ports.teachers, logger }),
    dashboard: new GetTeacherDashboardUseCase({ teachers: ports.teachers, logger }),
  });

  const timetableDeps = { timetables: ports.timetables, clock, ids, logger };
  const timetables = new TimetableApplicationService({
    create: new CreateTimetable(timetableDeps),
    update: new UpdateTimetable(timetableDeps),
    delete: new DeleteTimetable({ timetables: ports.timetables, logger }),
    copy: new CopyTimetable(timetableDeps),
    search: new SearchTimetables({ timetables: ports.timetables, logger }),
    validate: new ValidateTimetable(timetableDeps),
    conflicts: new DetectScheduleConflicts({ timetables: ports.timetables, logger }),
    periods: new GetTimetablePeriods({ timetables: ports.timetables, logger }),
    dashboard: new GetTimetableDashboard({ timetables: ports.timetables, clock, logger }),
  });

  return { students, academics, attendance, assessments, identity, institution, infra, reporting, teachers, timetables };
}
