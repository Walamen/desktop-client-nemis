import type { ApplicationResponse } from '../core/response';
import type {
  AssignmentOutput,
  AssignmentSubmissionOutput,
  CreateAssignmentDto,
  DeleteAssignmentDto,
  GetAssignmentDto,
  GradeSubmissionDto,
  ListAssignmentsDto,
  ListSubmissionsDto,
  UpdateAssignmentDto,
} from '../dto/assignments/assignment-dto';
import type { ListAssignmentsUseCase } from '../use-cases/assignments/list-assignments';
import type { GetAssignmentUseCase } from '../use-cases/assignments/get-assignment';
import type { CreateAssignmentUseCase } from '../use-cases/assignments/create-assignment';
import type { UpdateAssignmentUseCase } from '../use-cases/assignments/update-assignment';
import type { DeleteAssignmentUseCase } from '../use-cases/assignments/delete-assignment';
import type { ListSubmissionsUseCase } from '../use-cases/assignments/list-submissions';
import type { GradeSubmissionUseCase } from '../use-cases/assignments/grade-submission';

export interface AssignmentsApplicationServiceDeps {
  list: ListAssignmentsUseCase;
  get: GetAssignmentUseCase;
  create: CreateAssignmentUseCase;
  update: UpdateAssignmentUseCase;
  remove: DeleteAssignmentUseCase;
  listSubmissions: ListSubmissionsUseCase;
  gradeSubmission: GradeSubmissionUseCase;
}

export class AssignmentsApplicationService {
  constructor(private readonly deps: AssignmentsApplicationServiceDeps) {}

  list(dto: ListAssignmentsDto): Promise<ApplicationResponse<AssignmentOutput[]>> {
    return this.deps.list.execute(dto);
  }
  get(dto: GetAssignmentDto): Promise<ApplicationResponse<AssignmentOutput | null>> {
    return this.deps.get.execute(dto);
  }
  create(dto: CreateAssignmentDto): Promise<ApplicationResponse<AssignmentOutput>> {
    return this.deps.create.execute(dto);
  }
  update(dto: UpdateAssignmentDto): Promise<ApplicationResponse<AssignmentOutput>> {
    return this.deps.update.execute(dto);
  }
  remove(dto: DeleteAssignmentDto): Promise<ApplicationResponse<{ id: string }>> {
    return this.deps.remove.execute(dto);
  }
  listSubmissions(
    dto: ListSubmissionsDto,
  ): Promise<ApplicationResponse<AssignmentSubmissionOutput[]>> {
    return this.deps.listSubmissions.execute(dto);
  }
  gradeSubmission(
    dto: GradeSubmissionDto,
  ): Promise<ApplicationResponse<AssignmentSubmissionOutput>> {
    return this.deps.gradeSubmission.execute(dto);
  }
}
