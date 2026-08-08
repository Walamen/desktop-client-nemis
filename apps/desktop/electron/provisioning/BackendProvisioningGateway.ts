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
import { asRecord, unwrapCookies } from './sessionSecret';

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

  async downloadSnapshot(deviceId: string, since?: string): Promise<ProvisioningSnapshot> {
    const params = new URLSearchParams({ deviceId });
    if (since) params.set('since', since);
    return this.authorized(
      `/desktop/provisioning/snapshot?${params.toString()}`,
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

  // ─── Teacher assignments — dedicated push path ───────────────────────────
  // Not part of the generic sync_queue/outbox mechanism: the backend's
  // desktop-sync-applier has no case for this entity type at all (see
  // migration 019's doc comment), and these endpoints carry an optional file
  // upload the generic JSON payload mechanism can't. Reuses the same
  // cookie-session authorized() plumbing as everything else here — just with
  // a FormData body when a local attachment needs uploading.

  async createAssignment(
    fields: Readonly<Record<string, string>>,
    filePath?: string,
  ): Promise<AssignmentPushResult> {
    return this.authorized(
      '/teacher/assignments',
      { method: 'POST', body: await buildAssignmentBody(fields, filePath) },
      validateAssignmentPushResult,
    );
  }

  async updateAssignment(
    remoteId: string,
    fields: Readonly<Record<string, string>>,
    filePath?: string,
  ): Promise<AssignmentPushResult> {
    return this.authorized(
      `/teacher/assignments/${encodeURIComponent(remoteId)}`,
      { method: 'PATCH', body: await buildAssignmentBody(fields, filePath) },
      validateAssignmentPushResult,
    );
  }

  async gradeSubmission(
    assignmentRemoteId: string,
    studentId: string,
    payload: { grade: number; feedback?: string },
  ): Promise<void> {
    await this.authorized(
      `/teacher/assignments/${encodeURIComponent(assignmentRemoteId)}/submissions/${encodeURIComponent(studentId)}/grade`,
      { method: 'POST', body: JSON.stringify(payload) },
      () => undefined,
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
    const cookies = unwrapCookies(restored.sessionSecret);
    // FormData bodies must NOT get a hardcoded content-type — fetch derives
    // the correct `multipart/form-data; boundary=...` from the body itself.
    const isFormData = init.body instanceof FormData;
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          accept: 'application/json',
          ...(isFormData ? {} : { 'content-type': 'application/json' }),
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
    const root = asRecord(await response.json());
    return validate(root.data);
  }
}

export interface AssignmentPushResult {
  id: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

async function buildAssignmentBody(
  fields: Readonly<Record<string, string>>,
  filePath?: string,
): Promise<string | FormData> {
  if (!filePath) return JSON.stringify(fields);
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const buffer = await readFile(filePath);
  form.append('file', new Blob([buffer]), basename(filePath));
  return form;
}

function validateDevice(value: unknown): RegisteredDevice {
  const row = asRecord(value);
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
  const snapshot = asRecord(value);
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
  const data = asRecord(snapshot.data);
  const manifest = asRecord(snapshot.manifest);
  for (const collection of PROVISIONING_COLLECTIONS) {
    // A collection the backend doesn't yet know about (e.g. desktop shipped
    // ahead of a companion backend deploy) is legitimately absent, not
    // malformed — treat "missing" as "empty" rather than hard-failing every
    // sync for every role. A present-but-wrong-shaped value is still rejected.
    const rows = data[collection] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Snapshot collection ${collection} is invalid.`);
    const manifestCount = manifest[collection] ?? 0;
    if (!Number.isInteger(manifestCount) || manifestCount !== rows.length) {
      throw new Error(`Snapshot manifest count for ${collection} is invalid.`);
    }
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        throw new Error(`Snapshot collection ${collection} contains an invalid row.`);
      }
    }
    data[collection] = rows;
    manifest[collection] = manifestCount;
  }
  return snapshot as unknown as ProvisioningSnapshot;
}

function validateAssignmentPushResult(value: unknown): AssignmentPushResult {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || row.id.length === 0) {
    throw new Error('Assignment push response is invalid.');
  }
  return {
    id: row.id,
    attachmentUrl: typeof row.attachmentUrl === 'string' ? row.attachmentUrl : undefined,
    attachmentName: typeof row.attachmentName === 'string' ? row.attachmentName : undefined,
  };
}

function validateSyncResult(value: unknown): DesktopSyncPushResult {
  const result = asRecord(value);
  if (typeof result.processedAt !== 'string' || !Array.isArray(result.results)) {
    throw new Error('Desktop sync response is invalid.');
  }
  for (const entry of result.results) {
    const row = asRecord(entry);
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
