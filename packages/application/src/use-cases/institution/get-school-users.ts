import type { SchoolUsersResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolUsersReadModel } from '../../interfaces/institution/school-users-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetSchoolUsersDeps {
  readModel: ISchoolUsersReadModel;
  logger: IAppLogger;
}

/** Users & Access list as this device holds it (source 'device'). */
export class GetSchoolUsersUseCase implements QueryHandler<
  { institutionId: string },
  ApplicationResponse<SchoolUsersResult>
> {
  constructor(private readonly deps: GetSchoolUsersDeps) {}

  execute(query: { institutionId: string }): Promise<ApplicationResponse<SchoolUsersResult>> {
    return invokeUseCase('GetSchoolUsers', this.deps.logger, async () =>
      ok({ source: 'device' as const, ...this.deps.readModel.list(query.institutionId) }),
    );
  }
}
