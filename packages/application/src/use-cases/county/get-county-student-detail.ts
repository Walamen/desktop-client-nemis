import type { CountyStudentDetail } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyStudentsReadModel } from '../../interfaces/county/county-students-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyStudentDetailDeps {
  readModel: ICountyStudentsReadModel;
  logger: IAppLogger;
}

/** Student detail page data from this device; null for a student it does not hold. */
export class GetCountyStudentDetailUseCase implements QueryHandler<
  { studentId: string },
  ApplicationResponse<CountyStudentDetail | null>
> {
  constructor(private readonly deps: GetCountyStudentDetailDeps) {}

  execute(query: { studentId: string }): Promise<ApplicationResponse<CountyStudentDetail | null>> {
    return invokeUseCase('GetCountyStudentDetail', this.deps.logger, async () =>
      ok(this.deps.readModel.getStudent(query.studentId)),
    );
  }
}
