import type { ApplicationResponse } from '../core/response';
import type { PagedResult } from '../core/pagination';
import type {
  CreateStudentDto,
  CreateGuardianDto,
  DeactivateStudentDto,
  LinkGuardianDto,
  ListStudentsDto,
  StudentOutput,
  StudentSummaryOutput,
  UpdateStudentDto,
  SetStudentActiveDto,
} from '../dto/students/student-dto';
import type { CreateStudentUseCase } from '../use-cases/students/create-student';
import type { DeactivateStudentUseCase } from '../use-cases/students/deactivate-student';
import type { LinkGuardianToStudentUseCase } from '../use-cases/students/link-guardian-to-student';
import type { GetStudentByIdUseCase } from '../use-cases/students/get-student-by-id';
import type { ListStudentsUseCase } from '../use-cases/students/list-students';
import type { UpdateStudentUseCase } from '../use-cases/students/update-student';
import type { SetStudentActiveUseCase } from '../use-cases/students/set-student-active';
import type { CreateGuardianUseCase } from '../use-cases/students/create-guardian';
import type { ListStudentEnrollmentsUseCase } from '../use-cases/students/list-student-enrollments';
import type { EnrollmentOutput } from '../dto/academics/academics-dto';

/** Optional façade grouping the student use cases for consumer convenience.
 * Holds no logic — every method delegates to a use case. */
export interface StudentApplicationServiceDeps {
  create: CreateStudentUseCase;
  deactivate?: DeactivateStudentUseCase;
  linkGuardian?: LinkGuardianToStudentUseCase;
  getById: GetStudentByIdUseCase;
  list?: ListStudentsUseCase;
  update?: UpdateStudentUseCase;
  setActive?: SetStudentActiveUseCase;
  createGuardian?: CreateGuardianUseCase;
  listEnrollments?: ListStudentEnrollmentsUseCase;
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
  update(dto: UpdateStudentDto): Promise<ApplicationResponse<StudentOutput>> { if (!this.deps.update) throw new Error('update use case not configured'); return this.deps.update.execute(dto); }
  setActive(dto: SetStudentActiveDto): Promise<ApplicationResponse<StudentOutput>> { if (!this.deps.setActive) throw new Error('setActive use case not configured'); return this.deps.setActive.execute(dto); }
  createGuardian(dto: CreateGuardianDto): Promise<ApplicationResponse<StudentOutput>> { if (!this.deps.createGuardian) throw new Error('createGuardian use case not configured'); return this.deps.createGuardian.execute(dto); }
  listEnrollments(studentId:string):Promise<ApplicationResponse<EnrollmentOutput[]>>{if(!this.deps.listEnrollments)throw new Error('listEnrollments use case not configured');return this.deps.listEnrollments.execute({studentId});}
}
