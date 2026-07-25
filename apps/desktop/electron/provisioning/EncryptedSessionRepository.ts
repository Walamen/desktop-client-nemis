import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { AuthenticatedSession, SessionRepository } from '@nemis-desktop/application';

const SESSION_FILE = 'nemis-session.bin';

export class EncryptedSessionRepository implements SessionRepository {
  private readonly file: string;

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, SESSION_FILE);
  }

  async load(): Promise<AuthenticatedSession | null> {
    if (!fs.existsSync(this.file)) return null;
    try {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file))) as AuthenticatedSession;
    } catch {
      await this.clear();
      return null;
    }
  }

  async save(session: AuthenticatedSession): Promise<void> {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(session)));
    fs.renameSync(temporary, this.file);
  }

  async clear(): Promise<void> {
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
  }
}
