import { IpcChannels, type DeoAlertsQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertDeoAlertsQueryArgs, assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

/** DEO dashboard, from this device. The district is never taken from the
 * renderer: the application layer reads it from the signed-in workspace.
 * Mark Reviewed is local and pushed by the outbox like any other edit. */
export function registerDeoDashboardHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_GET_DASHBOARD, assertNoArgs, async () => (await app.deo.getDashboard()).data);
  handle(IpcChannels.DEO_LIST_ALERTS, assertDeoAlertsQueryArgs, async (query: DeoAlertsQuery) =>
    (await app.deo.listAlerts(query)).data,
  );
  handle(IpcChannels.DEO_RESOLVE_ALERT, assertSingleIdArg, async (alertId: string) =>
    (await app.deo.resolveAlert(alertId)).data,
  );
}
