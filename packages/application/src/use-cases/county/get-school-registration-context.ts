import type { SchoolRegistrationContext } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetSchoolRegistrationContextDeps {
  store: ISchoolRegistrationStore;
  logger: IAppLogger;
}

/** What the Create School and Bulk Import pages need: the county and its active districts. */
export class GetSchoolRegistrationContextUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<SchoolRegistrationContext>
> {
  constructor(private readonly deps: GetSchoolRegistrationContextDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<SchoolRegistrationContext>> {
    return invokeUseCase('GetSchoolRegistrationContext', this.deps.logger, async () => ok(this.deps.store.context()));
  }
}
