import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassOutput, SetClassActiveDto } from '../../dto/academics/academics-dto';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassOutput } from '../../mappers/academics/class-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface SetClassActiveDeps {
  classes: IClassRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class SetClassActiveUseCase implements CommandHandler<
  SetClassActiveDto,
  ApplicationResponse<ClassOutput>
> {
  constructor(private readonly deps: SetClassActiveDeps) {}

  execute(command: SetClassActiveDto): Promise<ApplicationResponse<ClassOutput>> {
    return invokeUseCase('SetClassActive', this.deps.logger, async () => {
      const entity = this.deps.classes.findById(command.id);
      if (!entity) {
        throw new WorkflowException(`Class ${command.id} does not exist.`);
      }

      const at = this.deps.clock.now();
      if (command.isActive) entity.activate(command.actorId, at);
      else entity.deactivate(command.actorId, at);

      this.deps.unitOfWork.run(() => this.deps.classes.save(entity));

      return ok(toClassOutput(entity, this.deps.classes.countSubjects(entity.id)));
    });
  }
}
