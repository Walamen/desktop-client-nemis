import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteHeaderNotificationsReadModel } from './SqliteHeaderNotificationsReadModel';

describe('SqliteHeaderNotificationsReadModel', () => {
  let test: TestContext;
  let model: SqliteHeaderNotificationsReadModel;

  const notification = (id: string, recipientId: string, type: string, isRead: number, createdAt: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO user_notifications (id,recipientId,type,title,message,isRead,metadata,link,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,NULL,NULL,?,?)`,
      )
      .run(id, recipientId, type, `Title ${id}`, `Message ${id}`, isRead, createdAt, createdAt);

  beforeEach(() => {
    test = createTestContext();
    model = new SqliteHeaderNotificationsReadModel(test.context);
  });
  afterEach(() => test.cleanup());

  it('counts unread non-message notifications and lists the newest five', () => {
    for (let i = 1; i <= 7; i += 1) notification(`n-${i}`, 'user-1', 'GENERAL_ALERT', 0, `2026-10-0${i}T00:00:00.000Z`);
    notification('read', 'user-1', 'GENERAL_ALERT', 1, '2026-10-09T00:00:00.000Z');
    const summary = model.summary('user-1', 5);
    expect(summary.unread).toBe(7);
    expect(summary.recent).toHaveLength(5);
    expect(summary.recent[0]?.id).toBe('n-7');
    expect(summary.recent[0]).toEqual({
      id: 'n-7', type: 'GENERAL_ALERT', title: 'Title n-7', message: 'Message n-7', link: null,
      createdAt: '2026-10-07T00:00:00.000Z',
    });
  });

  it('leaves NEW_MESSAGE notifications out of the count and the list', () => {
    notification('m1', 'user-1', 'NEW_MESSAGE', 0, '2026-10-01T00:00:00.000Z');
    notification('m2', 'user-1', 'NEW_MESSAGE', 0, '2026-10-02T00:00:00.000Z');
    notification('a1', 'user-1', 'GENERAL_ALERT', 0, '2026-10-03T00:00:00.000Z');
    const summary = model.summary('user-1', 5);
    expect(summary.unread).toBe(1);
    expect(summary.recent.map((r) => r.type)).toEqual(['GENERAL_ALERT']);
  });

  it('ignores other recipients', () => {
    for (let i = 1; i <= 3; i += 1) notification(`o-${i}`, 'user-2', 'GENERAL_ALERT', 0, `2026-10-0${i}T00:00:00.000Z`);
    expect(model.summary('user-1', 5)).toEqual({ unread: 0, recent: [] });
  });

  it('breaks createdAt ties by id, newest id first', () => {
    notification('n-a', 'user-1', 'GENERAL_ALERT', 0, '2026-10-01T00:00:00.000Z');
    notification('n-b', 'user-1', 'GENERAL_ALERT', 0, '2026-10-01T00:00:00.000Z');
    expect(model.summary('user-1', 5).recent[0]?.id).toBe('n-b');
  });
});
