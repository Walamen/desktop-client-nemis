# NEMIS ID Desktop Parity — Stage 2 (Online Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop a typed, online-only path from the renderer to the server's student-registry and student-transfer endpoints, with offline/rate-limit/server-rejection errors the renderer can show, and a forced pull afterwards so local SQLite reflects the change.

**Architecture:** `BackendProvisioningGateway` (main process) gains six typed methods and starts classifying failures into `OfflineError`, `RateLimitedError` and `RemoteRejectedError` (keeping the exact message text and `status` property existing sync code depends on). New `registry:*` and `transfer:*` IPC channels, school-admin only, call the gateway and then `DesktopSyncWorker.pullNow()`, which forces a delta pull regardless of the 5-minute pull window. `toIpcError` gains three codes; the renderer reaches the channels through new preload APIs and `nemis-bridge` files.

**Tech Stack:** Electron main process + better-sqlite3, TypeScript, Vitest. Desktop repo only — no server change in this stage.

**Spec:** `docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` — §2 (D3, D5), §6 (Stage 2). Read §6 before starting.

## Global Constraints

- Branch: `nemis-id-desktop-parity-stage-2` in `desktop-client-nemis` (already created from `main` @ `e4e7d60`; its first commit is this plan). Never commit to `main`.
- `OFFLINE` renderer message, verbatim: `You're offline. Connect to the internet to do this.`
- Remote messages passed to the renderer are capped at **500 characters** and stripped of control characters.
- `OFFLINE`, `RATE_LIMITED` and `REMOTE_REJECTED` are the only IPC codes whose message may come from the server; every other code keeps its fixed message.
- A registry lookup miss is **data** (`{ found: false }`), never an error, and carries no other field.
- `claimPath` is never sent to the server; request validators reject unknown keys.
- NEMIS IDs cross IPC as 12 bare digits: validators reject anything `normalizeNemisId()` cannot normalise; handlers pass the normalised value on.
- The pull is the single writer of local truth (spec D5): online responses are never written into SQLite.
- Existing consumers must keep working unchanged: `DesktopSyncWorker` matches the exact message `The NEMIS server could not be reached.`; `FeeReversalSyncService` reads `error.status` (404/409) and embeds `error.message` (`Provisioning request failed with status N.`).
- The user's Electron app is usually running and locks `node_modules/better-sqlite3/build/Release/better_sqlite3.node`. Never kill it. To test: rename the locked file aside, `pnpm rebuild:node`, test, then delete the node build and restore the original (2281472 bytes, Jun 18 09:16).
- Tests: `pnpm vitest run <path>` from repo root; `pnpm typecheck`; `pnpm lint` (6 pre-existing errors in `packages/domain/.../nemis-id.ts` and `scripts/bump-desktop-version.mjs` — not yours).
- Known unrelated failures: `renderer/app/page.test.tsx`, `teacher/timetable/timetable.test.tsx`, flaky `010-create-sync-outbox.test.ts`.
- `noUncheckedIndexedAccess` is on.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Scope rulings (deviations from spec §6, decided while planning)

- **ViewModels move to the stages that build the screens (3 and 4).** A ViewModel's shape is dictated by its screen; building one now with no consumer is speculative. Stage 2 ships the bridges, which is everything a ViewModel needs.
- **`GRADE_COMPLETION_GUIDANCE` and `STUDENT_BULK_CLAIM` move to Stages 5 and 6.** Their response shapes belong to those stages' designs; the error/refresh machinery built here is what they reuse.
- **`SYNC_RUN` is not reused for the refresh.** `syncActive()` only pulls when queued work exists or 5 minutes have passed, and returns immediately while a cycle runs — after a claim it would usually pull nothing. Task 3 adds `pullNow()`.
- **`useOnlineStatus()` is not added** — the renderer's existing `useConnectivityStore()` already exposes online state (spec §6.4 as amended).

## Review Focus

1. **The device is offline when the admin acts** — session restore fails with `AuthenticationUnavailableError`, not a fetch error, and must still reach the renderer as `OFFLINE`, not `UNEXPECTED_ERROR` (Task 1 test "maps session-restore unavailability to OFFLINE").
2. **A 4xx body with `message` as an array** (class-validator) must surface its first entry, not `[object Object]` or nothing (Task 2 test "array message").
3. **A sync cycle is already running when the command finishes** — `pullNow()` must wait for it and then pull, not silently return (Task 3 test "waits for an in-flight cycle").
4. **The server accepts the command but the refresh fails** (pull throws or the device drops offline) — the command must still report success with `refreshed: false`, never an error that invites a retry of a non-idempotent claim (Task 4 test "refresh failure").
5. **A server message containing newlines/terminal escapes or 10 KB of text** must reach the renderer as one clean line ≤ 500 chars (Task 1 test "sanitises").

---

### Task 1: Error contract — three classified failures and their IPC codes

**Files:**
- Modify: `packages/shared/src/errors.ts` (append three classes)
- Modify: `packages/shared/src/errors.test.ts`
- Modify: `packages/types/src/ipc.ts:345-355` (`IpcErrorCode`)
- Modify: `apps/desktop/electron/ipc/errorMapping.ts`
- Test: `apps/desktop/electron/ipc/errorMapping.test.ts`

**Interfaces:**
- Produces (all exported from `@nemis-desktop/shared`):
  - `class OfflineError extends ApplicationError` — `code: 'OFFLINE'`; constructor `(message = 'The NEMIS server could not be reached.', options?: { cause?: unknown })`.
  - `class RateLimitedError extends ApplicationError` — `code: 'RATE_LIMITED'`; `readonly status = 429`; `readonly remoteMessage: string | undefined`; constructor `(remoteMessage?: string, options?)`; `.message` is `Provisioning request failed with status 429.`
  - `class RemoteRejectedError extends ApplicationError` — `code: 'REMOTE_REJECTED'`; `readonly status: number`; `readonly remoteMessage: string | undefined`; constructor `(status: number, remoteMessage?: string, options?)`; `.message` is `Provisioning request failed with status ${status}.`
- Produces: `IpcErrorCode` gains `'OFFLINE' | 'RATE_LIMITED' | 'REMOTE_REJECTED'`; `sanitizeRemoteMessage(value: string | undefined): string | undefined` exported from `errorMapping.ts`.

- [ ] **Step 1: Branch**

```bash
cd "C:/Users/Alvin Dogba Jr/Desktop/Walamen/desktop-client-nemis" && git switch nemis-id-desktop-parity-stage-2  # already created; holds this plan
```

- [ ] **Step 2: Write failing tests for the error classes**

Append to `packages/shared/src/errors.test.ts` (match its existing import style; add the three names to the import from `./errors`):

```ts
describe('online-command errors', () => {
  it('OfflineError keeps the exact text the sync worker matches on', () => {
    const error = new OfflineError();
    expect(error.code).toBe('OFFLINE');
    expect(error.message).toBe('The NEMIS server could not be reached.');
    expect(error).toBeInstanceOf(ApplicationError);
  });

  it('RemoteRejectedError keeps the transport message and status, and carries the server text separately', () => {
    const error = new RemoteRejectedError(404, 'Transfer request not found');
    expect(error.code).toBe('REMOTE_REJECTED');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Provisioning request failed with status 404.');
    expect(error.remoteMessage).toBe('Transfer request not found');
  });

  it('RateLimitedError is a 429 with the server text separately', () => {
    const error = new RateLimitedError('Too many lookups. Try again in an hour.');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.message).toBe('Provisioning request failed with status 429.');
    expect(error.remoteMessage).toBe('Too many lookups. Try again in an hour.');
  });

  it('toIpcErrorPayload still masks these codes (only the main-process mapper may expose them)', () => {
    expect(toIpcErrorPayload(new RemoteRejectedError(400, 'secret')).code).toBe('UNEXPECTED_ERROR');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run packages/shared/src/errors.test.ts`
