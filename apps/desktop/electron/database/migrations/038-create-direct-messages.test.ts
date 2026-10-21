import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

type ColumnInfo = { name: string };

describe('migration 038 create-direct-messages', () => {
  it('creates the pull-only direct message tables, without outbox triggers, and forces a full resync', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of migrations.filter((m) => m.version <= 37)) migration.up(db);
    db.prepare(
      `INSERT INTO sync_metadata (id, schemaVersion, databaseVersion, lastFullResyncAt, createdAt, updatedAt)
       VALUES ('singleton', 37, 37, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    ).run();

    migrations.find((m) => m.version === 38)!.up(db);

    expect((db.pragma('table_info(direct_conversations)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'initiatorId', 'recipientId', 'lastMessageAt', 'createdAt', 'updatedAt',
      'counterpartUserId', 'counterpartFirstName', 'counterpartLastName', 'counterpartPhotoUrl',
      'counterpartRole', 'counterpartInstitutionName',
    ]);
    expect((db.pragma('table_info(direct_messages)') as ColumnInfo[]).map((c) => c.name)).toEqual([
      'id', 'conversationId', 'senderId', 'content', 'isRead', 'readAt', 'createdAt', 'updatedAt',
    ]);
    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('direct_conversations','direct_messages')`)
      .all();
    expect(triggers).toEqual([]);
    expect(db.prepare(`SELECT lastFullResyncAt FROM sync_metadata`).get()).toEqual({ lastFullResyncAt: null });

    db.prepare(
      `INSERT INTO direct_messages (id,conversationId,senderId,content,isRead,readAt,createdAt,updatedAt)
       VALUES ('m-1','c-1','u-2','Hi',0,NULL,'2026-10-20T00:00:00.000Z','2026-10-20T00:00:00.000Z')`,
    ).run();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sync_queue`).get()).toEqual({ n: 0 });
  });
});
