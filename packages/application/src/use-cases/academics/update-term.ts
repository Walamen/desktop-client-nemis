import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { TermOutput, UpdateTermDto } from '../../dto/academics/academics-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toTermOutput } from '../../mappers/academics/term-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateTermDeps {
  terms: ITermRepository;
  academicYears: IAcademicYearRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class UpdateTermUseCase implements CommandHandler<
  UpdateTermDto,
  ApplicationResponse<TermOutput>
> {
  constructor(private readonly deps: UpdateTermDeps) {}

  execute(command: UpdateTermDto): Promise<ApplicationResponse<TermOutput>> {
    return invokeUseCase('UpdateTerm', this.deps.logger, async () => {
      const term = this.deps.terms.findById(command.id);
      if (!term) {
        throw new WorkflowException(`Term ${command.id} does not exist.`);
      }

      if (command.name !== undefined && command.name !== term.name) {
        if (this.deps.terms.existsByName(term.academicYearId, command.name, term.id)) {
          throw new WorkflowException(
            `A term named "${command.name}" already exists in this academic year.`,
          );
        }
      }

      const at = this.deps.clock.now();
      if (command.name !== undefined) term.rename(command.name, command.actorId, at);
      if (command.startDate !== undefined || command.endDate !== undefined) {
        const start = command.startDate ?? term.period.start;
        const end = command.endDate ?? term.period.end;
        const year = this.deps.academicYears.findById(term.academicYearId);
        if (year && (!year.period.contains(start) || !year.period.contains(end))) {
          throw new WorkflowException('Term dates must fall within the academic year.');
        }
        term.reschedule(start, end, command.actorId, at);
      }

      this.deps.unitOfWork.run(() => this.deps.terms.save(term));

      return ok(toTermOutput(term));
    });
  }
}
