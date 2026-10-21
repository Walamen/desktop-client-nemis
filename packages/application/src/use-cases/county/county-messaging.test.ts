import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import {
  InMemoryCountyMessagingReadModel,
  InMemoryCountyNotificationsRepository,
} from '../../testing/county/in-memory-county-messaging';
import {
  GetCountyMessagesUseCase,
  GetCountyMessagingOverviewUseCase,
  GetCountyNotificationsUseCase,
  MarkAllCountyNotificationsReadUseCase,
  MarkCountyNotificationReadUseCase,
} from './get-county-messaging';

const logger = () => new RecordingLogger();

describe('County messaging use cases', () => {
  it('overview and messages are for the signed-in user', async () => {
    const readModel = new InMemoryCountyMessagingReadModel();
    readModel.messagesByConversation.set('c-1', []);
    const overview = await new GetCountyMessagingOverviewUseCase({ readModel, currentUserId: 'ceo-1', logger: logger() }).execute({});
    expect(overview.data).toEqual({ recipients: [], conversations: [] });
    expect(readModel.lastUserId).toBe('ceo-1');
    const messages = await new GetCountyMessagesUseCase({ readModel, currentUserId: 'ceo-1', logger: logger() }).execute({
      conversationId: 'c-1',
    });
    expect(messages.data).toEqual([]);
    const missing = await new GetCountyMessagesUseCase({ readModel, currentUserId: 'ceo-1', logger: logger() }).execute({
      conversationId: 'nope',
    });
    expect(missing.data).toBeNull();
  });
});

describe('County notifications use cases', () => {
  it('lists for the signed-in user', async () => {
    const repository = new InMemoryCountyNotificationsRepository();
    const query = { filter: 'UNREAD' as const, page: 2, limit: 20 };
    await new GetCountyNotificationsUseCase({ repository, currentUserId: 'ceo-1', logger: logger() }).execute(query);
    expect(repository.lastQuery).toEqual({ recipientId: 'ceo-1', query });
  });

  it("marking a notification read is scoped to the recipient", async () => {
    const repository = new InMemoryCountyNotificationsRepository();
    repository.owned.set('ceo-1', new Set(['n-1']));
    const mark = new MarkCountyNotificationReadUseCase({ repository, currentUserId: 'ceo-1', logger: logger() });
    expect((await mark.execute({ notificationId: 'n-1' })).data).toBe(true);
    expect((await mark.execute({ notificationId: 'someone-elses' })).data).toBe(false);
    expect(repository.marked).toEqual(['n-1']);
  });

  it('mark all returns the count', async () => {
    const repository = new InMemoryCountyNotificationsRepository();
    repository.owned.set('ceo-1', new Set(['n-1', 'n-2']));
    const { data } = await new MarkAllCountyNotificationsReadUseCase({ repository, currentUserId: 'ceo-1', logger: logger() }).execute({});
    expect(data).toBe(2);
  });
});
