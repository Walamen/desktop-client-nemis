import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  AcademicYearListItemOutput,
  UpdateAcademicYearDto,
} from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearListItemOutput } from '../../mappers/academics/academic-year-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateAcademicYearDeps {
  academicYears: IAcademicYearRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class UpdateAcademicYearUseCase implements CommandHandler<
  UpdateAcademicYearDto,
  ApplicationResponse<AcademicYearListItemOutput>
> {
  constructor(private readonly deps: UpdateAcademicYearDeps) {}

  execute(
    command: UpdateAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return invokeUseCase('UpdateAcademicYear', this.deps.logger, async () => {
      const year = this.deps.academicYears.findById(command.id);
      if (!year) {
        throw new WorkflowException(`Academic year ${command.id} does not exist.`);
      }

      if (command.code !== undefined && command.code !== year.code.value) {
        if (this.deps.academicYears.existsByCode(year.institutionId, command.code, year.id)) {
          throw new WorkflowException(
            `An academic year with code "${command.code}" already exists.`,
          );
        }
      }

      const at = this.deps.clock.now();
      if (command.code !== undefined) year.rename(command.code, command.actorId, at);
      if (command.startDate !== undefined || command.endDate !== undefined) {
        year.reschedule(
          command.startDate ?? year.period.start,
          command.endDate ?? year.period.end,
          command.actorId,
          at,
        );
      }

      this.deps.unitOfWork.run(() => this.deps.academicYears.save(year));

      return ok(
        toAcademicYearListItemOutput(year, {
          termCount: this.deps.academicYears.countTerms(year.id),
          classCount: this.deps.academicYears.countClasses(year.id),
        }),
      );
    });
  }
}
