import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AcademicYearOutput } from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearOutput } from '../../mappers/academics/academic-year-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentAcademicYearDeps {
  academicYears: IAcademicYearRepository;
  logger: IAppLogger;
}

export class GetCurrentAcademicYearUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<AcademicYearOutput | null>
> {
  constructor(private readonly deps: GetCurrentAcademicYearDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<AcademicYearOutput | null>> {
    return invokeUseCase('GetCurrentAcademicYear', this.deps.logger, async () => {
      const year = this.deps.academicYears.findCurrent();
      return ok(year ? toAcademicYearOutput(year) : null);
    });
  }
}
