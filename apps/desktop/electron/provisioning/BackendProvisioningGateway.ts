import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '@nemis-desktop/application';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import {
  Gender,
  GradeLevel,
  PROVISIONING_COLLECTIONS,
  type RegistryClaimRequest,
  type RegistryClaimResult,
  type RegistryHit,
  type RegistryLookupRequest,
  type RegistryLookupResult,
  type RegistryReleaseRequest,
  type RegistryReleaseResult,
  type RemoteRecordRef,
  type SchoolSearchResult,
  type TransferCreateRequest,
  type TransferReviewRequest,
  type DeviceIdentity,
  type ProvisioningSnapshot,
  type RegisteredDevice,
  type DesktopSyncOperation,
  type DesktopSyncPushResult,
} from '@nemis-desktop/types';
import {
  ForbiddenError,
  OfflineError,
  RateLimitedError,
  RemoteRejectedError,
  UnauthorizedError,
} from '@nemis-desktop/shared';
import { asRecord, unwrapCookies } from './sessionSecret';

const ONLINE_COMMAND = { onlineCommand: true } as const;
/** student-registry.service.ts throws this as a ForbiddenException when a
 * school's lookup budget is spent. */
const LOOKUP_BUDGET_MESSAGE = 'Too many lookups. Please try again later.';

/** Opt-in query value asking the server to also send children of this school's
 * grade cohorts who have since left (minimal projection), so their stamps and
 * history stay resolvable. */
const DEPARTED_COHORT_FLAG = 'departedCohort';

export class BackendProvisioningGateway {
  /** Set once an older server rejected the opt-in flag; in memory only. */
  private departedCohortUnsupported = false;

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
    const request = (withDepartedCohort: boolean) => {
      const params = new URLSearchParams({ deviceId });
      if (since) params.set('since', since);
      if (withDepartedCohort) params.set('include', DEPARTED_COHORT_FLAG);
      return this.authorized(
        `/desktop/provisioning/snapshot?${params.toString()}`,
        {},
        validateSnapshot,
      );
    };
    if (this.departedCohortUnsupported) return request(false);
    try {
      return await request(true);
    } catch (error) {
      // The server's query schema is strict, so a server that predates the
      // flag answers 400 to it. Retry once without, and stop asking for the
      // rest of this gateway's life. Any other failure is not about the flag.
      if (!(error instanceof RemoteRejectedError) || error.status !== 400) throw error;
      this.departedCohortUnsupported = true;
      return request(false);
    }
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

  /** Audited payment reversal. Hits the same endpoint portal-web uses, so
   * the server creates the FeePaymentReversal row, re-aggregates the
   * obligation and writes the audit-log entry. The generic /desktop/sync/push
   * route cannot carry this: its applier rejects every non-create operation
   * on fee_payments. */
  async reverseFeePayment(
    paymentId: string,
    payload: { reason: string; notes?: string },
  ): Promise<void> {
    await this.authorized(
      `/finance/school-admin/fee-payments/${encodeURIComponent(paymentId)}/reverse`,
      { method: 'POST', body: JSON.stringify(payload) },
      () => undefined,
    );
  }

  /** National lookup — the only cross-tenant read. A miss is returned as
   * exactly `{ found: false }`: anything else in it is dropped so the
   * renderer cannot tell the two kinds of miss apart. */
  async lookupStudent(request: RegistryLookupRequest): Promise<RegistryLookupResult> {
    return this.authorized(
      '/student-registry/lookup',
      { method: 'POST', body: JSON.stringify({ nemisId: request.nemisId, dateOfBirth: request.dateOfBirth }) },
      toLookupResult,
      ONLINE_COMMAND,
    );
  }

  async claimStudent(request: RegistryClaimRequest): Promise<RegistryClaimResult> {
    return this.authorized(
      '/student-registry/claim',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => ({ studentId: requireId(value) }),
      ONLINE_COMMAND,
    );
  }

  async requestRelease(request: RegistryReleaseRequest): Promise<RegistryReleaseResult> {
    return this.authorized(
      '/student-registry/request',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => {
        const lapsesAt = asRecord(value).lapsesAt;
        return { id: requireId(value), lapsesAt: typeof lapsesAt === 'string' ? lapsesAt : null };
      },
      ONLINE_COMMAND,
    );
  }

  async createTransfer(request: TransferCreateRequest): Promise<RemoteRecordRef> {
    return this.authorized(
      '/student-transfers',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => ({ id: requireId(value) }),
      ONLINE_COMMAND,
    );
  }

  async reviewTransfer(request: TransferReviewRequest): Promise<RemoteRecordRef> {
    const { id, ...body } = request;
    return this.authorized(
      `/student-transfers/${encodeURIComponent(id)}/review`,
      { method: 'PATCH', body: JSON.stringify(body) },
      (value) => ({ id: requireId(value) }),
      ONLINE_COMMAND,
    );
  }

