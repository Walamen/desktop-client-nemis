import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyMessagingReadModel } from './SqliteCountyMessagingReadModel';

const STAMP = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyMessagingReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyMessagingReadModel;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, name: string, districtId: string | null, countyId = 'county-1') =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,'APPROVED',1,?,1)`,
      id, id.toUpperCase(), name, countyId, districtId, STAMP,
    );
  const user = (id: string, firstName: string, lastName: string, isActive = 1, photoUrl: string | null = null) =>
    run(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,photoUrl) VALUES (?,?,?,?,?,1,?,?)`,
      id, firstName, lastName, `${id}@x.lr`, isActive, STAMP, photoUrl,
    );
  const org = (
    id: string,
    userId: string,
    role: string,
    opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isActive?: number } = {},
  ) =>
    run(
      `INSERT INTO user_organizations (id,userId,role,institutionId,countyId,districtId,isActive) VALUES (?,?,?,?,?,?,?)`,
      id, userId, role, opts.institutionId ?? null, opts.countyId ?? null, opts.districtId ?? null, opts.isActive ?? 1,
    );
  const conversation = (id: string, other: string, first: string, lastMessageAt: string | null, role = 'DEO') =>
    run(
      `INSERT INTO direct_conversations (id,initiatorId,recipientId,lastMessageAt,createdAt,updatedAt,counterpartUserId,
         counterpartFirstName,counterpartLastName,counterpartPhotoUrl,counterpartRole,counterpartInstitutionName)
       VALUES (?,?,?,?,?,?,?,?,'Doe',NULL,?,NULL)`,
      id, 'ceo-1', other, lastMessageAt, '2026-10-01T00:00:00.000Z', STAMP, other, first, role,
    );
  const message = (id: string, conversationId: string, senderId: string, content: string, createdAt: string, isRead = 0) =>
    run(
      `INSERT INTO direct_messages (id,conversationId,senderId,content,isRead,readAt,createdAt,updatedAt)
       VALUES (?,?,?,?,?,NULL,?,?)`,
      id, conversationId, senderId, content, isRead, createdAt, createdAt,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyMessagingReadModel(test.context);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-2');
    school('sch-far', 'Far School', 'd-1', 'county-2');
    user('ceo-1', 'Me', 'Myself');
    org('o-ceo', 'ceo-1', 'COUNTY_ADMIN', { countyId: 'county-1' });
    user('deo-1', 'James', 'Doe', 1, 'https://x/james.jpg');
    org('o-deo', 'deo-1', 'DEO', { countyId: 'county-1', districtId: 'd-1' });
    user('admin-1', 'Bendu', 'Kollie');
    org('o-admin', 'admin-1', 'INSTITUTION_ADMIN', { institutionId: 'sch-a' });
    user('pool-1', 'Pool', 'Deo');
    org('o-pool', 'pool-1', 'DEO', { countyId: null });
    user('far-1', 'Far', 'Admin');
    org('o-far', 'far-1', 'INSTITUTION_ADMIN', { institutionId: 'sch-far' });
    user('gone-1', 'Aaron', 'Gone', 0);
    org('o-gone', 'gone-1', 'DEO', { countyId: 'county-1' });
    user('off-1', 'Ama', 'Inactive');
    org('o-off', 'off-1', 'DEO', { countyId: 'county-1', isActive: 0 });
  });
  afterEach(() => test.cleanup());

  it('recipients are county DEOs and county School Admins, active, without me, by name; a school admin takes the school district', () => {
    expect(readModel.getOverview('ceo-1').recipients).toEqual([
      {
        userId: 'admin-1', firstName: 'Bendu', lastName: 'Kollie', photoUrl: null, role: 'INSTITUTION_ADMIN',
        districtId: 'd-2', districtName: 'Owensgrove', institutionId: 'sch-a', institutionName: 'Alpha School',
      },
      {
        userId: 'deo-1', firstName: 'James', lastName: 'Doe', photoUrl: 'https://x/james.jpg', role: 'DEO',
        districtId: 'd-1', districtName: 'Buchanan', institutionId: null, institutionName: null,
      },
    ]);
  });

  it('conversations carry unread and last message, newest first', () => {
    conversation('c-old', 'deo-1', 'James', '2026-10-02T00:00:00.000Z');
    conversation('c-new', 'admin-1', 'Bendu', '2026-10-05T00:00:00.000Z', 'INSTITUTION_ADMIN');
    conversation('c-none', 'pool-1', 'Pool', null);
    message('m-1', 'c-old', 'deo-1', 'First', '2026-10-01T10:00:00.000Z');
    message('m-2', 'c-old', 'ceo-1', 'Reply', '2026-10-01T11:00:00.000Z');
    message('m-3', 'c-old', 'deo-1', 'Latest', '2026-10-02T00:00:00.000Z');
    message('m-4', 'c-old', 'deo-1', 'Read one', '2026-09-30T00:00:00.000Z', 1);
    const { conversations } = readModel.getOverview('ceo-1');
    expect(conversations.map((c) => c.id)).toEqual(['c-new', 'c-old', 'c-none']);
    expect(conversations[1]).toEqual({
      id: 'c-old',
      lastMessageAt: '2026-10-02T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
      counterpart: { userId: 'deo-1', firstName: 'James', lastName: 'Doe', photoUrl: null, role: 'DEO', institutionName: null },
      lastMessage: 'Latest',
      unreadCount: 2,
    });
    expect(conversations[2]).toMatchObject({ lastMessage: null, unreadCount: 0 });
  });

  it('messages are oldest first with isOwn and senderName', () => {
    conversation('c-1', 'deo-1', 'James', '2026-10-02T00:00:00.000Z');
    message('m-2', 'c-1', 'ceo-1', 'Reply', '2026-10-01T11:00:00.000Z', 1);
    message('m-1', 'c-1', 'deo-1', 'First', '2026-10-01T10:00:00.000Z');
    expect(readModel.listMessages('c-1', 'ceo-1')).toEqual([
      { id: 'm-1', conversationId: 'c-1', senderId: 'deo-1', content: 'First', isRead: false, readAt: null,
        createdAt: '2026-10-01T10:00:00.000Z', isOwn: false, senderName: 'James Doe' },
      { id: 'm-2', conversationId: 'c-1', senderId: 'ceo-1', content: 'Reply', isRead: true, readAt: null,
        createdAt: '2026-10-01T11:00:00.000Z', isOwn: true, senderName: 'You' },
    ]);
  });

  it('a conversation the user is not in returns null', () => {
    conversation('c-1', 'deo-1', 'James', null);
    expect(readModel.listMessages('c-1', 'someone-else')).toBeNull();
    expect(readModel.listMessages('missing', 'ceo-1')).toBeNull();
  });
});
