import type { IStudentRepository } from '../interfaces/students/student-repository';
import type { IGuardianRepository } from '../interfaces/students/guardian-repository';
import type { IEnrollmentRepository } from '../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../interfaces/academics/class-repository';
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

import { CreateStudentUseCase } from '../use-cases/students/create-student';
import { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import { ListStudentsUseCase } from '../use-cases/students/list-students';
import { StudentApplicationService } from '../services/student-application-service';

import { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';
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
import { IdentityApplicationService } from '../services/identity-application-service';

import { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';
import { InstitutionApplicationService } from '../services/institution-application-service';

import { RegisterDeviceUseCase } from '../use-cases/infra/register-device';
import { UpdateSettingsUseCase } from '../use-cases/infra/update-settings';
import { InfraApplicationService } from '../services/infra-application-service';

export interface ApplicationPorts {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  attendance: IAttendanceRepository;
  assessments: IAssessmentRepository;
  grades: IGradeRepository;
  users: IUserRepository;
  institutions: IInstitutionRepository;
  gradingConfigs: IGradingConfigRepository;
  deviceGateway: IDeviceGateway;
  settingsGateway: ISettingsGateway;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export interface ApplicationLayer {
  students: StudentApplicationService;
  academics: AcademicsApplicationService;
  attendance: AttendanceApplicationService;
  assessments: AssessmentsApplicationService;
  identity: IdentityApplicationService;
  institution: InstitutionApplicationService;
  infra: InfraApplicationService;
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
  });

  const academics = new AcademicsApplicationService({
    enroll: new EnrollStudentUseCase({
      enrollments: ports.enrollments,
      classes: ports.classes,
      students: ports.students,
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
    getClassRoster: new GetClassRosterUseCase({ enrollments: ports.enrollments, logger }),
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
  });

  const institution = new InstitutionApplicationService({
    getProfile: new GetInstitutionProfileUseCase({ institutions: ports.institutions, logger }),
    updateGradingConfig: new UpdateGradingConfigUseCase({
      configs: ports.gradingConfigs,
      unitOfWork,
      logger,
    }),
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
  });

  return { students, academics, attendance, assessments, identity, institution, infra };
}
