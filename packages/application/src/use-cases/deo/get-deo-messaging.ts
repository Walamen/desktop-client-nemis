import type { CountyDirectMessage, CountyMessagingOverview, DeoNotificationsResult } from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type {
  ICountyMessagingReadModel,
  ICountyNotificationsRepository,
} from '../../interfaces/county/county-messaging-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

/** A DEO's notifications are few: the page loads them all and pages on screen. */
const ALL_NOTIFICATIONS = 100_000;

export interface DeoMessagingDeps {
  districtOverview: IDistrictOverviewReadModel;
  /** The user's own conversations and messages: not county-specific. */
  messaging: ICountyMessagingReadModel;
  notifications: ICountyNotificationsRepository;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  currentUserId: string;
  logger: IAppLogger;
}

/** DEO Messages sidebar: who the DEO may message, and their conversations
 * (docs/superpowers/specs/2026-11-17-deo-messages-notifications-design.md). */
export class GetDeoMessagingOverviewUseCase
  implements QueryHandler<Record<string, never>, ApplicationResponse<CountyMessagingOverview>>
{
  constructor(private readonly deps: DeoMessagingDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyMessagingOverview>> {
    return invokeUseCase('GetDeoMessagingOverview', this.deps.logger, async () => {
      const { currentDistrictId, currentUserId } = this.deps;
      return ok({
        recipients: currentDistrictId
          ? this.deps.districtOverview.listMessageContacts(currentDistrictId, currentUserId)
          : [],
        conversations: this.deps.messaging.listConversations(currentUserId),
      });
    });
  }
}

/** One conversation's thread; null when the DEO is not in it. */
export class GetDeoMessagesUseCase
  implements QueryHandler<{ conversationId: string }, ApplicationResponse<CountyDirectMessage[] | null>>
{
  constructor(private readonly deps: DeoMessagingDeps) {}

  execute(query: { conversationId: string }): Promise<ApplicationResponse<CountyDirectMessage[] | null>> {
    return invokeUseCase('GetDeoMessages', this.deps.logger, async () =>
      ok(this.deps.messaging.listMessages(query.conversationId, this.deps.currentUserId)),
    );
  }
}

/** Every notification of the signed-in DEO on this device, newest first. */
export class GetDeoNotificationsUseCase
  implements QueryHandler<Record<string, never>, ApplicationResponse<DeoNotificationsResult>>
{
  constructor(private readonly deps: DeoMessagingDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoNotificationsResult>> {
    return invokeUseCase('GetDeoNotifications', this.deps.logger, async () => {
      const { currentDistrictId, districtOverview } = this.deps;
      const district = currentDistrictId ? districtOverview.getDistrict(currentDistrictId) : null;
      const county = district ? districtOverview.getCounty(district.countyId) : null;
      const page = this.deps.notifications.list(this.deps.currentUserId, {
        filter: 'ALL',
        page: 1,
        limit: ALL_NOTIFICATIONS,
      });
      return ok({
        districtId: currentDistrictId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        items: page.items,
        unread: page.unread,
      });
    });
  }
}

/** Marks one of the DEO's own notifications read; the outbox pushes it. */
export class MarkDeoNotificationReadUseCase
  implements CommandHandler<{ notificationId: string }, ApplicationResponse<boolean>>
{
  constructor(private readonly deps: DeoMessagingDeps) {}

  execute(command: { notificationId: string }): Promise<ApplicationResponse<boolean>> {
    return invokeUseCase('MarkDeoNotificationRead', this.deps.logger, async () =>
      ok(this.deps.notifications.markRead(this.deps.currentUserId, command.notificationId)),
    );
  }
}

export class MarkAllDeoNotificationsReadUseCase
  implements CommandHandler<Record<string, never>, ApplicationResponse<number>>
{
  constructor(private readonly deps: DeoMessagingDeps) {}

  execute(_command: Record<string, never>): Promise<ApplicationResponse<number>> {
    return invokeUseCase('MarkAllDeoNotificationsRead', this.deps.logger, async () =>
      ok(this.deps.notifications.markAllRead(this.deps.currentUserId)),
    );
  }
}
