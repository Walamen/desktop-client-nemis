import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CountySchoolDetailOutput } from '../../dto/county/county-schools-dto';
import type { ICountySchoolsReadModel } from '../../interfaces/county/county-schools-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountySchoolDetailDeps {
  readModel: ICountySchoolsReadModel;
  logger: IAppLogger;
}

/** School detail page data; null for an unknown or other-county school. */
export class GetCountySchoolDetailUseCase implements QueryHandler<
  { schoolId: string },
  ApplicationResponse<CountySchoolDetailOutput>
> {
  constructor(private readonly deps: GetCountySchoolDetailDeps) {}

  execute(query: { schoolId: string }): Promise<ApplicationResponse<CountySchoolDetailOutput>> {
    return invokeUseCase('GetCountySchoolDetail', this.deps.logger, async () =>
      ok(this.deps.readModel.getSchool(query.schoolId)),
    );
  }
}
