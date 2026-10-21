import { IpcChannels, type CountyNotificationsQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import { assertCountyNotificationsQueryArgs, assertNoArgs, assertSingleIdArg } from '@app/security/validateIpc';

/** County Notifications, from this device; marking read is local and pushed
 * by the outbox like any other edit. */
export function registerCountyNotificationHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_NOTIFICATIONS_LIST, assertCountyNotificationsQueryArgs, async (query: CountyNotificationsQuery) =>
    (await app.county.listNotifications(query)).data,
  );
  handle(IpcChannels.COUNTY_NOTIFICATIONS_MARK_READ, assertSingleIdArg, async (notificationId: string) =>
    (await app.county.markNotificationRead(notificationId)).data,
  );
  handle(IpcChannels.COUNTY_NOTIFICATIONS_MARK_ALL_READ, assertNoArgs, async () =>
    (await app.county.markAllNotificationsRead()).data,
  );
}
