import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { AcademicYearListItemOutput } from '../../dto/academics/academic-year-dto';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAcademicYearListItemOutput } from '../../mappers/academics/academic-year-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface ListAcademicYearsDeps {
  academicYears: IAcademicYearRepository;
  logger: IAppLogger;
}

export class ListAcademicYearsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<AcademicYearListItemOutput[]>
> {
  constructor(private readonly deps: ListAcademicYearsDeps) {}

  execute(
    _query: Record<string, never>,
  ): Promise<ApplicationResponse<AcademicYearListItemOutput[]>> {
    return invokeUseCase('ListAcademicYears', this.deps.logger, async () => {
      const years = this.deps.academicYears.findAll().map((year) =>
        toAcademicYearListItemOutput(year, {
          termCount: this.deps.academicYears.countTerms(year.id),
          classCount: this.deps.academicYears.countClasses(year.id),
        }),
      );
      return ok(years);
    });
  }
}