Expected: FAIL — `OfflineError` (etc.) is not exported.

- [ ] **Step 4: Implement the classes**

Append to `packages/shared/src/errors.ts` (after `UnauthorizedError`; leave `APPLICATION_CODES` unchanged):

```ts
/** The NEMIS server could not be reached (network down, DNS, timeout). The
 * default message is load-bearing: DesktopSyncWorker recognises an
 * unreachable server by this exact text and returns queued items unpenalised. */
export class OfflineError extends ApplicationError {
  constructor(message = 'The NEMIS server could not be reached.', options?: { cause?: unknown }) {
    super('OFFLINE', message, options);
  }
}

/** The server answered 4xx (other than 401/403/429). `message` stays the
 * transport text existing sync code embeds; the server's own explanation is
 * kept apart in `remoteMessage`, and only the main-process IPC mapper decides
 * whether it may reach the renderer. */
export class RemoteRejectedError extends ApplicationError {
  readonly status: number;
  readonly remoteMessage: string | undefined;

  constructor(status: number, remoteMessage?: string, options?: { cause?: unknown }) {
    super('REMOTE_REJECTED', `Provisioning request failed with status ${status}.`, options);
    this.status = status;
    this.remoteMessage = remoteMessage;
  }
}

/** The server answered 429 — a registry rate-limit budget is spent. */
export class RateLimitedError extends ApplicationError {
  readonly status = 429;
  readonly remoteMessage: string | undefined;

  constructor(remoteMessage?: string, options?: { cause?: unknown }) {
    super('RATE_LIMITED', 'Provisioning request failed with status 429.', options);
    this.remoteMessage = remoteMessage;
  }
}
```

Check `packages/shared/src/index.ts` re-exports everything from `./errors` (it exports `ApplicationError` today; if it lists names individually, add the three).

- [ ] **Step 5: Run the shared tests**

Run: `pnpm vitest run packages/shared/src/errors.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing mapper tests**

Append to `apps/desktop/electron/ipc/errorMapping.test.ts` (add imports: `OfflineError`, `RateLimitedError`, `RemoteRejectedError` from `@nemis-desktop/shared`; `AuthenticationUnavailableError` from `@nemis-desktop/application`; `sanitizeRemoteMessage` from `./errorMapping`):

```ts
describe('online-command errors', () => {
  it('maps OfflineError to OFFLINE with the fixed message', () => {
    expect(toIpcError(new OfflineError())).toEqual({
      code: 'OFFLINE',
      message: "You're offline. Connect to the internet to do this.",
    });
  });

  it('maps session-restore unavailability to OFFLINE', () => {
    expect(toIpcError(new AuthenticationUnavailableError('The NEMIS server could not be reached.')).code)
      .toBe('OFFLINE');
  });

  it("passes the server's own message through for REMOTE_REJECTED and RATE_LIMITED", () => {
    expect(toIpcError(new RemoteRejectedError(400, 'This request was withdrawn while the transfer was being completed.')))
      .toEqual({ code: 'REMOTE_REJECTED', message: 'This request was withdrawn while the transfer was being completed.' });
    expect(toIpcError(new RateLimitedError('Too many failed lookups. Try again in an hour.')))
      .toEqual({ code: 'RATE_LIMITED', message: 'Too many failed lookups. Try again in an hour.' });
  });

  it('falls back to a fixed message when the server sent none', () => {
    expect(toIpcError(new RemoteRejectedError(400))).toEqual({
      code: 'REMOTE_REJECTED',
      message: 'The server could not complete this request.',
    });
    expect(toIpcError(new RateLimitedError())).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait and try again later.',
    });
  });

  it('sanitises: control characters become spaces, whitespace collapses, length is capped at 500', () => {
    expect(sanitizeRemoteMessage('line one\nline two\u001b[31m red')).toBe('line one line two [31m red');
    const long = sanitizeRemoteMessage('x'.repeat(10_000));
    expect(long).toHaveLength(500);
    expect(long?.endsWith('…')).toBe(true);
    expect(sanitizeRemoteMessage('   \n\t ')).toBeUndefined();
    expect(sanitizeRemoteMessage(undefined)).toBeUndefined();
  });

  it('finds an online-command error wrapped as a cause', () => {
    expect(toIpcError(new Error('wrapper', { cause: new OfflineError() })).code).toBe('OFFLINE');
  });
});
```

(If `AuthenticationUnavailableError`'s constructor signature differs, match it — see `packages/application` exports.)

- [ ] **Step 7: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/electron/ipc/errorMapping.test.ts`
Expected: FAIL — `sanitizeRemoteMessage` not exported; codes map to `UNEXPECTED_ERROR`.

- [ ] **Step 8: Extend `IpcErrorCode`**

In `packages/types/src/ipc.ts`:

```ts
export type IpcErrorCode =
  | 'VALIDATION_FAILED'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'DATABASE_UNAVAILABLE'
  | 'MIGRATION_REQUIRED'
  | 'IPC_ERROR'
  | 'UNEXPECTED_ERROR'
  // Online-only commands (NEMIS ID desktop parity spec §6.2). The only codes
  // whose message may come from the server rather than a fixed table.
  | 'OFFLINE'
  | 'RATE_LIMITED'
  | 'REMOTE_REJECTED';
```

- [ ] **Step 9: Map them**

In `apps/desktop/electron/ipc/errorMapping.ts`:

Imports:

```ts
import {
  ApplicationError,
  OfflineError,
  RateLimitedError,
  RemoteRejectedError,
  toIpcErrorPayload,
} from '@nemis-desktop/shared';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
```

Add to `CODE_MESSAGES`:

```ts
  OFFLINE: "You're offline. Connect to the internet to do this.",
  RATE_LIMITED: 'Too many attempts. Please wait and try again later.',
  REMOTE_REJECTED: 'The server could not complete this request.',
```

Add the sanitiser (exported, above `toIpcError`):

```ts
const REMOTE_MESSAGE_MAX = 500;

/** Server-authored text is the one exception to "internal text never crosses
 * IPC": it was written for the user by our own server. It still arrives as
 * untrusted bytes, so it is flattened to one printable line and capped. */
export function sanitizeRemoteMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > REMOTE_MESSAGE_MAX
    ? `${cleaned.slice(0, REMOTE_MESSAGE_MAX - 1)}…`
    : cleaned;
}
```

At the top of `mapError` (before the `ValidationError` branch — these are `ApplicationError`s and must be caught before the generic `ApplicationError` branch masks them):

```ts
  if (error instanceof OfflineError || error instanceof AuthenticationUnavailableError) {
    return payloadFor('OFFLINE');
  }
  if (error instanceof RateLimitedError) {
    return { code: 'RATE_LIMITED', message: sanitizeRemoteMessage(error.remoteMessage) ?? CODE_MESSAGES.RATE_LIMITED };
  }
  if (error instanceof RemoteRejectedError) {
    return { code: 'REMOTE_REJECTED', message: sanitizeRemoteMessage(error.remoteMessage) ?? CODE_MESSAGES.REMOTE_REJECTED };
  }
```

(The existing cause-unwrap at the bottom already recurses into `mapError`, so a wrapped error is found; it only returns the inner result when it is not `UNEXPECTED_ERROR`.)

- [ ] **Step 10: Run the mapper tests, typecheck**

