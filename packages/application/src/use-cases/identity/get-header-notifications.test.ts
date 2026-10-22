import { describe, expect, it } from 'vitest';
import { GetHeaderNotificationsUseCase } from './get-header-notifications';
import { InMemoryHeaderNotificationsReadModel } from '../../testing/identity/in-memory-header-notifications';
import { RecordingLogger } from '../../testing';

describe('GetHeaderNotificationsUseCase', () => {
  it("asks the read model for the current user's summary, five at most", async () => {
    const readModel = new InMemoryHeaderNotificationsReadModel();
    const summary = {
      unread: 3,
      recent: [
        {
          id: 'n-1',
          type: 'INFO',
          title: 'Hello',
          message: 'World',
          link: null,
          createdAt: '2026-10-22T08:00:00.000Z',
        },
      ],
    };
    readModel.summaries.set('user-1', summary);
    const uc = new GetHeaderNotificationsUseCase({
      readModel,
      currentUserId: 'user-1',
      logger: new RecordingLogger(),
    });
    expect((await uc.execute({})).data).toEqual(summary);
    expect(readModel.lastLimit).toBe(5);
  });

  it('returns an empty summary for a user with none', async () => {
    const uc = new GetHeaderNotificationsUseCase({
      readModel: new InMemoryHeaderNotificationsReadModel(),
      currentUserId: 'nobody',
      logger: new RecordingLogger(),
    });
    expect((await uc.execute({})).data).toEqual({ unread: 0, recent: [] });
  });
});
