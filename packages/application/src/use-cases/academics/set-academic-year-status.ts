import { AcademicYearStatus } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  AcademicYearListItemOutput,
  SetAcademicYearStatusDto,
} from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearListItemOutput } from '../../mappers/academics/academic-year-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface SetAcademicYearStatusDeps {
  academicYears: IAcademicYearRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class SetAcademicYearStatusUseCase implements CommandHandler<
  SetAcademicYearStatusDto,
  ApplicationResponse<AcademicYearListItemOutput>
> {
  constructor(private readonly deps: SetAcademicYearStatusDeps) {}

  execute(
    command: SetAcademicYearStatusDto,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput>> {
    return invokeUseCase('SetAcademicYearStatus', this.deps.logger, async () => {
      const year = this.deps.academicYears.findById(command.id);
      if (!year) {
        throw new WorkflowException(`Academic year ${command.id} does not exist.`);
      }

      if (year.status !== command.status) {
        const at = this.deps.clock.now();
        switch (command.status) {
          case AcademicYearStatus.CLOSED:
            year.close(command.actorId, at);
            break;
          case AcademicYearStatus.ARCHIVED:
            year.archive(command.actorId, at);
            break;
          case AcademicYearStatus.ACTIVE:
            year.restore(command.actorId, at);
            break;
        }
        this.deps.unitOfWork.run(() => this.deps.academicYears.save(year));
      }

      return ok(
        toAcademicYearListItemOutput(year, {
          termCount: this.deps.academicYears.countTerms(year.id),
          classCount: this.deps.academicYears.countClasses(year.id),
        }),
      );
    });
  }
}
