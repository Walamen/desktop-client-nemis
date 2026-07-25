import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '@nemis-desktop/application';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import {
  PROVISIONING_COLLECTIONS,
  type DeviceIdentity,
  type ProvisioningSnapshot,
  type RegisteredDevice,
  type DesktopSyncOperation,
  type DesktopSyncPushResult,
} from '@nemis-desktop/types';
import { ForbiddenError, UnauthorizedError } from '@nemis-desktop/shared';

export class BackendProvisioningGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly authentication: AuthenticationGateway,
    private readonly sessions: SessionRepository,
  ) {}

  async registerDevice(identity: DeviceIdentity): Promise<RegisteredDevice> {
    return this.authorized('/desktop/devices', {
      method: 'POST',
      body: JSON.stringify({
        installationId: identity.id,
        fingerprint: identity.fingerprint,
        name: identity.name,
        platform: identity.platform,
        osVersion: identity.osVersion,
        appVersion: identity.appVersion,
      }),
    }, validateDevice);
  }

  async verifyDevice(id: string): Promise<RegisteredDevice> {
    return this.authorized(`/desktop/devices/${encodeURIComponent(id)}`, {}, validateDevice);
  }

  async downloadSnapshot(deviceId: string): Promise<ProvisioningSnapshot> {
    return this.authorized(
      `/desktop/provisioning/snapshot?deviceId=${encodeURIComponent(deviceId)}`,
      {},
      validateSnapshot,
    );
  }

  async pushChanges(
    deviceId: string,
    operations: readonly DesktopSyncOperation[],
  ): Promise<DesktopSyncPushResult> {
    return this.authorized(
      '/desktop/sync/push',
      {
        method: 'POST',
        body: JSON.stringify({ deviceId, operations }),
      },
      validateSyncResult,
    );
  }

  private async authorized<T>(
    path: string,
    init: RequestInit,
    validate: (value: unknown) => T,
  ): Promise<T> {
    const stored = await this.sessions.load();
    if (!stored) throw new UnauthorizedError();
    let restored: AuthenticatedSession;
    try {
      restored = await this.authentication.restore(stored.sessionSecret);
      await this.sessions.save(restored);
    } catch (error) {
      if (!(error instanceof AuthenticationUnavailableError)) {
        await this.sessions.clear();
      }
      throw error;
    }
    const cookies = sessionCookies(restored.sessionSecret);
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-app-context': 'desktop',
          cookie: cookies,
          ...init.headers,
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new Error('The NEMIS server could not be reached.', { cause: error });
    }
    if (response.status === 401) throw new UnauthorizedError();
    if (response.status === 403) throw new ForbiddenError('This device is not authorized.');
    if (!response.ok) throw new Error(`Provisioning request failed with status ${response.status}.`);
    const root = object(await response.json());
    return validate(root.data);
  }
}

function validateDevice(value: unknown): RegisteredDevice {
  const row = object(value);
  for (const key of [
    'id', 'installationId', 'fingerprint', 'userId', 'role', 'scopeType',
    'scopeId', 'status', 'registeredAt', 'lastSeenAt',
  ]) {
    if (typeof row[key] !== 'string' || row[key].length === 0) {
      throw new Error('Device registration response is invalid.');
    }
  }
  if (!['ACTIVE', 'PENDING', 'REVOKED'].includes(row.status as string)) {
    throw new Error('Device status is invalid.');
  }
  return row as unknown as RegisteredDevice;
}

function validateSnapshot(value: unknown): ProvisioningSnapshot {
  const snapshot = object(value);
  if (snapshot.contractVersion !== 1 || snapshot.checksumAlgorithm !== 'sha256') {
    throw new Error('Unsupported provisioning snapshot contract.');
  }
  for (const key of [
    'snapshotId', 'generatedAt', 'userId', 'role', 'scopeType', 'scopeId',
    'deviceId', 'checksum',
  ]) {
    if (typeof snapshot[key] !== 'string' || snapshot[key].length === 0) {
      throw new Error(`Provisioning snapshot is missing ${key}.`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.checksum as string)) {
    throw new Error('Provisioning snapshot checksum is invalid.');
  }
  const data = object(snapshot.data);
  const manifest = object(snapshot.manifest);
  for (const collection of PROVISIONING_COLLECTIONS) {
    const rows = data[collection];
    if (!Array.isArray(rows)) throw new Error(`Snapshot collection ${collection} is invalid.`);
    if (!Number.isInteger(manifest[collection]) || manifest[collection] !== rows.length) {
      throw new Error(`Snapshot manifest count for ${collection} is invalid.`);
    }
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        throw new Error(`Snapshot collection ${collection} contains an invalid row.`);
      }
    }
  }
  return snapshot as unknown as ProvisioningSnapshot;
}

function validateSyncResult(value: unknown): DesktopSyncPushResult {
  const result = object(value);
  if (typeof result.processedAt !== 'string' || !Array.isArray(result.results)) {
    throw new Error('Desktop sync response is invalid.');
  }
  for (const entry of result.results) {
    const row = object(entry);
    if (
      typeof row.operationId !== 'string' ||
      typeof row.entityType !== 'string' ||
      typeof row.entityId !== 'string' ||
      !['accepted', 'conflict'].includes(String(row.status))
    ) {
      throw new Error('Desktop sync operation result is invalid.');
    }
  }
  return result as unknown as DesktopSyncPushResult;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sessionCookies(secret: string): string {
  const parsed = object(JSON.parse(secret));
  if (typeof parsed.cookies !== 'string') throw new Error('Protected session is invalid.');
  return parsed.cookies;
}
