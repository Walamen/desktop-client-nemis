import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { SetSubjectActiveDto, SubjectOutput } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toSubjectOutput } from '../../mappers/academics/subject-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface SetSubjectActiveDeps {
  subjects: ISubjectRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class SetSubjectActiveUseCase implements CommandHandler<
  SetSubjectActiveDto,
  ApplicationResponse<SubjectOutput>
> {
  constructor(private readonly deps: SetSubjectActiveDeps) {}

  execute(command: SetSubjectActiveDto): Promise<ApplicationResponse<SubjectOutput>> {
    return invokeUseCase('SetSubjectActive', this.deps.logger, async () => {
      const subject = this.deps.subjects.findById(command.id);
      if (!subject) {
        throw new WorkflowException(`Subject ${command.id} does not exist.`);
      }

      const at = this.deps.clock.now();
      if (command.isActive) subject.activate(command.actorId, at);
      else subject.deactivate(command.actorId, at);

      this.deps.unitOfWork.run(() => this.deps.subjects.save(subject));

      return ok(toSubjectOutput(subject, this.deps.subjects.countClasses(subject.id)));
    });
  }
}
