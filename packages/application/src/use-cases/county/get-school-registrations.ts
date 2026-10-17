import type { SchoolRegistration } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetSchoolRegistrationsDeps {
  store: ISchoolRegistrationStore;
  currentUserId: string;
  logger: IAppLogger;
}

/** The signed-in admin's registrations; an empty `ids` means all of them. */
export class GetSchoolRegistrationsUseCase implements QueryHandler<
  { ids: string[] },
  ApplicationResponse<SchoolRegistration[]>
> {
  constructor(private readonly deps: GetSchoolRegistrationsDeps) {}

  execute(query: { ids: string[] }): Promise<ApplicationResponse<SchoolRegistration[]>> {
    return invokeUseCase('GetSchoolRegistrations', this.deps.logger, async () =>
      ok(this.deps.store.listForUser(this.deps.currentUserId, query.ids.length > 0 ? query.ids : undefined)),
    );
  }
}
