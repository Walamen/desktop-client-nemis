import type { HeaderNotificationsSummary } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import {
  HEADER_NOTIFICATIONS_LIMIT,
  type IHeaderNotificationsReadModel,
} from '../../interfaces/identity/header-notifications-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetHeaderNotificationsDeps {
  readModel: IHeaderNotificationsReadModel;
  /** The signed-in user (workspace user). */
  currentUserId: string;
  logger: IAppLogger;
}

/** Header bell: unread count and the latest few notifications for the signed-in user. */
export class GetHeaderNotificationsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<HeaderNotificationsSummary>
> {
  constructor(private readonly deps: GetHeaderNotificationsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<HeaderNotificationsSummary>> {
    return invokeUseCase('GetHeaderNotifications', this.deps.logger, async () =>
      ok(this.deps.readModel.summary(this.deps.currentUserId, HEADER_NOTIFICATIONS_LIMIT)),
    );
  }
}
