import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassOutput, UpdateClassDto } from '../../dto/academics/academics-dto';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassOutput } from '../../mappers/academics/class-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateClassDeps {
  classes: IClassRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class UpdateClassUseCase implements CommandHandler<
  UpdateClassDto,
  ApplicationResponse<ClassOutput>
> {
  constructor(private readonly deps: UpdateClassDeps) {}

  execute(command: UpdateClassDto): Promise<ApplicationResponse<ClassOutput>> {
    return invokeUseCase('UpdateClass', this.deps.logger, async () => {
      const entity = this.deps.classes.findById(command.id);
      if (!entity) {
        throw new WorkflowException(`Class ${command.id} does not exist.`);
      }

      if (command.name !== undefined && command.name !== entity.name) {
        if (
          this.deps.classes.existsByName(
            entity.institutionId,
            entity.academicYearId,
            command.name,
            entity.id,
          )
        ) {
          throw new WorkflowException(
            `A class named "${command.name}" already exists for this academic year.`,
          );
        }
      }

      entity.update(
        {
          name: command.name,
          section: command.section,
          gradeLevel: command.gradeLevel,
          capacity: command.capacity,
        },
        command.actorId,
        this.deps.clock.now(),
      );

      this.deps.unitOfWork.run(() => this.deps.classes.save(entity));

      return ok(toClassOutput(entity, this.deps.classes.countSubjects(entity.id)));
    });
  }
}
