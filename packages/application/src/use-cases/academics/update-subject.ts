import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { SubjectOutput, UpdateSubjectDto } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toSubjectOutput } from '../../mappers/academics/subject-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateSubjectDeps {
  subjects: ISubjectRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class UpdateSubjectUseCase implements CommandHandler<
  UpdateSubjectDto,
  ApplicationResponse<SubjectOutput>
> {
  constructor(private readonly deps: UpdateSubjectDeps) {}

  execute(command: UpdateSubjectDto): Promise<ApplicationResponse<SubjectOutput>> {
    return invokeUseCase('UpdateSubject', this.deps.logger, async () => {
      const subject = this.deps.subjects.findById(command.id);
      if (!subject) {
        throw new WorkflowException(`Subject ${command.id} does not exist.`);
      }

      if (command.code !== undefined) {
        const normalizedCode = command.code.trim().toUpperCase();
        if (
          normalizedCode !== subject.code &&
          this.deps.subjects.existsByCode(subject.institutionId, normalizedCode, subject.id)
        ) {
          throw new WorkflowException(
            `A subject with code "${normalizedCode}" already exists.`,
          );
        }
      }

      subject.update(
        { name: command.name, code: command.code, description: command.description },
        command.actorId,
        this.deps.clock.now(),
      );

      this.deps.unitOfWork.run(() => this.deps.subjects.save(subject));

      return ok(toSubjectOutput(subject, this.deps.subjects.countClasses(subject.id)));
    });
  }
}
