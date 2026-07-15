import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../Database';

export interface TestDatabase {
  db: Database;
  filePath: string;
  cleanup(): void;
}

function isAbiMismatch(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      current.message.includes('NODE_MODULE_VERSION') ||
      (current as Error & { code?: string }).code === 'ERR_DLOPEN_FAILED'
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** Temp-file database (file-backed so WAL behaves exactly like production). */
export function createTestDatabase(): TestDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-db-test-'));
  const filePath = path.join(directory, 'test.db');
  let db: Database;
  try {
    db = Database.open({ filePath });
  } catch (error) {
    if (isAbiMismatch(error)) {
      throw new Error(
        'better-sqlite3 is compiled for Electron, not Node. Run `pnpm rebuild:node` ' +
          'and re-run tests. (`pnpm start`/`pnpm make` rebuild it for Electron again.)',
      );
    }
    throw error;
  }
  return {
    db,
    filePath,
    cleanup(): void {
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
