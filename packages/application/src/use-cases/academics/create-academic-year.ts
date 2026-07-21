import { AcademicYear } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  AcademicYearListItemOutput,
  CreateAcademicYearDto,
} from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearListItemOutput } from '../../mappers/academics/academic-year-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CreateAcademicYearDeps {
  academicYears: IAcademicYearRepository;
  institutions: IInstitutionRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateAcademicYearUseCase implements CommandHandler<
  CreateAcademicYearDto,
  ApplicationResponse<AcademicYearListItemOutput>
> {
  constructor(private readonly deps: CreateAcademicYearDeps) {}

  execute(
    command: CreateAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return invokeUseCase('CreateAcademicYear', this.deps.logger, async () => {
      requireFields(command, ['code', 'startDate', 'endDate']);

      const institution = this.deps.institutions.findFirst();
      if (!institution) {
        throw new WorkflowException('No school is configured on this device yet.');
      }
      if (this.deps.academicYears.existsByCode(institution.id, command.code)) {
        throw new WorkflowException(
          `An academic year with code "${command.code}" already exists.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const year = AcademicYear.create({
        id: this.deps.ids.next(),
        institutionId: institution.id,
        code: command.code,
        start: command.startDate,
        end: command.endDate,
        isCurrent: command.makeCurrent ?? false,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => {
        if (command.makeCurrent) {
          for (const other of this.deps.academicYears.findCurrentOthers(institution.id, year.id)) {
            other.clearCurrent(command.actorId, occurredAt);
            this.deps.academicYears.save(other);
          }
        }
        this.deps.academicYears.save(year);
      });

      for (const event of year.pullDomainEvents()) this.deps.events.publish(event);

      return ok(toAcademicYearListItemOutput(year, { termCount: 0, classCount: 0 }));
    });
  }
}
