import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AcademicYearListItemOutput } from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearListItemOutput } from '../../mappers/academics/academic-year-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface SetCurrentAcademicYearDto {
  id: string;
  actorId?: string;
}

export interface SetCurrentAcademicYearDeps {
  academicYears: IAcademicYearRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class SetCurrentAcademicYearUseCase implements CommandHandler<
  SetCurrentAcademicYearDto,
  ApplicationResponse<AcademicYearListItemOutput>
> {
  constructor(private readonly deps: SetCurrentAcademicYearDeps) {}

  execute(
    command: SetCurrentAcademicYearDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return invokeUseCase('SetCurrentAcademicYear', this.deps.logger, async () => {
      const year = this.deps.academicYears.findById(command.id);
      if (!year) {
        throw new WorkflowException(`Academic year ${command.id} does not exist.`);
      }

      const at = this.deps.clock.now();
      this.deps.unitOfWork.run(() => {
        for (const other of this.deps.academicYears.findCurrentOthers(
          year.institutionId,
          year.id,
        )) {
          other.clearCurrent(command.actorId, at);
          this.deps.academicYears.save(other);
        }
        year.makeCurrent(command.actorId, at);
        this.deps.academicYears.save(year);
      });

      return ok(
        toAcademicYearListItemOutput(year, {
          termCount: this.deps.academicYears.countTerms(year.id),
          classCount: this.deps.academicYears.countClasses(year.id),
        }),
      );
    });
  }
}
