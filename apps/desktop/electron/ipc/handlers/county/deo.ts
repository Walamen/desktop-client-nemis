import { IpcChannels, type CountyAssignDeoRequest, type CountyRemoveDeoRequest } from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyAssignDeoArgs, assertCountyRemoveDeoArgs } from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';

export type CountyDeoGateway = Pick<
  BackendProvisioningGateway,
  'assignDistrictOfficer' | 'removeDistrictOfficer'
>;

/** DEO assignments are server-owned (multi-step, notifying); every change goes
 * through districts.service here, then a forced pull writes local truth. */
export function registerCountyDeoHandlers(
  handle: IpcHandle,
  gateway: CountyDeoGateway,
  refresh: () => Promise<boolean>,
): void {
  handle(IpcChannels.COUNTY_ASSIGN_DEO, assertCountyAssignDeoArgs, (request: CountyAssignDeoRequest) =>
    runOnline(() => gateway.assignDistrictOfficer(request), refresh),
  );
  handle(IpcChannels.COUNTY_REMOVE_DEO, assertCountyRemoveDeoArgs, (request: CountyRemoveDeoRequest) =>
    runOnline(() => gateway.removeDistrictOfficer(request), refresh),
  );
}
