import type { ApplicationResponse } from '../core/response';
import type { PagedResult } from '../core/pagination';
import type {
  CreateStudentDto,
  DeactivateStudentDto,
  LinkGuardianDto,
  ListStudentsDto,
  StudentOutput,
  StudentSummaryOutput,
} from '../dto/students/student-dto';
import type { CreateStudentUseCase } from '../use-cases/students/create-student';
import type { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import type { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import type { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import type { ListStudentsUseCase } from '../use-cases/students/list-students';

/** Optional façade grouping the student use cases for consumer convenience.
 * Holds no logic — every method delegates to a use case. */
export interface StudentApplicationServiceDeps {
  create: CreateStudentUseCase;
  deactivate?: DeactivateStudentUseCase;
  linkGuardian?: LinkGuardianToStudentUseCase;
  getById: GetStudentByIdUseCase;
  list?: ListStudentsUseCase;
}

export class StudentApplicationService {
  constructor(private readonly deps: StudentApplicationServiceDeps) {}

  create(dto: CreateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return this.deps.create.execute(dto);
  }
  deactivate(dto: DeactivateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    if (!this.deps.deactivate) throw new Error('deactivate use case not configured');
    return this.deps.deactivate.execute(dto);
  }
  linkGuardian(dto: LinkGuardianDto): Promise<ApplicationResponse<StudentOutput>> {
    if (!this.deps.linkGuardian) throw new Error('linkGuardian use case not configured');
    return this.deps.linkGuardian.execute(dto);
  }
  getById(query: { studentId: string }): Promise<ApplicationResponse<StudentOutput | null>> {
    return this.deps.getById.execute(query);
  }
  list(dto: ListStudentsDto): Promise<ApplicationResponse<PagedResult<StudentSummaryOutput>>> {
    if (!this.deps.list) throw new Error('list use case not configured');
    return this.deps.list.execute(dto);
  }
}
