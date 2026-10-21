import type {
  CountyDirectMessage,
  CountyMessagingOverview,
  CountyNotificationsPage,
  CountyNotificationsQuery,
} from '@nemis-desktop/types';
import type { CommandHandler } from '../../core/command';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  ICountyMessagingReadModel,
  ICountyNotificationsRepository,
} from '../../interfaces/county/county-messaging-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CountyMessagingDeps {
  readModel: ICountyMessagingReadModel;
  /** The signed-in County Admin (workspace user). */
  currentUserId: string;
  logger: IAppLogger;
}

export interface CountyNotificationsDeps {
  repository: ICountyNotificationsRepository;
  currentUserId: string;
  logger: IAppLogger;
}

/** Messages sidebar: who can be messaged, and the user's conversations. */
export class GetCountyMessagingOverviewUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyMessagingOverview>
> {
  constructor(private readonly deps: CountyMessagingDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyMessagingOverview>> {
    return invokeUseCase('GetCountyMessagingOverview', this.deps.logger, async () =>
      ok(this.deps.readModel.getOverview(this.deps.currentUserId)),
    );
  }
}

/** One conversation's thread; null when the user is not in it. */
export class GetCountyMessagesUseCase implements QueryHandler<
  { conversationId: string },
  ApplicationResponse<CountyDirectMessage[] | null>
> {
  constructor(private readonly deps: CountyMessagingDeps) {}

  execute(query: { conversationId: string }): Promise<ApplicationResponse<CountyDirectMessage[] | null>> {
    return invokeUseCase('GetCountyMessages', this.deps.logger, async () =>
      ok(this.deps.readModel.listMessages(query.conversationId, this.deps.currentUserId)),
    );
  }
}

export class GetCountyNotificationsUseCase implements QueryHandler<
  CountyNotificationsQuery,
  ApplicationResponse<CountyNotificationsPage>
> {
  constructor(private readonly deps: CountyNotificationsDeps) {}

  execute(query: CountyNotificationsQuery): Promise<ApplicationResponse<CountyNotificationsPage>> {
    return invokeUseCase('GetCountyNotifications', this.deps.logger, async () =>
      ok(this.deps.repository.list(this.deps.currentUserId, query)),
    );
  }
}

/** Marks one of the user's own notifications read (pushed by the outbox). */
export class MarkCountyNotificationReadUseCase implements CommandHandler<
  { notificationId: string },
  ApplicationResponse<boolean>
> {
  constructor(private readonly deps: CountyNotificationsDeps) {}

  execute(command: { notificationId: string }): Promise<ApplicationResponse<boolean>> {
    return invokeUseCase('MarkCountyNotificationRead', this.deps.logger, async () =>
      ok(this.deps.repository.markRead(this.deps.currentUserId, command.notificationId)),
    );
  }
}

export class MarkAllCountyNotificationsReadUseCase implements CommandHandler<
  Record<string, never>,
  ApplicationResponse<number>
> {
  constructor(private readonly deps: CountyNotificationsDeps) {}

  execute(_command: Record<string, never>): Promise<ApplicationResponse<number>> {
    return invokeUseCase('MarkAllCountyNotificationsRead', this.deps.logger, async () =>
      ok(this.deps.repository.markAllRead(this.deps.currentUserId)),
    );
  }
}
