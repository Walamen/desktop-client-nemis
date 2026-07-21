import { AcademicYearStatus } from '@nemis-desktop/types';
import { Class } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ClassOutput, CreateClassDto } from '../../dto/academics/academics-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toClassOutput } from '../../mappers/academics/class-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CreateClassDeps {
  classes: IClassRepository;
  academicYears: IAcademicYearRepository;
  institutions: IInstitutionRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateClassUseCase implements CommandHandler<
  CreateClassDto,
  ApplicationResponse<ClassOutput>
> {
  constructor(private readonly deps: CreateClassDeps) {}

  execute(command: CreateClassDto): Promise<ApplicationResponse<ClassOutput>> {
    return invokeUseCase('CreateClass', this.deps.logger, async () => {
      requireFields(command, ['academicYearId', 'name', 'gradeLevel']);

      const institution = this.deps.institutions.findFirst();
      if (!institution) {
        throw new WorkflowException('No school is configured on this device yet.');
      }
      const year = this.deps.academicYears.findById(command.academicYearId);
      if (!year) {
        throw new WorkflowException(`Academic year ${command.academicYearId} does not exist.`);
      }
      if (year.status === AcademicYearStatus.ARCHIVED) {
        throw new WorkflowException('Cannot add a class to an archived academic year.');
      }
      if (
        this.deps.classes.existsByName(institution.id, command.academicYearId, command.name)
      ) {
        throw new WorkflowException(
          `A class named "${command.name}" already exists for this academic year.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const entity = Class.create({
        id: this.deps.ids.next(),
        institutionId: institution.id,
        academicYearId: command.academicYearId,
        name: command.name,
        section: command.section,
        gradeLevel: command.gradeLevel,
        capacity: command.capacity,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => this.deps.classes.save(entity));

      for (const event of entity.pullDomainEvents()) this.deps.events.publish(event);

      return ok(toClassOutput(entity, 0));
    });
  }
}
