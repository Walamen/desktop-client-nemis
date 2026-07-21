import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassSubjectOutput, ClassSubjectPairDto } from '../../dto/academics/academics-dto';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassSubjectOutput } from '../../mappers/academics/subject-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface AssignSubjectToClassDeps {
  classes: IClassRepository;
  subjects: ISubjectRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  logger: IAppLogger;
}

export class AssignSubjectToClassUseCase implements CommandHandler<
  ClassSubjectPairDto,
  ApplicationResponse<ClassSubjectOutput>
> {
  constructor(private readonly deps: AssignSubjectToClassDeps) {}

  execute(command: ClassSubjectPairDto): Promise<ApplicationResponse<ClassSubjectOutput>> {
    return invokeUseCase('AssignSubjectToClass', this.deps.logger, async () => {
      requireFields(command, ['classId', 'subjectId']);

      if (!this.deps.classes.exists(command.classId)) {
        throw new WorkflowException(`Class ${command.classId} does not exist.`);
      }
      const subject = this.deps.subjects.findById(command.subjectId);
      if (!subject) {
        throw new WorkflowException(`Subject ${command.subjectId} does not exist.`);
      }
      if (this.deps.subjects.isAssigned(command.classId, command.subjectId)) {
        throw new WorkflowException('This subject is already assigned to this class.');
      }

      const assignedAt = this.deps.clock.now();
      this.deps.unitOfWork.run(() =>
        this.deps.subjects.assign({
          id: this.deps.ids.next(),
          classId: command.classId,
          subjectId: command.subjectId,
          assignedAt,
        }),
      );

      return ok(
        toClassSubjectOutput({
          classId: command.classId,
          subjectId: command.subjectId,
          subjectName: subject.name,
          subjectCode: subject.code,
          assignedAt,
        }),
      );
    });
  }
}