Run: `pnpm vitest run apps/desktop/electron/ipc/errorMapping.test.ts packages/shared && pnpm typecheck`
Expected: PASS; typecheck clean (any other exhaustive `Record<IpcErrorCode, …>` it flags gets the same three entries).

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/errors.ts packages/shared/src/errors.test.ts packages/shared/src/index.ts packages/types/src/ipc.ts apps/desktop/electron/ipc/errorMapping.ts apps/desktop/electron/ipc/errorMapping.test.ts
git commit -m "feat(ipc): classify offline, rate-limited and server-rejected failures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Gateway — classify failures and add the six registry/transfer calls

**Files:**
- Create: `packages/types/src/registry.ts`
- Modify: `packages/types/src/index.ts` (export it)
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (`authorized()` ~lines 127–177; new methods after `reverseFeePayment`)
- Test: `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts`

**Interfaces:**
- Consumes: Task 1's `OfflineError`, `RateLimitedError`, `RemoteRejectedError`.
- Produces — `packages/types/src/registry.ts` (exported from `@nemis-desktop/types`):

```ts
import type { GradeLevel } from './enums';

/** Shapes mirror Nemis/apps/server/src/student-registry/dto/*.ts,
 * Nemis/apps/server/src/student-transfers/dto/*.ts and the client type in
 * Nemis/apps/portal-web/src/store/school-admin/Api/studentRegistryApi.ts.
 * The desktop cannot import across repos, so changes there must be mirrored here. */

export interface RegistryLookupRequest {
  /** 12 bare digits. */
  nemisId: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
}

export interface RegistryLastCompletion {
  gradeLevel: GradeLevel;
  outcome: 'PROMOTED' | 'RETAINED' | 'GRADUATED';
  /** Null for GRADUATED — there is nothing to pre-fill. */
  nextGradeLevel: GradeLevel | null;
  academicYearName: string;
}

export interface RegistryHit {
  found: true;
  nemisId: string;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  lastCompletion: RegistryLastCompletion | null;
  claimPath: 'IMMEDIATE' | 'REQUIRES_APPROVAL';
}

/** A miss is uniform: a wrong ID and a wrong birth date are indistinguishable. */
export type RegistryLookupResult = { found: false } | RegistryHit;

export interface RegistryClaimRequest {
  nemisId: string;
  dateOfBirth: string;
  classId: string;
  termId: string;
  gradeLevel: GradeLevel;
  /** Required by the server when gradeLevel differs from the stamp. */
  overrideReason?: string;
}

export interface RegistryReleaseRequest {
  nemisId: string;
  dateOfBirth: string;
  classId: string;
  termId: string;
  gradeLevel: GradeLevel;
  reason: string;
}

export interface TransferCreateRequest {
  studentId: string;
  toInstitutionId: string;
  reason: string;
  requestedDate?: string;
  toGradeLevel?: GradeLevel;
}

export interface TransferReviewRequest {
  id: string;
  status: 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  classId?: string;
  termId?: string;
}

/** Every online mutation reports whether the post-command pull ran. When
 * `refreshed` is false the server change happened but local data has not
 * caught up yet — the UI says so instead of offering a retry. */
export interface OnlineCommandResult<T> {
  data: T;
  refreshed: boolean;
}

export interface RemoteRecordRef {
  id: string;
}

export interface RegistryClaimResult {
  studentId: string;
}
```

- Produces — gateway methods:
  - `lookupStudent(request: RegistryLookupRequest): Promise<RegistryLookupResult>` → `POST /student-registry/lookup`
  - `claimStudent(request: RegistryClaimRequest): Promise<RegistryClaimResult>` → `POST /student-registry/claim`
  - `requestRelease(request: RegistryReleaseRequest): Promise<RemoteRecordRef>` → `POST /student-registry/request`
  - `createTransfer(request: TransferCreateRequest): Promise<RemoteRecordRef>` → `POST /student-transfers`
  - `reviewTransfer(request: TransferReviewRequest): Promise<RemoteRecordRef>` → `PATCH /student-transfers/:id/review` (body excludes `id`)
  - `cancelTransfer(id: string): Promise<RemoteRecordRef>` → `DELETE /student-transfers/:id` (returns `{ id }`)

- [ ] **Step 1: Write the failing gateway tests**

Append inside `describe('BackendProvisioningGateway', ...)`:

```ts
  describe('online commands', () => {
    function errorResponse(status: number, body: unknown): Response {
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }

    it('a network failure is an OfflineError with the text the sync worker matches', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
      const error = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OfflineError);
      expect((error as Error).message).toBe('The NEMIS server could not be reached.');
    });

    it('a 4xx keeps the transport message and status, and carries the server message separately', async () => {
      vi.stubGlobal('fetch', vi.fn(async () =>
        errorResponse(409, { success: false, errorCode: 'CONFLICT', message: 'This request was withdrawn while the transfer was being completed.' })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRejectedError);
      expect((error as RemoteRejectedError).status).toBe(409);
      expect((error as Error).message).toBe('Provisioning request failed with status 409.');
      expect((error as RemoteRejectedError).remoteMessage).toBe('This request was withdrawn while the transfer was being completed.');
    });

    it('array message: surfaces the first validation message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () =>
        errorResponse(400, { message: ['classId should not be empty', 'termId should not be empty'] })));
      const error = await buildGateway()
        .requestRelease({ nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: '', termId: '', gradeLevel: 'GRADE_7' as never, reason: 'x' })
        .catch((e: unknown) => e);
      expect((error as RemoteRejectedError).remoteMessage).toBe('classId should not be empty');
    });

    it('a 4xx with a non-JSON body still classifies, with no server message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 404 })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRejectedError);
      expect((error as RemoteRejectedError).remoteMessage).toBeUndefined();
    });

    it('a 429 is a RateLimitedError', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(429, { message: 'Too many failed lookups. Try again in an hour.' })));
      const error = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).remoteMessage).toBe('Too many failed lookups. Try again in an hour.');
    });

    it('a 5xx stays a plain Error carrying status (unchanged behaviour)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(500, { message: 'boom' })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(RemoteRejectedError);
      expect((error as { status?: number }).status).toBe(500);
    });

    it('a lookup miss returns exactly { found: false }, dropping anything else', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ found: false, debug: 'should not leak' })));
      expect(await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' }))
        .toEqual({ found: false });
    });

    it('a lookup hit is built field by field and posts only nemisId + dateOfBirth', async () => {
      const fetchMock = vi.fn(async () => response({
        found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE',
        lastCompletion: { gradeLevel: 'GRADE_6', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_7', academicYearName: '2025/2026' },
        claimPath: 'IMMEDIATE', institutionId: 'should-not-leak',
      }));
      vi.stubGlobal('fetch', fetchMock);
      const result = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
      expect(result).toEqual({
        found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE',
        lastCompletion: { gradeLevel: 'GRADE_6', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_7', academicYearName: '2025/2026' },
        claimPath: 'IMMEDIATE',
      });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-registry/lookup'));
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
    });

    it('a malformed hit is rejected rather than half-trusted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ found: true, nemisId: 7 })));
      await expect(buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' }))
        .rejects.toThrow('Malformed registry lookup response.');
    });

    it('claim returns the moved student id', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ id: 'student-9', institutionId: 'school-1', gradeLevel: 'GRADE_7' })));
      expect(await buildGateway().claimStudent({
        nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7' as never,
      })).toEqual({ studentId: 'student-9' });
    });

    it('review PATCHes the id path with a body that excludes id', async () => {
      const fetchMock = vi.fn(async () => response({ id: 't-1', status: 'APPROVED' }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().reviewTransfer({ id: 't-1', status: 'APPROVED', classId: 'c', termId: 't' }))
        .toEqual({ id: 't-1' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-transfers/t-1/review'));
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(String(init.body))).toEqual({ status: 'APPROVED', classId: 'c', termId: 't' });
    });

    it('cancel DELETEs and returns the id it was given', async () => {
      const fetchMock = vi.fn(async () => response({ message: 'cancelled' }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().cancelTransfer('t 1')).toEqual({ id: 't 1' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-transfers/t%201'));
      expect(init.method).toBe('DELETE');
    });
  });
```

