import type {
  RegisterSchoolsRequest,
  RegisterSchoolsResult,
  SchoolCodeClash,
  SchoolRegistrationPayload,
} from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ISchoolRegistrationStore } from '../../interfaces/county/school-registration-store';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { formSchoolCode } from './school-registration-codes';
import { freeRandomCode } from './free-random-code';

export interface RegisterSchoolsDeps {
  store: ISchoolRegistrationStore;
  currentUserId: string;
  clock: IClock;
  ids: IIdGenerator;
  logger: IAppLogger;
  random?: () => number;
}

/** Saves schools on this device to be sent later. A form school's code comes
 * from its EMIS code, so a clash is the admin's to fix and is reported; a
 * bulk school's code is random, so a clash is silently drawn again. */
export class RegisterSchoolsUseCase implements CommandHandler<
  RegisterSchoolsRequest,
  ApplicationResponse<RegisterSchoolsResult>
> {
  constructor(private readonly deps: RegisterSchoolsDeps) {}

  execute(command: RegisterSchoolsRequest): Promise<ApplicationResponse<RegisterSchoolsResult>> {
    return invokeUseCase('RegisterSchools', this.deps.logger, async () => {
      const { store } = this.deps;
      const { county } = store.context();
      if (!county) return ok<RegisterSchoolsResult>({ status: 'no-county' });
      const now = this.deps.clock.now();
      const random = this.deps.random ?? Math.random;
      const taken = new Set<string>();
      const payloads: SchoolRegistrationPayload[] = command.schools.map((school) => {
        const code =
          command.source === 'form'
            ? formSchoolCode(county.code, school.emisCode, now)
            : freeRandomCode(county.code, random, store, taken);
        taken.add(code);
        return { ...school, code, countyId: county.id };
      });
      if (command.source === 'form') {
        const existing = new Map(store.existingCodes(payloads.map((p) => p.code)).map((e) => [e.code, e.name]));
        const clashes: SchoolCodeClash[] = payloads.flatMap((p, index) => {
          const existingName = existing.get(p.code);
          return existingName === undefined ? [] : [{ index, code: p.code, existingName }];
        });
        if (clashes.length > 0) return ok<RegisterSchoolsResult>({ status: 'code-clash', clashes });
      }
      const rows = payloads.map((payload) => ({
        id: this.deps.ids.next(),
        countyId: county.id,
        createdBy: this.deps.currentUserId,
        source: command.source,
        payload,
        now,
      }));
      store.insertMany(rows);
      return ok<RegisterSchoolsResult>({ status: 'saved', ids: rows.map((row) => row.id) });
    });
  }
}