  async cancelTransfer(id: string): Promise<RemoteRecordRef> {
    await this.authorized(
      `/student-transfers/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      () => undefined,
      ONLINE_COMMAND,
    );
    return { id };
  }

  /** Destination-school search for "New transfer" — the desktop only stores
   * its own institution. Dedicated server endpoint (the generic institutions list is caller-scoped). Read-only. */
  async searchSchools(query: string): Promise<SchoolSearchResult[]> {
    const params = new URLSearchParams({ search: query });
    return this.authorized(
      `/student-transfers/destination-schools?${params.toString()}`,
      { method: 'GET' },
      toSchoolResults,
      ONLINE_COMMAND,
    );
  }

  private async authorized<T>(
    path: string,
    init: RequestInit,
    validate: (value: unknown) => T,
    options: { onlineCommand?: boolean } = {},
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
      throw new OfflineError(undefined, { cause: error });
    }
    if (response.status === 401) throw new UnauthorizedError();
    if (response.status === 403) {
      if (!options.onlineCommand) throw new ForbiddenError('This device is not authorized.');
      // The registry commands refuse on business grounds with a 403 and a
      // message (the server has no 429 anywhere); the lookup budget is the
      // one refusal the UI treats differently, recognised by its exact text.
      const message = await readRemoteMessage(response);
      if (message === LOOKUP_BUDGET_MESSAGE) throw new RateLimitedError(message);
      throw new RemoteRejectedError(403, message);
    }
    if (!response.ok) {
      // 4xx is the server refusing this request on its merits, with a message
      // written for the user; 5xx stays a plain transport failure. `message`
      // and `status` are unchanged on both paths — FeeReversalSyncService
      // branches on status (404/409) and embeds the message text.
      if (response.status === 429) throw new RateLimitedError(await readRemoteMessage(response));
      if (response.status >= 400 && response.status < 500) {
        throw new RemoteRejectedError(response.status, await readRemoteMessage(response));
      }
      throw Object.assign(new Error(`Provisioning request failed with status ${response.status}.`), {
        status: response.status,
      });
    }
    const root = asRecord(await response.json());
    return validate(root.data);
  }
}
/** The server's error envelope is `{ errorCode, message, errors? }`, where
 * class-validator failures put an array in `message`. Anything unreadable
 * yields undefined — the caller still classifies by status. */
async function readRemoteMessage(response: Response): Promise<string | undefined> {
  try {
    const message = asRecord(await response.json()).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  } catch {
    // Non-JSON body (proxy error page, empty body).
  }
  return undefined;
}

function toSchoolResults(value: unknown): SchoolSearchResult[] {
  const list = Array.isArray(value) ? value : asRecord(value).data;
  // An unreadable body is a server fault, not "no schools match".
  if (!Array.isArray(list)) throw new Error('Malformed server response.');
  return list.flatMap((item) => {
    const row = asRecord(item);
    return typeof row.id === 'string' && typeof row.name === 'string'
      ? [{ id: row.id, name: row.name, code: typeof row.code === 'string' ? row.code : '' }]
      : [];
  });
}

function requireId(value: unknown): string {
  const id = asRecord(value).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('Malformed server response.');
  return id;
}

const GRADE_LEVELS: readonly string[] = Object.values(GradeLevel);
const GENDERS: readonly string[] = Object.values(Gender);

function isGender(value: unknown): value is Gender {
  return typeof value === 'string' && GENDERS.includes(value);
}

function isGrade(value: unknown): value is GradeLevel {
  return typeof value === 'string' && GRADE_LEVELS.includes(value);
}

function toLookupResult(value: unknown): RegistryLookupResult {
  const row = asRecord(value);
  if (row.found !== true) return { found: false };
  const malformed = () => new Error('Malformed registry lookup response.');
  if (
    typeof row.nemisId !== 'string' ||
    typeof row.firstName !== 'string' ||
    typeof row.lastName !== 'string' ||
    !isGender(row.gender) ||
    (row.claimPath !== 'IMMEDIATE' && row.claimPath !== 'REQUIRES_APPROVAL')
  ) {
    throw malformed();
  }
  let lastCompletion: RegistryHit['lastCompletion'] = null;
  if (row.lastCompletion !== null && row.lastCompletion !== undefined) {
    const c = asRecord(row.lastCompletion);
    if (
      !isGrade(c.gradeLevel) ||
      (c.outcome !== 'PROMOTED' && c.outcome !== 'RETAINED' && c.outcome !== 'GRADUATED') ||
      !(c.nextGradeLevel === null || isGrade(c.nextGradeLevel)) ||
      typeof c.academicYearName !== 'string'
    ) {
      throw malformed();
    }
    lastCompletion = {
      gradeLevel: c.gradeLevel,
      outcome: c.outcome,
      nextGradeLevel: c.nextGradeLevel,
      academicYearName: c.academicYearName,
    };
  }
  return {
    found: true,
    nemisId: row.nemisId,
    firstName: row.firstName,
    lastName: row.lastName,
    gender: row.gender,
    lastCompletion,
    claimPath: row.claimPath,
  };
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
