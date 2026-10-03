import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Display fields the server now ships on each transfer row (NEMIS ID desktop
 * parity spec §8.1), so the inbox can show who and where while offline. The
 * table is pull-only (migration 025): no outbox triggers to regenerate. */
export const addTransferDisplayFields: Migration = {
  version: 28,
  name: 'add-transfer-display-fields',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE student_transfers ADD COLUMN studentName TEXT;
      ALTER TABLE student_transfers ADD COLUMN studentNemisId TEXT;
      ALTER TABLE student_transfers ADD COLUMN fromInstitutionName TEXT;
      ALTER TABLE student_transfers ADD COLUMN toInstitutionName TEXT;
    `);
  },
};
