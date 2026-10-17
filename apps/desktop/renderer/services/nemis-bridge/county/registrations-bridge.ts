import type {
  RegisterSchoolsRequest,
  RegisterSchoolsResult,
  ResubmitSchoolRegistrationRequest,
  SchoolRegistration,
  SchoolRegistrationContext,
} from '@nemis-desktop/types';
import { api } from '../api';

export const registrationsBridge = {
  getRegistrationContext: (): Promise<SchoolRegistrationContext> => api().county.getRegistrationContext(),
  registerSchools: (request: RegisterSchoolsRequest): Promise<RegisterSchoolsResult> =>
    api().county.registerSchools(request),
  resubmitSchoolRegistration: (request: ResubmitSchoolRegistrationRequest): Promise<RegisterSchoolsResult> =>
    api().county.resubmitSchoolRegistration(request),
  discardSchoolRegistration: (id: string): Promise<{ discarded: boolean }> =>
    api().county.discardSchoolRegistration(id),
  getSchoolRegistrations: (ids: string[]): Promise<SchoolRegistration[]> => api().county.getSchoolRegistrations(ids),
  /** The online wait after Save: one bounded sync, then the states. Offline it returns at once. */
  settleSchoolRegistrations: (ids: string[], timeoutMs: number): Promise<SchoolRegistration[]> =>
    api().county.settleSchoolRegistrations(ids, timeoutMs),
};
