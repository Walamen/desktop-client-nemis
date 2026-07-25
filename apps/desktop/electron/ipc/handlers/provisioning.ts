import { IpcChannels } from '@nemis-desktop/types';
import type { ProvisioningService } from '@app/provisioning/ProvisioningService';
import { assertAuthenticateArgs, assertNoArgs } from '@app/security/validateIpc';
import type { IpcHandle } from '../registrar';

export function registerProvisioningHandlers(
  handle: IpcHandle,
  service: ProvisioningService,
): void {
  handle(IpcChannels.AUTH_GET_STATUS, assertNoArgs, () => service.getStatus());
  handle(IpcChannels.AUTH_LOGIN, assertAuthenticateArgs, (request) =>
    service.login(request.email, request.password),
  );
  handle(IpcChannels.AUTH_LOGOUT, assertNoArgs, () => service.logout());
  handle(IpcChannels.PROVISIONING_START, assertNoArgs, () => service.start());
}
