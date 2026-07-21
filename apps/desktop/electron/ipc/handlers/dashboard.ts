import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertNoArgs } from '@app/security/validateIpc';

export function registerDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DASHBOARD_GET_OVERVIEW, assertNoArgs, async () => {
    const res = await app.reporting.getDashboardOverview();
    return res.data;
  });
}
