import type { CountyTeacherDetail } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyTeachersReadModel } from '../../interfaces/county/county-teachers-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyTeacherDetailDeps {
  readModel: ICountyTeachersReadModel;
  logger: IAppLogger;
}

/** Teacher profile page data from this device; null for a teacher it does not hold. */
export class GetCountyTeacherDetailUseCase implements QueryHandler<
  { teacherId: string },
  ApplicationResponse<CountyTeacherDetail | null>
> {
  constructor(private readonly deps: GetCountyTeacherDetailDeps) {}

  execute(query: { teacherId: string }): Promise<ApplicationResponse<CountyTeacherDetail | null>> {
    return invokeUseCase('GetCountyTeacherDetail', this.deps.logger, async () =>
      ok(this.deps.readModel.getTeacher(query.teacherId)),
    );
  }
}
