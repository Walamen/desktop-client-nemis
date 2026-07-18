import type { ApplicationResponse } from '../core/response';
import type {
  ClassRosterOutput,
  EnrollStudentDto,
  EnrollmentOutput,
  GetClassRosterDto,
  WithdrawEnrollmentDto,
} from '../dto/academics/academics-dto';
import type { EnrollStudentUseCase } from '../use-cases/academics/enroll-student';
import type { WithdrawEnrollmentUseCase } from '../use-cases/academics/withdraw-enrollment';
import type { GetClassRosterUseCase } from '../use-cases/academics/get-class-roster';

export interface AcademicsApplicationServiceDeps {
  enroll: EnrollStudentUseCase;
  withdraw: WithdrawEnrollmentUseCase;
  getClassRoster: GetClassRosterUseCase;
}

export class AcademicsApplicationService {
  constructor(private readonly deps: AcademicsApplicationServiceDeps) {}
  enroll(dto: EnrollStudentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.enroll.execute(dto);
  }
  withdraw(dto: WithdrawEnrollmentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return this.deps.withdraw.execute(dto);
  }
  getClassRoster(dto: GetClassRosterDto): Promise<ApplicationResponse<ClassRosterOutput>> {
    return this.deps.getClassRoster.execute(dto);
  }
}
