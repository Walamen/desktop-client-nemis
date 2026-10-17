import {
  IpcChannels,
  type RegisterSchoolsRequest,
  type ResubmitSchoolRegistrationRequest,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertNoArgs,
  assertRegisterSchoolsArgs,
  assertRegistrationIdArg,
  assertRegistrationIdsArg,
  assertResubmitSchoolRegistrationArgs,
  assertSettleSchoolRegistrationsArgs,
} from '@app/security/validateIpc';

const MIN_SETTLE_MS = 1_000;
const MAX_SETTLE_MS = 30_000;

/** County offline school registration. Saving is local; `settle` is the
 * online wait after Save: one bounded sync (refresh = syncWorker.pullNow, a
 * no-op offline), then the states as they stand. */
export function registerCountyRegistrationHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  refresh: (timeoutMs: number) => Promise<boolean>,
): void {
  handle(IpcChannels.COUNTY_GET_REGISTRATION_CONTEXT, assertNoArgs, async () =>
    (await app.county.getRegistrationContext()).data,
  );
  handle(IpcChannels.COUNTY_REGISTER_SCHOOLS, assertRegisterSchoolsArgs, async (request: RegisterSchoolsRequest) =>
    (await app.county.registerSchools(request)).data,
  );
  handle(
    IpcChannels.COUNTY_RESUBMIT_SCHOOL_REGISTRATION,
    assertResubmitSchoolRegistrationArgs,
    async (request: ResubmitSchoolRegistrationRequest) => (await app.county.resubmitSchoolRegistration(request)).data,
  );
  handle(IpcChannels.COUNTY_DISCARD_SCHOOL_REGISTRATION, assertRegistrationIdArg, async (id: string) =>
    (await app.county.discardSchoolRegistration(id)).data,
  );
  handle(IpcChannels.COUNTY_GET_SCHOOL_REGISTRATIONS, assertRegistrationIdsArg, async (ids: string[]) =>
    (await app.county.getSchoolRegistrations(ids)).data,
  );
  handle(
    IpcChannels.COUNTY_SETTLE_SCHOOL_REGISTRATIONS,
    assertSettleSchoolRegistrationsArgs,
    async (ids: string[], timeoutMs: number) => {
      await refresh(Math.min(Math.max(timeoutMs, MIN_SETTLE_MS), MAX_SETTLE_MS));
      return (await app.county.getSchoolRegistrations(ids)).data;
    },
  );
}
