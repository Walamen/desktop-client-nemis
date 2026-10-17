import type { RegisterSchoolsResult, ResubmitSchoolRegistrationRequest } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { freeRandomCode } from './free-random-code';

export interface ResubmitSchoolRegistrationDeps {
  store: ISchoolRegistrationStore;
  currentUserId: string;
  clock: IClock;
  logger: IAppLogger;
  random?: () => number;
}

/** "Fix and resend": a refused school goes back to waiting, same id, with a
 * random code — the form's EMIS-based code would only clash again. */
export class ResubmitSchoolRegistrationUseCase implements CommandHandler<
  ResubmitSchoolRegistrationRequest,
  ApplicationResponse<RegisterSchoolsResult>
> {
  constructor(private readonly deps: ResubmitSchoolRegistrationDeps) {}

  execute(command: ResubmitSchoolRegistrationRequest): Promise<ApplicationResponse<RegisterSchoolsResult>> {
    return invokeUseCase('ResubmitSchoolRegistration', this.deps.logger, async () => {
      const { store, currentUserId } = this.deps;
      const row = store.getForUser(command.id, currentUserId);
      if (!row || row.syncState !== 'rejected') return ok<RegisterSchoolsResult>({ status: 'not-found' });
      const { county } = store.context();
      if (!county) return ok<RegisterSchoolsResult>({ status: 'no-county' });
      const code = freeRandomCode(county.code, this.deps.random ?? Math.random, store, new Set());
      const resubmitted = store.resubmit(
        command.id,
        currentUserId,
        { ...command.school, code, countyId: county.id },
        this.deps.clock.now(),
      );
      return ok<RegisterSchoolsResult>(resubmitted ? { status: 'saved', ids: [command.id] } : { status: 'not-found' });
    });
  }
}
