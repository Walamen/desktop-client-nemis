import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

/** DEO Finance, from this device. The district comes from the signed-in
 * workspace, never from the renderer. */
export function registerDeoFinanceHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_FINANCE, assertNoArgs, async () => (await app.deo.getFinance()).data);
  handle(IpcChannels.DEO_FINANCE_AUDIT, assertNoArgs, async () => (await app.deo.listFinanceAudit()).data);
}
