import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from './registry';

function migrated() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  return db;
}

describe('023-create-fee-payment-reversals', () => {
  it('creates the reversals table with every column the push path needs', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("fee_payment_reversals")`).all() as { name: string }[])
      .map((column) => column.name)
      .sort();
    expect(columns).toEqual(
      [
        'createdAt', 'id', 'institutionId', 'notes', 'paymentId',
        'reason', 'reversedAt', 'reversedBy', 'syncedAt', 'updatedAt',
      ].sort(),
    );
    db.close();
  });

  it('allows only one reversal per payment', () => {
    const db = migrated();
    const insert = db.prepare(
      `INSERT INTO fee_payment_reversals
         (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
       VALUES (?,?,?,?,NULL,?,?,?,?,NULL)`,
    );
    const now = new Date().toISOString();
    insert.run('r1', 'pay-1', 'school-1', 'wrong amount', 'admin-1', now, now, now);
    expect(() =>
      insert.run('r2', 'pay-1', 'school-1', 'again', 'admin-1', now, now, now),
    ).toThrow(/UNIQUE/i);
    db.close();
  });

  it('has no outbox triggers — this table pushes through its own path', () => {
    const db = migrated();
    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='fee_payment_reversals'`)
      .all() as { name: string }[];
    expect(triggers).toEqual([]);
    db.close();
  });
});
