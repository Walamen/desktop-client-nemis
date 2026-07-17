import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { DatabaseError } from '../database/errors/errors';

const KEY_FILE_NAME = 'nemis-db-key.bin';
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The database encryption key, wrapped at rest by Electron safeStorage
 * (Windows DPAPI — bound to the OS user account). Generated once per
 * installation; never stored or logged in plaintext. If safeStorage is
 * unavailable we fail the startup hard — the application never silently
 * falls back to an unencrypted database.
 *
 * Must be called after app.whenReady() (safeStorage requirement). Not
 * unit-testable under vitest (requires a live Electron main process);
 * verified by the packaged smoke test.
 */
export function loadOrCreateDatabaseKey(userDataDir: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new DatabaseError(
      'OS-level key protection (safeStorage) is unavailable; refusing to open the database',
      'DB_CONNECTION',
    );
  }
  const keyFile = path.join(userDataDir, KEY_FILE_NAME);
  if (fs.existsSync(keyFile)) {
    let hex: string;
    try {
      hex = safeStorage.decryptString(fs.readFileSync(keyFile));
    } catch (error) {
      throw new DatabaseError('Stored database key cannot be unwrapped', 'DB_CONNECTION', {
        cause: error,
      });
    }
    if (!KEY_HEX_PATTERN.test(hex)) {
      throw new DatabaseError('Stored database key is corrupt', 'DB_CONNECTION');
    }
    return hex;
  }
  fs.mkdirSync(userDataDir, { recursive: true });
  const hex = randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, safeStorage.encryptString(hex));
  return hex;
}
