import { AcademicYearStatus } from '@nemis-desktop/types';
import { Term } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateTermDto, TermOutput } from '../../dto/academics/academics-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toTermOutput } from '../../mappers/academics/term-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CreateTermDeps {
  terms: ITermRepository;
  academicYears: IAcademicYearRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateTermUseCase implements CommandHandler<
  CreateTermDto,
  ApplicationResponse<TermOutput>
> {
  constructor(private readonly deps: CreateTermDeps) {}

  execute(command: CreateTermDto): Promise<ApplicationResponse<TermOutput>> {
    return invokeUseCase('CreateTerm', this.deps.logger, async () => {
      requireFields(command, ['academicYearId', 'name', 'startDate', 'endDate']);

      const year = this.deps.academicYears.findById(command.academicYearId);
      if (!year) {
        throw new WorkflowException(`Academic year ${command.academicYearId} does not exist.`);
      }
      if (year.status === AcademicYearStatus.ARCHIVED) {
        throw new WorkflowException('Cannot add a term to an archived academic year.');
      }
      if (!year.period.contains(command.startDate) || !year.period.contains(command.endDate)) {
        throw new WorkflowException('Term dates must fall within the academic year.');
      }
      if (this.deps.terms.existsByName(command.academicYearId, command.name)) {
        throw new WorkflowException(
          `A term named "${command.name}" already exists in this academic year.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const term = Term.create({
        id: this.deps.ids.next(),
        academicYearId: command.academicYearId,
        name: command.name,
        start: command.startDate,
        end: command.endDate,
        isCurrent: command.makeCurrent ?? false,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => {
        if (command.makeCurrent) {
          for (const other of this.deps.terms.findCurrentOthers(command.academicYearId, term.id)) {
            other.clearCurrent(command.actorId, occurredAt);
            this.deps.terms.save(other);
          }
        }
        this.deps.terms.save(term);
      });

      for (const event of term.pullDomainEvents()) this.deps.events.publish(event);

      return ok(toTermOutput(term));
    });
  }
}
