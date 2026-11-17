import { IpcChannels, type DeoSettingsSaveRequest } from '@nemis-desktop/types';
import { RemoteRejectedError, UnauthorizedError } from '@nemis-desktop/shared';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertDeoSettingsSaveArgs, assertNoArgs } from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';

export type DeoSettingsGateway = Pick<BackendProvisioningGateway, 'getDistrictSettings' | 'updateDistrictSettings'>;

/** DEO Settings (docs/superpowers/specs/2026-11-17-deo-settings-design.md).
 * The profile is read from this device; the office address and saving go to
 * the server for the session's district, never one the renderer names. */
export function registerDeoSettingsHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  gateway: DeoSettingsGateway,
  refresh: () => Promise<boolean>,
  sessionDistrictId: () => string,
): void {
  handle(IpcChannels.DEO_SETTINGS, assertNoArgs, async () => (await app.deo.getSettings()).data);
  // A read: nothing changed on the server, so no pull.
  handle(IpcChannels.DEO_SETTINGS_REMOTE, assertNoArgs, async () => ({
    data: await gateway.getDistrictSettings(sessionDistrictId()),
    refreshed: false,
  }));
  handle(IpcChannels.DEO_SETTINGS_SAVE, assertDeoSettingsSaveArgs, (request: DeoSettingsSaveRequest) =>
    runOnline(async () => {
      try {
        return await gateway.updateDistrictSettings(sessionDistrictId(), {
          ...request,
          firstName: request.firstName.trim(),
          lastName: request.lastName.trim(),
          phoneNumber: request.phoneNumber.trim(),
          ...(request.officeAddress !== undefined ? { officeAddress: request.officeAddress.trim() } : {}),
        });
      } catch (error) {
        // The gateway reads every 401 as a lost session. With a password
        // change it is the server refusing the current password (the session
        // was restored just before this request), so say that.
        if (error instanceof UnauthorizedError && request.newPassword !== undefined) {
          throw new RemoteRejectedError(401, 'Current password is incorrect.', { cause: error });
        }
        throw error;
      }
    }, refresh),
  );
}
