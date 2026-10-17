import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyRegistrationsApi: Pick<
  CountyApi,
  | 'getRegistrationContext'
  | 'registerSchools'
  | 'resubmitSchoolRegistration'
  | 'discardSchoolRegistration'
  | 'getSchoolRegistrations'
  | 'settleSchoolRegistrations'
> = {
  getRegistrationContext: () => invoke(IpcChannels.COUNTY_GET_REGISTRATION_CONTEXT),
  registerSchools: (request) => invoke(IpcChannels.COUNTY_REGISTER_SCHOOLS, request),
  resubmitSchoolRegistration: (request) => invoke(IpcChannels.COUNTY_RESUBMIT_SCHOOL_REGISTRATION, request),
  discardSchoolRegistration: (id) => invoke(IpcChannels.COUNTY_DISCARD_SCHOOL_REGISTRATION, id),
  getSchoolRegistrations: (ids) => invoke(IpcChannels.COUNTY_GET_SCHOOL_REGISTRATIONS, ids),
  settleSchoolRegistrations: (ids, timeoutMs) => invoke(IpcChannels.COUNTY_SETTLE_SCHOOL_REGISTRATIONS, ids, timeoutMs),
};
