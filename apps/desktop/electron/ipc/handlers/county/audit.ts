import { IpcChannels, type CountyAuditQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyAuditQueryArgs, assertNoArgs } from '@app/security/validateIpc';

/** County Audit Trail and Settings, read from this device. */
export function registerCountyAuditHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_AUDIT_STATS, assertNoArgs, async () => (await app.county.getAuditStats()).data);
  handle(IpcChannels.COUNTY_AUDIT_LIST, assertCountyAuditQueryArgs, async (query: CountyAuditQuery) =>
    (await app.county.listAuditLogs(query)).data,
  );
  handle(IpcChannels.COUNTY_SETTINGS, assertNoArgs, async () => (await app.county.getCountySettings()).data);
}