Add imports at the top: `import { OfflineError, RateLimitedError, RemoteRejectedError } from '@nemis-desktop/shared';`

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts -t "online commands"`
Expected: FAIL — `lookupStudent` (etc.) is not a function.

- [ ] **Step 3: Add the types file**

Create `packages/types/src/registry.ts` with the content in **Interfaces** above, and add `export * from './registry';` to `packages/types/src/index.ts` (follow the file's existing style).

- [ ] **Step 4: Classify failures in `authorized()`**

Imports in the gateway: add `OfflineError, RateLimitedError, RemoteRejectedError` to the `@nemis-desktop/shared` import, and the six request/result types to the `@nemis-desktop/types` import.

Replace the fetch-failure throw:

```ts
    } catch (error) {
      throw new OfflineError(undefined, { cause: error });
    }
```

Replace the `!response.ok` block (keep the 401/403 lines above it unchanged):

```ts
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
```

Add this module-level helper below the class:

```ts
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
```

- [ ] **Step 5: Add the six methods**

After `reverseFeePayment`:

```ts
  /** National lookup — the only cross-tenant read. A miss is returned as
   * exactly `{ found: false }`: anything else in it is dropped so the
   * renderer cannot tell the two kinds of miss apart. */
  async lookupStudent(request: RegistryLookupRequest): Promise<RegistryLookupResult> {
    return this.authorized(
      '/student-registry/lookup',
      { method: 'POST', body: JSON.stringify({ nemisId: request.nemisId, dateOfBirth: request.dateOfBirth }) },
      toLookupResult,
    );
  }

  async claimStudent(request: RegistryClaimRequest): Promise<RegistryClaimResult> {
    return this.authorized(
      '/student-registry/claim',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => ({ studentId: requireId(value) }),
    );
  }

  async requestRelease(request: RegistryReleaseRequest): Promise<RemoteRecordRef> {
    return this.authorized(
      '/student-registry/request',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => ({ id: requireId(value) }),
    );
  }

  async createTransfer(request: TransferCreateRequest): Promise<RemoteRecordRef> {
    return this.authorized(
      '/student-transfers',
      { method: 'POST', body: JSON.stringify(request) },
      (value) => ({ id: requireId(value) }),
    );
  }

  async reviewTransfer(request: TransferReviewRequest): Promise<RemoteRecordRef> {
    const { id, ...body } = request;
    return this.authorized(
      `/student-transfers/${encodeURIComponent(id)}/review`,
      { method: 'PATCH', body: JSON.stringify(body) },
      (value) => ({ id: requireId(value) }),
    );
  }

  async cancelTransfer(id: string): Promise<RemoteRecordRef> {
    await this.authorized(
      `/student-transfers/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      () => undefined,
    );
    return { id };
  }
```

Module-level validators below the class:

```ts
function requireId(value: unknown): string {
  const id = asRecord(value).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('Malformed server response.');
  return id;
}

const GRADE_LEVELS: readonly string[] = Object.values(GradeLevel);

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
    (row.gender !== 'MALE' && row.gender !== 'FEMALE') ||
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
```

Import `RegistryHit` (type) and the runtime `GradeLevel` enum from `@nemis-desktop/types`. The server returns `lastCompletion` as an object or `null`; `undefined` is treated as `null`.

- [ ] **Step 6: Run the gateway suite and typecheck**

Run: `pnpm vitest run apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/electron/sync && pnpm typecheck`
Expected: PASS — including the existing `DesktopSyncWorker` and `FeeReversalSyncService` tests, which prove the unreachable-message and `status` contracts still hold.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/registry.ts packages/types/src/index.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts
git commit -m "feat(gateway): classify server failures and add registry/transfer calls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sync worker — `pullNow()` forces a delta pull

**Files:**
- Modify: `apps/desktop/electron/sync/DesktopSyncWorker.ts` (new public method after `releaseBackoff()` ~line 353)
- Test: `apps/desktop/electron/sync/DesktopSyncWorker.test.ts`

**Interfaces:**
- Produces: `DesktopSyncWorker.pullNow(): Promise<boolean>` — resolves `true` only if a pull was imported during this call; never throws.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('DesktopSyncWorker retry policy', ...)` (the suite's `workspaces`, `manager`, `emptySnapshot()`, `alwaysOnline()` are in scope):

```ts
  describe('pullNow', () => {
    it('pulls even inside the 5-minute window, and reports that it did', async () => {
      const downloadSnapshot = vi.fn().mockResolvedValue(emptySnapshot());
      const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
      const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());
      await worker.syncActive(); // first cycle pulls and starts the 5-minute window
      expect(downloadSnapshot).toHaveBeenCalledTimes(1);

      await worker.syncActive(); // inside the window: nothing queued, no pull
      expect(downloadSnapshot).toHaveBeenCalledTimes(1);

      expect(await worker.pullNow()).toBe(true);
      expect(downloadSnapshot).toHaveBeenCalledTimes(2);
    });

    it('reports false when offline, without touching the network', async () => {
      const downloadSnapshot = vi.fn();
      const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
      const worker = new DesktopSyncWorker(workspaces, gateway, { isOnline: () => false });
      expect(await worker.pullNow()).toBe(false);
      expect(downloadSnapshot).not.toHaveBeenCalled();
    });

    it('reports false, without throwing, when the pull fails', async () => {
      const downloadSnapshot = vi.fn().mockRejectedValue(new Error('The NEMIS server could not be reached.'));
      const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
      const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());
      await expect(worker.pullNow()).resolves.toBe(false);
    });

    it('waits for an in-flight cycle, then pulls', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const downloadSnapshot = vi.fn()
        .mockImplementationOnce(async () => { await gate; return emptySnapshot(); })
        .mockResolvedValue(emptySnapshot());
      const gateway = { pushChanges: vi.fn(), downloadSnapshot } as unknown as BackendProvisioningGateway;
      const worker = new DesktopSyncWorker(workspaces, gateway, alwaysOnline());

      const running = worker.syncActive(); // holds the cycle open on `gate`
      const forced = worker.pullNow();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(downloadSnapshot).toHaveBeenCalledTimes(1); // still waiting
      release();
      await running;
      expect(await forced).toBe(true);
      expect(downloadSnapshot).toHaveBeenCalledTimes(2);
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/electron/sync/DesktopSyncWorker.test.ts -t "pullNow"`
Expected: FAIL — `worker.pullNow is not a function`.

- [ ] **Step 3: Implement**

Add a field beside `#running`/`#lastPullAt`:

```ts
  /** The cycle currently running, so pullNow() can wait for it instead of
   * being turned away by the #running guard. */
  #cycle: Promise<void> | null = null;
```

Change `syncActive()` so it records its cycle without altering its own behaviour — rename the existing method body to a private `async #runCycle(): Promise<void>` (unchanged content), and make:

```ts
  async syncActive(): Promise<void> {
    if (this.#running) return;
    const cycle = this.#runCycle();
    this.#cycle = cycle;
    try {
      await cycle;
    } finally {
      if (this.#cycle === cycle) this.#cycle = null;
    }
  }
```

(`#runCycle` keeps its own first-line `if (this.#running) return;` and every other line exactly as today.)

Add the public method after `releaseBackoff()`:

```ts
  /** Forces a delta pull now — after an online command changed server state
   * that this device must reflect (NEMIS ID desktop parity spec §6.3). The
   * normal cycle only pulls every 5 minutes or after pushing queued work, so
   * a claim or a transfer review would otherwise not appear for minutes.
   * Waits for a cycle already in progress rather than skipping. Resolves true
   * only if a pull was imported; never throws — the server change already
   * happened, so a failed refresh is a display concern, not an error. */
  async pullNow(): Promise<boolean> {
    try {
      if (this.#cycle) await this.#cycle;
      this.#lastPullAt = 0;
      await this.syncActive();
      return this.#lastPullAt !== 0;
    } catch (error) {
      logger.error('DesktopSyncWorker.pullNow failed', error);
      return false;
    }
  }
```

Note: a pull that never ran (offline, no workspace, queued work still pending) leaves `#lastPullAt` at 0, so the next scheduled cycle pulls immediately — the intended catch-up. If `#runCycle` swallows a download error internally, `#lastPullAt` also stays 0 and the result is `false`.

- [ ] **Step 4: Run the worker suite**

Run: `pnpm vitest run apps/desktop/electron/sync/DesktopSyncWorker.test.ts`
Expected: PASS (all, including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/sync/DesktopSyncWorker.ts apps/desktop/electron/sync/DesktopSyncWorker.test.ts
git commit -m "feat(sync): pullNow forces a delta pull after an online command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: IPC — six school-admin channels with validation, authorisation and refresh

**Files:**
- Modify: `packages/types/src/ipc.ts` (`IpcContract` entries + `IpcChannels` constants)
- Modify: `apps/desktop/electron/security/validateIpc.ts` (four new validators)
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts` (`SCHOOL_ADMIN_CHANNELS`)
- Create: `apps/desktop/electron/ipc/handlers/school-admin/online.ts`
- Create: `apps/desktop/electron/ipc/handlers/school-admin/registry.ts`
- Create: `apps/desktop/electron/ipc/handlers/school-admin/transfers.ts`
- Modify: `apps/desktop/electron/ipc/registrar.ts` (signature + registration)
- Modify: `apps/desktop/electron/main/main.ts:159` (pass the gateway)
- Test: `apps/desktop/electron/ipc/handlers/school-admin/online-commands.test.ts`
- Test: `apps/desktop/electron/ipc/authorizeChannel.test.ts`

**Interfaces:**
- Consumes: Task 2's gateway methods and `@nemis-desktop/types` registry types; Task 3's `pullNow()`.
- Produces — channels (`IpcChannels` key → channel → contract):

| Key | Channel | args | result |
|---|---|---|---|
| `REGISTRY_LOOKUP` | `registry:lookup` | `[request: RegistryLookupRequest]` | `RegistryLookupResult` |
| `REGISTRY_CLAIM` | `registry:claim` | `[request: RegistryClaimRequest]` | `OnlineCommandResult<RegistryClaimResult>` |
| `REGISTRY_REQUEST` | `registry:request` | `[request: RegistryReleaseRequest]` | `OnlineCommandResult<RemoteRecordRef>` |
| `TRANSFER_CREATE` | `transfer:create` | `[request: TransferCreateRequest]` | `OnlineCommandResult<RemoteRecordRef>` |
| `TRANSFER_REVIEW` | `transfer:review` | `[request: TransferReviewRequest]` | `OnlineCommandResult<RemoteRecordRef>` |
| `TRANSFER_CANCEL` | `transfer:cancel` | `[id: string]` | `OnlineCommandResult<RemoteRecordRef>` |

- Produces: `registerRegistryHandlers(handle: IpcHandle, gateway: RegistryGateway, refresh: () => Promise<boolean>)` and `registerTransferHandlers(handle: IpcHandle, gateway: TransferGateway, refresh: () => Promise<boolean>)`; `runOnline<T>(command: () => Promise<T>, refresh: () => Promise<boolean>): Promise<OnlineCommandResult<T>>`.

- [ ] **Step 1: Write the failing handler tests**

`online-commands.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { IpcChannel } from '@nemis-desktop/types';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerRegistryHandlers } from './registry';
import { registerTransferHandlers } from './transfers';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function capture() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

const VALID_ID = '482915736045';
const DASHED_ID = '4829-1573-6045';

function registryGateway() {
  return {
    lookupStudent: vi.fn(async () => ({ found: false as const })),
    claimStudent: vi.fn(async () => ({ studentId: 'student-9' })),
    requestRelease: vi.fn(async () => ({ id: 'transfer-1' })),
  };
}

function transferGateway() {
  return {
    createTransfer: vi.fn(async () => ({ id: 'transfer-2' })),
    reviewTransfer: vi.fn(async () => ({ id: 'transfer-3' })),
    cancelTransfer: vi.fn(async (id: string) => ({ id })),
  };
}

describe('registry IPC handlers', () => {
  it('lookup validates, normalises the NEMIS ID, and does NOT refresh', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    const lookup = calls.get('registry:lookup')!;

    expect(() => lookup.validate([{ nemisId: DASHED_ID, dateOfBirth: '2012-01-01' }])).not.toThrow();
    expect(() => lookup.validate([{ nemisId: '482915736046', dateOfBirth: '2012-01-01' }])).toThrow(); // bad checksum
    expect(() => lookup.validate([{ nemisId: VALID_ID, dateOfBirth: 'yesterday' }])).toThrow();
    expect(() => lookup.validate([{ nemisId: VALID_ID, dateOfBirth: '2012-01-01', claimPath: 'IMMEDIATE' }])).toThrow();

    expect(await lookup.handler({ nemisId: DASHED_ID, dateOfBirth: '2012-01-01' })).toEqual({ found: false });
    expect(gateway.lookupStudent).toHaveBeenCalledWith({ nemisId: VALID_ID, dateOfBirth: '2012-01-01' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('claim forwards the normalised request and refreshes after success', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    const claim = calls.get('registry:claim')!;
    const request = { nemisId: DASHED_ID, dateOfBirth: '2012-01-01', classId: 'class-1', termId: 'term-1', gradeLevel: 'GRADE_7' };

    expect(() => claim.validate([request])).not.toThrow();
    expect(() => claim.validate([{ ...request, gradeLevel: 'GRADE_99' }])).toThrow();
    expect(() => claim.validate([{ ...request, classId: undefined }])).toThrow();

    expect(await claim.handler(request)).toEqual({ data: { studentId: 'student-9' }, refreshed: true });
    expect(gateway.claimStudent).toHaveBeenCalledWith({ ...request, nemisId: VALID_ID });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a rejected command does not refresh, and the error propagates', async () => {
    const { calls, handle } = capture();
    const gateway = registryGateway();
    gateway.claimStudent.mockRejectedValueOnce(new RemoteRejectedError(400, 'A reason is required to override the grade.'));
    const refresh = vi.fn(async () => true);
    registerRegistryHandlers(handle, gateway, refresh);
    await expect(calls.get('registry:claim')!.handler({
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7',
    })).rejects.toBeInstanceOf(RemoteRejectedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refresh failure: the command still succeeds, reporting refreshed false', async () => {
    const { calls, handle } = capture();
    registerRegistryHandlers(handle, registryGateway(), vi.fn(async () => { throw new Error('pull failed'); }));
    expect(await calls.get('registry:request')!.handler({
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7', reason: 'Moving',
    })).toEqual({ data: { id: 'transfer-1' }, refreshed: false });
  });

  it('request requires a non-empty reason', () => {
    const { calls, handle } = capture();
    registerRegistryHandlers(handle, registryGateway(), vi.fn(async () => true));
    expect(() => calls.get('registry:request')!.validate([{
      nemisId: VALID_ID, dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7', reason: '',
    }])).toThrow();
  });
});

describe('transfer IPC handlers', () => {
  it('review accepts only APPROVED/REJECTED and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    const refresh = vi.fn(async () => true);
    registerTransferHandlers(handle, gateway, refresh);
    const review = calls.get('transfer:review')!;

    expect(() => review.validate([{ id: 't-1', status: 'APPROVED', classId: 'c', termId: 't' }])).not.toThrow();
    expect(() => review.validate([{ id: 't-1', status: 'PENDING' }])).toThrow();
    expect(await review.handler({ id: 't-1', status: 'REJECTED', reviewNotes: 'Wrong child' }))
      .toEqual({ data: { id: 'transfer-3' }, refreshed: true });
    expect(gateway.reviewTransfer).toHaveBeenCalledWith({ id: 't-1', status: 'REJECTED', reviewNotes: 'Wrong child' });
  });

  it('cancel takes a single id and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    registerTransferHandlers(handle, gateway, vi.fn(async () => true));
    const cancel = calls.get('transfer:cancel')!;
    expect(() => cancel.validate(['t-1'])).not.toThrow();
    expect(() => cancel.validate([])).toThrow();
    expect(await cancel.handler('t-1')).toEqual({ data: { id: 't-1' }, refreshed: true });
  });

  it('create validates its fields and refreshes', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    registerTransferHandlers(handle, gateway, vi.fn(async () => true));
    const create = calls.get('transfer:create')!;
    const request = { studentId: 's-1', toInstitutionId: 'school-2', reason: 'Relocation', toGradeLevel: 'GRADE_7' };
    expect(() => create.validate([request])).not.toThrow();
    expect(() => create.validate([{ ...request, toInstitutionId: '' }])).toThrow();
    expect(await create.handler(request)).toEqual({ data: { id: 'transfer-2' }, refreshed: true });
  });
});
```

Append to `apps/desktop/electron/ipc/authorizeChannel.test.ts` (copy the file's own workspace stub for a TEACHER and an INSTITUTION_ADMIN):

```ts
  it.each(['registry:lookup', 'registry:claim', 'registry:request', 'transfer:create', 'transfer:review', 'transfer:cancel'] as const)(
    '%s is school-admin only',
    (channel) => {
      expect(() => authorizeChannel(channel, workspacesFor(SystemRole.TEACHER))).toThrow(ForbiddenError);
      expect(() => authorizeChannel(channel, workspacesFor(SystemRole.INSTITUTION_ADMIN))).not.toThrow();
    },
  );
```

(If the file has no `workspacesFor` helper, write one in the test returning `{ active: { user: { role } } } as unknown as WorkspaceManager`.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/desktop/electron/ipc`
Expected: FAIL — modules `./registry`, `./transfers` not found; channels unknown.

- [ ] **Step 3: Contract and channel constants**

In `packages/types/src/ipc.ts` import the registry types and add to `IpcContract` (after `'school-admin:reverse-payment'`):

```ts
  // Online-only commands (NEMIS ID desktop parity spec §6). These call the
  // server directly; mutations refresh local data with a forced pull.
  'registry:lookup': { args: [request: RegistryLookupRequest]; result: RegistryLookupResult };
  'registry:claim': {
    args: [request: RegistryClaimRequest];
    result: OnlineCommandResult<RegistryClaimResult>;
  };
  'registry:request': {
    args: [request: RegistryReleaseRequest];
    result: OnlineCommandResult<RemoteRecordRef>;
  };
  'transfer:create': {
    args: [request: TransferCreateRequest];
    result: OnlineCommandResult<RemoteRecordRef>;
  };
  'transfer:review': {
    args: [request: TransferReviewRequest];
    result: OnlineCommandResult<RemoteRecordRef>;
  };
  'transfer:cancel': { args: [id: string]; result: OnlineCommandResult<RemoteRecordRef> };
```

and to `IpcChannels`:

```ts
  REGISTRY_LOOKUP: 'registry:lookup',
  REGISTRY_CLAIM: 'registry:claim',
  REGISTRY_REQUEST: 'registry:request',
  TRANSFER_CREATE: 'transfer:create',
  TRANSFER_REVIEW: 'transfer:review',
  TRANSFER_CANCEL: 'transfer:cancel',
```

- [ ] **Step 4: Validators**

Append to `validateIpc.ts` (add `normalizeNemisId` to the `@nemis-desktop/shared` import):

```ts
// --- Online-only registry and transfer commands (NEMIS ID parity §6.2) -----

const GRADE_LEVEL_VALUES: readonly string[] = Object.values(GradeLevel);

function assertNemisId(value: unknown): void {
  if (typeof value !== 'string' || value.length > 32 || normalizeNemisId(value) === null) {
    throw new IPCError('Expected a valid 12-digit NEMIS ID.');
  }
}

function assertRegistryIdentity(request: Record<string, unknown>): void {
  assertNemisId(request.nemisId);
  assertIsoDate(request.dateOfBirth, 'dateOfBirth');
}

export function assertRegistryLookupArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['nemisId', 'dateOfBirth']);
  assertRegistryIdentity(request);
}

export function assertRegistryClaimArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['nemisId', 'dateOfBirth', 'classId', 'termId', 'gradeLevel', 'overrideReason']);
  assertRegistryIdentity(request);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertString(request.termId, 'termId', ID_MAX_LENGTH);
  assertEnumMember(request.gradeLevel, 'gradeLevel', GRADE_LEVEL_VALUES);
  assertOptionalString(request.overrideReason, 'overrideReason', DESCRIPTION_MAX_LENGTH);
}

export function assertRegistryReleaseArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['nemisId', 'dateOfBirth', 'classId', 'termId', 'gradeLevel', 'reason']);
  assertRegistryIdentity(request);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertString(request.termId, 'termId', ID_MAX_LENGTH);
  assertEnumMember(request.gradeLevel, 'gradeLevel', GRADE_LEVEL_VALUES);
  assertString(request.reason, 'reason', DESCRIPTION_MAX_LENGTH);
}

export function assertTransferCreateArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['studentId', 'toInstitutionId', 'reason', 'requestedDate', 'toGradeLevel']);
  assertString(request.studentId, 'studentId', ID_MAX_LENGTH);
  assertString(request.toInstitutionId, 'toInstitutionId', ID_MAX_LENGTH);
  assertString(request.reason, 'reason', DESCRIPTION_MAX_LENGTH);
  assertOptionalIsoDate(request.requestedDate, 'requestedDate');
  assertOptionalEnumMember(request.toGradeLevel, 'toGradeLevel', GRADE_LEVEL_VALUES);
}

export function assertTransferReviewArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'status', 'reviewNotes', 'classId', 'termId']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertEnumMember(request.status, 'status', ['APPROVED', 'REJECTED']);
  assertOptionalString(request.reviewNotes, 'reviewNotes', DESCRIPTION_MAX_LENGTH);
  assertOptionalString(request.classId, 'classId', ID_MAX_LENGTH);
  assertOptionalString(request.termId, 'termId', ID_MAX_LENGTH);
}
```

Before writing, read `assertString` / `assertIsoDate` (lines 74–115) to confirm `assertString` rejects the empty string (the tests rely on `classId: ''`/`reason: ''`/`toInstitutionId: ''` being rejected). If it does not, add an explicit `if ((request.x as string).trim() === '') throw new IPCError(...)` for those fields.

- [ ] **Step 5: Handlers**

`online.ts`:

```ts
import type { OnlineCommandResult } from '@nemis-desktop/types';

/** Runs an online-only command, then forces a pull so local SQLite reflects
 * what the server just did (spec D5: the pull is the only writer of local
 * truth — the response itself is never written locally). A failed refresh
 * never turns a successful command into an error: the server change already
 * happened, and an error would invite the admin to repeat a non-idempotent
 * claim. A failed command throws before any refresh. */
export async function runOnline<T>(
  command: () => Promise<T>,
  refresh: () => Promise<boolean>,
): Promise<OnlineCommandResult<T>> {
  const data = await command();
  let refreshed = false;
  try {
    refreshed = await refresh();
  } catch {
    refreshed = false;
  }
  return { data, refreshed };
}
```

`registry.ts`:

```ts
import {
  IpcChannels,
  type RegistryClaimRequest,
  type RegistryLookupRequest,
  type RegistryReleaseRequest,
} from '@nemis-desktop/types';
import { normalizeNemisId } from '@nemis-desktop/shared';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertRegistryClaimArgs,
  assertRegistryLookupArgs,
  assertRegistryReleaseArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type RegistryGateway = Pick<
  BackendProvisioningGateway,
  'lookupStudent' | 'claimStudent' | 'requestRelease'
>;

/** The validator has already proven the ID normalises; this hands the server
 * the canonical 12 bare digits whatever separators the admin typed. */
function canonical<T extends { nemisId: string }>(request: T): T {
  return { ...request, nemisId: normalizeNemisId(request.nemisId) ?? request.nemisId };
}

export function registerRegistryHandlers(
  handle: IpcHandle,
  gateway: RegistryGateway,
  refresh: () => Promise<boolean>,
): void {
  // A lookup changes nothing on the server, so it never refreshes.
  handle(IpcChannels.REGISTRY_LOOKUP, assertRegistryLookupArgs, (request: RegistryLookupRequest) =>
    gateway.lookupStudent(canonical(request)),
  );
  handle(IpcChannels.REGISTRY_CLAIM, assertRegistryClaimArgs, (request: RegistryClaimRequest) =>
    runOnline(() => gateway.claimStudent(canonical(request)), refresh),
  );
  handle(IpcChannels.REGISTRY_REQUEST, assertRegistryReleaseArgs, (request: RegistryReleaseRequest) =>
    runOnline(() => gateway.requestRelease(canonical(request)), refresh),
  );
}
```

`transfers.ts`:

```ts
import {
  IpcChannels,
  type TransferCreateRequest,
  type TransferReviewRequest,
} from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertSingleIdArg,
  assertTransferCreateArgs,
  assertTransferReviewArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type TransferGateway = Pick<
  BackendProvisioningGateway,
  'createTransfer' | 'reviewTransfer' | 'cancelTransfer'
>;

/** Transfers are pull-only through sync (spec §5.1); every change goes
 * through the server's transfer service here, then a forced pull. */
export function registerTransferHandlers(
  handle: IpcHandle,
  gateway: TransferGateway,
  refresh: () => Promise<boolean>,
): void {
  handle(IpcChannels.TRANSFER_CREATE, assertTransferCreateArgs, (request: TransferCreateRequest) =>
    runOnline(() => gateway.createTransfer(request), refresh),
  );
  handle(IpcChannels.TRANSFER_REVIEW, assertTransferReviewArgs, (request: TransferReviewRequest) =>
    runOnline(() => gateway.reviewTransfer(request), refresh),
  );
  handle(IpcChannels.TRANSFER_CANCEL, assertSingleIdArg, (id: string) =>
    runOnline(() => gateway.cancelTransfer(id), refresh),
  );
}
```

(Match how other handler files type the handler parameter — the `IpcHandle` generic may infer it from the channel, in which case drop the explicit annotations.)

- [ ] **Step 6: Authorise, register, wire**

`authorizeChannel.ts` — add to `SCHOOL_ADMIN_CHANNELS` under `// Mutations`:

```ts
  // Online-only registry and transfer commands (NEMIS ID parity §6.2).
  IpcChannels.REGISTRY_LOOKUP,
  IpcChannels.REGISTRY_CLAIM,
  IpcChannels.REGISTRY_REQUEST,
  IpcChannels.TRANSFER_CREATE,
  IpcChannels.TRANSFER_REVIEW,
  IpcChannels.TRANSFER_CANCEL,
```

`registrar.ts` — add imports for `registerRegistryHandlers`, `registerTransferHandlers` and `type BackendProvisioningGateway`; append a parameter and two registrations:

```ts
export function registerIpcHandlers(
  services: DataLayer['services'],
  app: ApplicationLayer,
  provisioning: ProvisioningService,
  syncWorker: DesktopSyncWorker,
  schoolAdmin: SchoolAdminModuleService,
  workspaces: WorkspaceManager,
  gateway: BackendProvisioningGateway,
): void {
  ...existing registrations...
  const refresh = () => syncWorker.pullNow();
  registerRegistryHandlers(securedHandle, gateway, refresh);
  registerTransferHandlers(securedHandle, gateway, refresh);
}
```

`main.ts:159` — pass the existing `backendProvisioning` instance (declared at ~line 107 in the same scope):

```ts
      registerIpcHandlers(services, application, provisioning, syncWorker, schoolAdmin, workspaces, backendProvisioning);
```

- [ ] **Step 7: Run the IPC suites and typecheck**

Run: `pnpm vitest run apps/desktop/electron/ipc apps/desktop/electron/security && pnpm typecheck`
Expected: PASS; typecheck clean (`IPC_CHANNELS_EXHAUSTIVE` proves every contract entry has a constant). Typecheck will also flag the preload `NemisApi` only if it is typed as covering all channels — if so, leave it for Task 5 and note it; do not add preload code here.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/ipc.ts apps/desktop/electron/security/validateIpc.ts apps/desktop/electron/ipc/authorizeChannel.ts apps/desktop/electron/ipc/authorizeChannel.test.ts apps/desktop/electron/ipc/handlers/school-admin/online.ts apps/desktop/electron/ipc/handlers/school-admin/registry.ts apps/desktop/electron/ipc/handlers/school-admin/transfers.ts apps/desktop/electron/ipc/handlers/school-admin/online-commands.test.ts apps/desktop/electron/ipc/registrar.ts apps/desktop/electron/main/main.ts
git commit -m "feat(ipc): online-only registry and transfer channels with forced refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Renderer reach — preload APIs and nemis-bridge files

**Files:**
- Modify: `packages/types/src/api.ts` (`RegistryApi`, `TransferApi`, two `NemisApi` keys)
- Create: `apps/desktop/electron/preload/school-admin/registry-api.ts`
- Create: `apps/desktop/electron/preload/school-admin/transfer-api.ts`
- Modify: `apps/desktop/electron/preload/school-admin/index.ts`
- Create: `apps/desktop/renderer/services/nemis-bridge/school-admin/registry-bridge.ts`
- Create: `apps/desktop/renderer/services/nemis-bridge/school-admin/transfer-bridge.ts`
- Modify: `apps/desktop/renderer/services/nemis-bridge/school-admin/index.ts`
- Test: `apps/desktop/renderer/services/nemis-bridge/school-admin/online-bridges.test.ts`

**Interfaces:**
- Consumes: Task 4's channels and the registry types.
- Produces:
  - `RegistryApi { lookup(request): Promise<RegistryLookupResult>; claim(request): Promise<OnlineCommandResult<RegistryClaimResult>>; request(request): Promise<OnlineCommandResult<RemoteRecordRef>> }`
  - `TransferApi { create(request): Promise<OnlineCommandResult<RemoteRecordRef>>; review(request): Promise<OnlineCommandResult<RemoteRecordRef>>; cancel(id: string): Promise<OnlineCommandResult<RemoteRecordRef>> }`
  - `NemisApi` gains `registry: RegistryApi; transfer: TransferApi`.
  - `registryBridge = { lookupStudent, claimStudent, requestRelease }`, `transferBridge = { createTransfer, reviewTransfer, cancelTransfer }` — the names Stages 3 and 4 will call.
  - `parseIpcErrorCode(error: unknown): IpcErrorCode | null` in `registry-bridge.ts` — reads the `[CODE] message` prefix that `preload/invoke.ts` throws, so screens can branch on `OFFLINE` / `RATE_LIMITED` / `REMOTE_REJECTED`.

- [ ] **Step 1: Write the failing bridge test**

`online-bridges.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registryBridge, parseIpcErrorCode } from './registry-bridge';
import { transferBridge } from './transfer-bridge';

afterEach(() => {
  delete (window as { nemis?: unknown }).nemis;
});

describe('online bridges', () => {
  it('route to window.nemis.registry and window.nemis.transfer', async () => {
    const registry = {
      lookup: vi.fn(async () => ({ found: false })),
      claim: vi.fn(async () => ({ data: { studentId: 's' }, refreshed: true })),
      request: vi.fn(async () => ({ data: { id: 't' }, refreshed: true })),
    };
    const transfer = {
      create: vi.fn(async () => ({ data: { id: 'a' }, refreshed: true })),
      review: vi.fn(async () => ({ data: { id: 'b' }, refreshed: false })),
      cancel: vi.fn(async (id: string) => ({ data: { id }, refreshed: true })),
    };
    (window as { nemis?: unknown }).nemis = { registry, transfer };

    expect(await registryBridge.lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })).toEqual({ found: false });
    expect(await transferBridge.cancelTransfer('t-1')).toEqual({ data: { id: 't-1' }, refreshed: true });
    expect(registry.lookup).toHaveBeenCalledWith({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
    expect(transfer.cancel).toHaveBeenCalledWith('t-1');
  });

  it('parseIpcErrorCode reads the [CODE] prefix and ignores anything else', () => {
    expect(parseIpcErrorCode(new Error("[OFFLINE] You're offline. Connect to the internet to do this."))).toBe('OFFLINE');
    expect(parseIpcErrorCode(new Error('[REMOTE_REJECTED] Transfer request not found'))).toBe('REMOTE_REJECTED');
    expect(parseIpcErrorCode(new Error('[NOT_A_CODE] x'))).toBeNull();
    expect(parseIpcErrorCode(new Error('no prefix'))).toBeNull();
    expect(parseIpcErrorCode('string')).toBeNull();
  });
});
```

(If renderer tests in this repo run in a non-DOM environment, check `vitest.config.ts`'s renderer project — `Sidebar.test.tsx` uses `@testing-library/react`, so `window` exists.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/services/nemis-bridge/school-admin/online-bridges.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Types**

In `packages/types/src/api.ts` (import the registry types; follow the file's style):

```ts
export interface RegistryApi {
  lookup(request: RegistryLookupRequest): Promise<RegistryLookupResult>;
  claim(request: RegistryClaimRequest): Promise<OnlineCommandResult<RegistryClaimResult>>;
  request(request: RegistryReleaseRequest): Promise<OnlineCommandResult<RemoteRecordRef>>;
}

export interface TransferApi {
  create(request: TransferCreateRequest): Promise<OnlineCommandResult<RemoteRecordRef>>;
  review(request: TransferReviewRequest): Promise<OnlineCommandResult<RemoteRecordRef>>;
  cancel(id: string): Promise<OnlineCommandResult<RemoteRecordRef>>;
}
```

Add `registry: RegistryApi;` and `transfer: TransferApi;` to `NemisApi`.

- [ ] **Step 4: Preload**

`registry-api.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { RegistryApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const registryApi: RegistryApi = {
  lookup: (request) => invoke(IpcChannels.REGISTRY_LOOKUP, request),
  claim: (request) => invoke(IpcChannels.REGISTRY_CLAIM, request),
  request: (request) => invoke(IpcChannels.REGISTRY_REQUEST, request),
};
```

`transfer-api.ts`:

```ts
import { IpcChannels } from '@nemis-desktop/types';
import type { TransferApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const transferApi: TransferApi = {
  create: (request) => invoke(IpcChannels.TRANSFER_CREATE, request),
  review: (request) => invoke(IpcChannels.TRANSFER_REVIEW, request),
  cancel: (id) => invoke(IpcChannels.TRANSFER_CANCEL, id),
};
```

`preload/school-admin/index.ts`: add `export * from './registry-api';`, `export * from './transfer-api';`, import both, and add `registry: registryApi, transfer: transferApi,` to `schoolAdminApi`.

- [ ] **Step 5: Bridges**

`registry-bridge.ts`:

```ts
import type {
  IpcErrorCode,
  OnlineCommandResult,
  RegistryClaimRequest,
  RegistryClaimResult,
  RegistryLookupRequest,
  RegistryLookupResult,
  RegistryReleaseRequest,
  RemoteRecordRef,
} from '@nemis-desktop/types';
import { api } from '../api';

export const registryBridge = {
  lookupStudent: (request: RegistryLookupRequest): Promise<RegistryLookupResult> =>
    api().registry.lookup(request),
  claimStudent: (request: RegistryClaimRequest): Promise<OnlineCommandResult<RegistryClaimResult>> =>
    api().registry.claim(request),
  requestRelease: (request: RegistryReleaseRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().registry.request(request),
};

const KNOWN_CODES: readonly IpcErrorCode[] = [
  'VALIDATION_FAILED', 'DUPLICATE', 'NOT_FOUND', 'CONFLICT', 'UNAUTHORIZED', 'FORBIDDEN',
  'DATABASE_UNAVAILABLE', 'MIGRATION_REQUIRED', 'IPC_ERROR', 'UNEXPECTED_ERROR',
  'OFFLINE', 'RATE_LIMITED', 'REMOTE_REJECTED',
];

/** preload/invoke.ts throws `[CODE] message`; online screens branch on the
 * code (OFFLINE disables, RATE_LIMITED waits, REMOTE_REJECTED shows the
 * server's text). Anything unrecognised is null. */
export function parseIpcErrorCode(error: unknown): IpcErrorCode | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]/.exec(error.message);
  const code = match?.[1] as IpcErrorCode | undefined;
  return code && KNOWN_CODES.includes(code) ? code : null;
}
```

Before writing `parseIpcErrorCode`, check `renderer/services/nemis-bridge/create-ipc-application-layer*` (or wherever `invoke.ts`'s comment says the prefix is parsed): if a reusable parser already exists, export and reuse it instead of duplicating it.

`transfer-bridge.ts`:

```ts
import type {
  OnlineCommandResult,
  RemoteRecordRef,
  TransferCreateRequest,
  TransferReviewRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const transferBridge = {
  createTransfer: (request: TransferCreateRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.create(request),
  reviewTransfer: (request: TransferReviewRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.review(request),
  cancelTransfer: (id: string): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().transfer.cancel(id),
};
```

Add both to `nemis-bridge/school-admin/index.ts` following its existing export style.

- [ ] **Step 6: Run, typecheck, lint**

Run: `pnpm vitest run apps/desktop/renderer/services && pnpm typecheck && pnpm lint`
Expected: PASS; typecheck clean; lint shows only the 6 pre-existing errors.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/api.ts apps/desktop/electron/preload/school-admin apps/desktop/renderer/services/nemis-bridge/school-admin
git commit -m "feat(renderer): bridges for online registry and transfer commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stage gate

**Files:** none new.

- [ ] **Step 1: Full desktop gate**

Run (repo root, with the binary set aside and node build in place): `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: only the known failures (`page.test.tsx`, `timetable.test.tsx`, flaky `010-create-sync-outbox`); typecheck clean; lint = the 6 pre-existing errors. Record counts.

- [ ] **Step 2: Restore the Electron binary**

Delete the node build and restore the original `better_sqlite3.node` (2281472 bytes, Jun 18 09:16). Do not launch or kill the app.

- [ ] **Step 3: Report**

Stage 2 has no server change and no migration, so there is no deploy coupling. Report the branch head for the merge decision.
