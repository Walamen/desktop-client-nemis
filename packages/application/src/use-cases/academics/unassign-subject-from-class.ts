import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassSubjectPairDto, DeletedOutput } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UnassignSubjectFromClassDeps {
  subjects: ISubjectRepository;
  unitOfWork: IUnitOfWork;
  logger: IAppLogger;
}

export class UnassignSubjectFromClassUseCase implements CommandHandler<
  ClassSubjectPairDto,
  ApplicationResponse<DeletedOutput>
> {
  constructor(private readonly deps: UnassignSubjectFromClassDeps) {}

  execute(command: ClassSubjectPairDto): Promise<ApplicationResponse<DeletedOutput>> {
    return invokeUseCase('UnassignSubjectFromClass', this.deps.logger, async () => {
      requireFields(command, ['classId', 'subjectId']);

      if (!this.deps.subjects.isAssigned(command.classId, command.subjectId)) {
        throw new WorkflowException('This subject is not assigned to this class.');
      }

      this.deps.unitOfWork.run(() =>
        this.deps.subjects.unassign(command.classId, command.subjectId),
      );

      return ok({ id: `${command.classId}:${command.subjectId}` });
    });
  }
}
