import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import { UnauthorizedError } from '@nemis-desktop/shared';
import type { ProvisioningUser } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import { createApplicationComposition } from '@app/data/adapters/createApplicationComposition';
import { createDataLayer, type DataLayer } from '@app/data/factories/createDataLayer';
import {
  DatabaseManager,
  type DatabaseLogger,
} from '@app/database/DatabaseManager';
import type { DeviceInfo } from '@app/database/seed/initializeMetadata';

export interface ActiveWorkspace {
  readonly identity: string;
  readonly user: ProvisioningUser;
  readonly database: DatabaseManager;
  readonly data: DataLayer;
  readonly application: ApplicationLayer;
  /** This workspace's private directory under userData — the same root the
   * database and its backups live under (see resolveDatabasePaths). Local,
   * not-yet-synced assignment attachments are staged in a subfolder here. */
  readonly workspaceDir: string;
}

interface WorkspaceManagerOptions {
  userDataDir: string;
  masterKey: string;
  device: DeviceInfo;
  log: DatabaseLogger;
}

/**
 * Owns the only open business database. A workspace identity binds user,
 * role and authorization scope; its opaque directory and SQLCipher key are
 * derived independently so two accounts can never open the same local data.
 */
export class WorkspaceManager {
  readonly #options: WorkspaceManagerOptions;
  #active: ActiveWorkspace | null = null;

  constructor(options: WorkspaceManagerOptions) {
    this.#options = options;
  }

  activate(user: ProvisioningUser): ActiveWorkspace {
    const identity = workspaceIdentity(user);
    if (this.#active?.identity === identity) return this.#active;
    this.close();

    const workspaceDir = path.join(this.#options.userDataDir, 'workspaces', identity);
    const database = new DatabaseManager({
      userDataDir: this.#options.userDataDir,
      workspaceDir,
      encryptionKey: deriveWorkspaceKey(this.#options.masterKey, identity),
      device: this.#options.device,
      log: this.#options.log,
    });
    database.initialize();
    const data = createDataLayer(database, this.#options.log);
    this.#active = {
      identity,
      user,
      database,
      data,
      application: createApplicationComposition(data, user.id),
      workspaceDir,
    };
    return this.#active;
  }

  close(): void {
    this.#active?.database.shutdown();
    this.#active = null;
  }

  get active(): ActiveWorkspace {
    if (!this.#active) throw new UnauthorizedError('No offline workspace is unlocked.');
    return this.#active;
  }
}

export function workspaceIdentity(user: ProvisioningUser): string {
  return createHash('sha256')
    .update(`${user.id}\0${user.role}\0${user.scope.type}\0${user.scope.scopeId}`)
    .digest('hex');
}

export function deriveWorkspaceKey(masterKey: string, identity: string): string {
  return createHmac('sha256', Buffer.from(masterKey, 'hex'))
    .update(`nemis-desktop-workspace-v1\0${identity}`)
    .digest('hex');
}
