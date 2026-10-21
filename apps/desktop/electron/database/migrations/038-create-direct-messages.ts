import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** County Messages page (docs/superpowers/specs/2026-10-21-county-messages-notifications-design.md):
 * the signed-in County Admin's direct conversations (with the counterpart
 * resolved by the server) and their messages, so they read offline.
 * Pull-only: not mutable, no outbox triggers — sending is an online command
 * and the next pull writes the result. A full resync is forced so devices in
 * the field receive their existing conversations now. */
export const createDirectMessages: Migration = {
  version: 38,
  name: 'create-direct-messages',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE direct_conversations (
        id TEXT PRIMARY KEY,
        initiatorId TEXT NOT NULL,
        recipientId TEXT NOT NULL,
        lastMessageAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        counterpartUserId TEXT NOT NULL,
        counterpartFirstName TEXT NOT NULL,
        counterpartLastName TEXT NOT NULL,
        counterpartPhotoUrl TEXT,
        counterpartRole TEXT NOT NULL,
        counterpartInstitutionName TEXT
      );
      CREATE INDEX idx_direct_conversations_last ON direct_conversations (lastMessageAt);
      CREATE TABLE direct_messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        content TEXT NOT NULL,
        isRead INTEGER NOT NULL,
        readAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX idx_direct_messages_conversation ON direct_messages (conversationId, createdAt);
    `);
    // Same as migration 029: a null lastFullResyncAt makes the next sync cycle a full resync.
    const cols = db.prepare(`PRAGMA table_info("sync_metadata")`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'lastFullResyncAt')) {
      db.exec(`UPDATE sync_metadata SET lastFullResyncAt = NULL`);
    }
  },
};
