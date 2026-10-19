import {
  IpcChannels,
  type CountyAssignUserRequest,
  type CountyBulkUserRow,
  type CountyCreateUserRequest,
  type CountySetUserActiveRequest,
  type CountyUsersQuery,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCountyAssignUserArgs,
  assertCountyBulkCreateUsersArgs,
  assertCountyCreateUserArgs,
  assertCountySetUserActiveArgs,
  assertCountyUsersQueryArgs,
  assertNoArgs,
  assertSingleIdArg,
} from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';

export type CountyUserGateway = Pick<
  BackendProvisioningGateway,
  'setUserActive' | 'assignCountyUser' | 'getActivationLink' | 'createCountyUser' | 'bulkCreateCountyUsers'
>;

/** County Administrative Users list and assignment options, read from this device. */
export function registerCountyUserHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_LIST_USERS, assertCountyUsersQueryArgs, async (query: CountyUsersQuery) =>
    (await app.county.listUsers(query)).data,
  );
  handle(IpcChannels.COUNTY_GET_USER_OPTIONS, assertNoArgs, async () => (await app.county.getUserOptions()).data);
}

/** User commands are server-owned; each goes to users.service, then a forced
 * pull writes local truth. Only activation links (never tokens) come back.
 * `countyId` is the signed-in County Admin's county (workspace scope id). */
export function registerCountyUserCommandHandlers(
  handle: IpcHandle,
  gateway: CountyUserGateway,
  refresh: () => Promise<boolean>,
  countyId: () => string,
): void {
  handle(IpcChannels.COUNTY_SET_USER_ACTIVE, assertCountySetUserActiveArgs, (request: CountySetUserActiveRequest) =>
    runOnline(() => gateway.setUserActive(request), refresh),
  );
  handle(IpcChannels.COUNTY_ASSIGN_USER, assertCountyAssignUserArgs, (request: CountyAssignUserRequest) =>
    runOnline(() => gateway.assignCountyUser(request), refresh),
  );
  handle(IpcChannels.COUNTY_GET_ACTIVATION_LINK, assertSingleIdArg, (userId: string) =>
    runOnline(() => gateway.getActivationLink(userId), refresh),
  );
  handle(IpcChannels.COUNTY_CREATE_USER, assertCountyCreateUserArgs, (request: CountyCreateUserRequest) =>
    runOnline(() => gateway.createCountyUser({ ...request, countyId: countyId() }), refresh),
  );
  handle(IpcChannels.COUNTY_BULK_CREATE_USERS, assertCountyBulkCreateUsersArgs, (rows: CountyBulkUserRow[]) =>
    runOnline(() => gateway.bulkCreateCountyUsers(rows, countyId()), refresh),
  );
}
