import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface DiscardSchoolRegistrationDeps {
  store: ISchoolRegistrationStore;
  currentUserId: string;
  logger: IAppLogger;
}

/** Removes a refused school from this device. Waiting or accepted ones stay. */
export class DiscardSchoolRegistrationUseCase implements CommandHandler<
  { id: string },
  ApplicationResponse<{ discarded: boolean }>
> {
  constructor(private readonly deps: DiscardSchoolRegistrationDeps) {}

  execute(command: { id: string }): Promise<ApplicationResponse<{ discarded: boolean }>> {
    return invokeUseCase('DiscardSchoolRegistration', this.deps.logger, async () =>
      ok({ discarded: this.deps.store.discard(command.id, this.deps.currentUserId) }),
    );
  }
}
