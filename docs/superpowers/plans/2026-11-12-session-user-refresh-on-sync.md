# Session User Refresh on Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fresh user returned by every successful `/auth/me` (every sync, every online action) the single source of the signed-in user in the desktop main process and renderer, so module/role changes made on the web take effect on the next sync and a disabled account is signed out on the next sync.

**Architecture:** `BackendProvisioningGateway.restoreSession()` (the existing single-flight `/auth/me`) gains two hooks. `ProvisioningService` owns the current user: `applyRestoredSession` pushes a changed user into `WorkspaceManager.activate` (same-identity branch, DB kept open) and into `status.user`, then broadcasts a new `{ type: 'session' }` event on the existing `nemis:event` pipe; `revokeSession` closes the workspace and marks the status `expired` with a reason. The renderer's `RouteGuard` re-reads the provisioning status on that event; the existing `Sidebar`/`ModuleGuard` react to the new `SessionUserProvider` value; the sign-in page shows the reason.

**Tech Stack:** TypeScript, Electron main (Node) + Next.js renderer, Vitest (`node` project for `electron/**`, `jsdom` project for `renderer/**`), React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-12-session-user-refresh-on-sync-design.md`

## Global Constraints

- desktop-client-nemis only; no Nemis server or portal-web change.
- No new IPC invoke channel (`authorizeChannel.test.ts` "every IPC channel is classified or deliberately open" must stay green). The only new main→renderer traffic is a new `RealtimeEvent` member on `REALTIME_EVENT_CHANNEL`.
- Hooks fire only inside the existing single-flight `restoreSession()`; no second `/auth/me` path.
- `onRevoked` fires only for `UnauthorizedError` / `ForbiddenError` (from `@nemis-desktop/shared`). `AuthenticationUnavailableError` and plain `Error` (5xx, contract mismatch) call **no** hook and keep today's behaviour exactly.
- Revoke copy (exact):
  - `'ended'` → `Your session has ended. Sign in again. If this keeps happening, contact your School Admin.`
  - `'changed'` → `Your role or school assignment changed. Sign in again to open the right workspace.`
- Event shape (exact): `{ type: 'session'; reason: 'refreshed' | 'revoked' }`.
- `ProvisioningService` must not import from `@app/workspace/WorkspaceManager` (that module loads `better-sqlite3`; the service's tests run without it).
- Run tests from the repo root: `pnpm vitest run <file> [-t "<name>"]`. Known machine state: `WorkspaceManager.test.ts` needs the Electron-ABI runner (`ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`) — this plan does not modify that file. `renderer/app/page.test.tsx` has one **pre-existing** failing test, "Fresh login without a page reload › re-populates currentUser after login succeeds, without remounting"; leave it as is and judge Task 6 by its own new test.
- Commit after every task on branch `feat/session-user-refresh`. Do not commit `apps/desktop/package.json` (Alvin's own uncommitted version bump).

## Review Focus

Inputs the spec implies but a casual reading would miss; each has a pinned test in the owning task:

1. A session saved by an older build has no `modules` field; the fresh one has `modules: []`. They must compare **equal** (no spurious event every 20 s). → Task 1.
2. The same modules in a different order must compare equal; `title` `undefined` vs absent must compare equal. → Task 1.
3. A restore that settles **after** logout (sync in flight when the user signs out) must not resurrect the session or activate a workspace. → Task 2.
4. A throwing hook must not fail the sync/online request that triggered the restore. → Task 3.
5. `revokeSession` called twice (two concurrent 401s racing the single-flight boundary) must close the workspace and emit **once**. → Task 2.

---

### Task 1: `sameProvisioningUser` / `sameWorkspaceIdentity` helpers

**Files:**
- Create: `apps/desktop/electron/provisioning/sameProvisioningUser.ts`
- Test: `apps/desktop/electron/provisioning/sameProvisioningUser.test.ts`

**Interfaces:**
- Produces:
  - `sameWorkspaceIdentity(a: ProvisioningUser, b: ProvisioningUser): boolean` — true when `id`, `role`, `scope.type`, `scope.scopeId` all match (the same tuple `workspaceIdentity()` in `WorkspaceManager.ts:88-92` hashes; duplicated here on purpose so this file has no native-module import).
  - `sameProvisioningUser(a: ProvisioningUser, b: ProvisioningUser): boolean` — true when every field of `ProvisioningUser` (`packages/types/src/provisioning.ts:10-25`) matches: scalars by `===` (treating `undefined` and absent alike), `scope` field-wise, `modules` as a set (`undefined` ≡ `[]`).

- [ ] **Step 1: Write the failing tests**

```ts
// sameProvisioningUser.test.ts
import { describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { sameProvisioningUser, sameWorkspaceIdentity } from './sameProvisioningUser';

const base: ProvisioningUser = {
  id: 'u-1', email: 'r@school.lr', firstName: 'Reg', lastName: 'Istrar',
  role: SystemRole.INSTITUTION_STAFF,
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'inst-1', institutionId: 'inst-1' },
  institutionId: 'inst-1', modules: ['STUDENTS', 'REPORTS'], title: 'Registrar',
};

describe('sameWorkspaceIdentity', () => {
  it('matches on id, role, scope type and scope id only', () => {
    expect(sameWorkspaceIdentity(base, { ...base, modules: [], title: undefined, firstName: 'X' })).toBe(true);
    expect(sameWorkspaceIdentity(base, { ...base, id: 'u-2' })).toBe(false);
    expect(sameWorkspaceIdentity(base, { ...base, role: SystemRole.INSTITUTION_ADMIN })).toBe(false);
    expect(sameWorkspaceIdentity(base, { ...base, scope: { ...base.scope, scopeId: 'inst-2' } })).toBe(false);
  });
});

describe('sameProvisioningUser', () => {
  it('is true for an identical user', () => {
    expect(sameProvisioningUser(base, { ...base })).toBe(true);
  });
  it('treats modules as a set', () => {
    expect(sameProvisioningUser(base, { ...base, modules: ['REPORTS', 'STUDENTS'] })).toBe(true);
    expect(sameProvisioningUser(base, { ...base, modules: ['STUDENTS'] })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, modules: ['STUDENTS', 'REPORTS', 'FINANCE_RULES'] })).toBe(false);
  });
  it('treats a missing modules field as an empty set', () => {
    const { modules: _m, ...withoutModules } = base;
    expect(sameProvisioningUser(withoutModules, { ...withoutModules, modules: [] })).toBe(true);
  });
  it('treats an absent title and an undefined title alike', () => {
    const { title: _t, ...withoutTitle } = base;
    expect(sameProvisioningUser(withoutTitle, { ...withoutTitle, title: undefined })).toBe(true);
    expect(sameProvisioningUser(base, { ...base, title: 'Bursar' })).toBe(false);
  });
  it('sees a changed name, institution name or scope field', () => {
    expect(sameProvisioningUser(base, { ...base, lastName: 'Other' })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, institutionName: 'Alpha' })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, scope: { ...base.scope, districtId: 'd-1' } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/sameProvisioningUser.test.ts`
Expected: FAIL — cannot resolve `./sameProvisioningUser`.

- [ ] **Step 3: Implement both functions in `sameProvisioningUser.ts`**

Pure module; imports only types from `@nemis-desktop/types`. `sameProvisioningUser` compares the scalar keys `id, email, firstName, lastName, role, institutionId, countyId, districtId, staffId, institutionName, title`, the `scope` keys `type, scopeId, countyId, districtId, institutionId, staffId`, and `modules` via sorted-array equality of `[...new Set(modules ?? [])]`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/provisioning/sameProvisioningUser.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/provisioning/sameProvisioningUser.ts apps/desktop/electron/provisioning/sameProvisioningUser.test.ts
git commit -m "feat(desktop): compare provisioning users and workspace identities"
```

---

### Task 2: `ProvisioningService.applyRestoredSession` / `revokeSession` + `session` event type

**Files:**
- Modify: `packages/types/src/realtime.ts:3-7` (add union member)
- Modify: `apps/desktop/electron/provisioning/ProvisioningService.ts`
- Test: `apps/desktop/electron/provisioning/ProvisioningService.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 `sameProvisioningUser`, `sameWorkspaceIdentity`.
- Produces:
  - `RealtimeEvent` gains `| { type: 'session'; reason: 'refreshed' | 'revoked' }`.
  - `ProvisioningService` constructor gains an 8th optional parameter `emit?: (event: RealtimeEvent) => void` (after `workspaces?`).
  - `applyRestoredSession(session: AuthenticatedSession): void`
  - `revokeSession(reason: 'disabled' | 'changed'): void`

- [ ] **Step 1: Add the union member to `realtime.ts`**

Append `| { type: 'session'; reason: 'refreshed' | 'revoked' }` to `RealtimeEvent` with a one-line comment: "the signed-in user was refreshed from `/auth/me`, or the session was revoked by the server". Then run `pnpm typecheck` — expected: PASS (the three renderer consumers filter by `event.type === …`, no exhaustive switch).

- [ ] **Step 2: Write the failing tests**

```ts
// ProvisioningService.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedSession } from '@nemis-desktop/application';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { ProvisioningService } from './ProvisioningService';

const device = { id: 'd-1', fingerprint: 'f'.repeat(64), name: 'PC', platform: 'win32', osVersion: '11', appVersion: '1' };
const user: ProvisioningUser = {
  id: 'u-1', email: 'r@school.lr', firstName: 'Reg', lastName: 'Istrar',
  role: SystemRole.INSTITUTION_STAFF,
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'inst-1', institutionId: 'inst-1' },
  institutionId: 'inst-1', modules: ['STUDENTS', 'REPORTS'], title: 'Registrar',
};
const sessionFor = (u: ProvisioningUser): AuthenticatedSession =>
  ({ user: u, sessionSecret: 's', offlineAccessExpiresAt: '2099-01-01T00:00:00.000Z' });

function build(initial: ProvisioningUser | null = user) {
  const workspaces = { activate: vi.fn(), close: vi.fn() };
  const emit = vi.fn();
  const restore = vi.fn(async () => (initial ? sessionFor(initial) : null));
  const completion = { userId: user.id, role: user.role, scopeType: user.scope.type, scopeId: user.scope.scopeId, completedAt: '2026-01-01T00:00:00.000Z' };
  const service = new ProvisioningService(
    { execute: vi.fn() } as never,
    { execute: restore } as never,
    { execute: vi.fn(async () => undefined) } as never,
    {} as never,
    { getCompletion: () => completion, import: vi.fn() } as never,
    device as never,
    workspaces,
    emit,
  );
  return { service, workspaces, emit, restore };
}

describe('applyRestoredSession', () => {
  it('ignores a restore when nobody is signed in', async () => {
    const { service, workspaces, emit } = build(null);
    await service.getStatus();
    service.applyRestoredSession(sessionFor(user));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect((await service.getStatus()).authentication).toBe('anonymous');
  });

  it('does nothing when the user is unchanged (modules in another order)', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    workspaces.activate.mockClear();
    service.applyRestoredSession(sessionFor({ ...user, modules: ['REPORTS', 'STUDENTS'] }));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('activates the fresh user, updates the status and emits refreshed when modules change', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    const fresh: ProvisioningUser = { ...user, modules: ['STUDENTS', 'REPORTS', 'FINANCE_RULES'] };
    service.applyRestoredSession(sessionFor(fresh));
    expect(workspaces.activate).toHaveBeenLastCalledWith(fresh);
    expect((await service.getStatus()).user).toEqual(fresh);
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'refreshed' });
  });

  it('revokes with reason changed when the workspace identity differs', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    workspaces.activate.mockClear();
    service.applyRestoredSession(sessionFor({ ...user, role: SystemRole.INSTITUTION_ADMIN }));
    expect(workspaces.activate).not.toHaveBeenCalled();
    expect(workspaces.close).toHaveBeenCalledTimes(1);
    const status = await service.getStatus();
    expect(status.authentication).toBe('expired');
    expect(status.user).toBeNull();
    expect(status.message).toBe('Your role or school assignment changed. Sign in again to open the right workspace.');
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'revoked' });
  });
});

describe('revokeSession', () => {
  it('closes the workspace, marks the status expired with the disabled message and emits revoked once', async () => {
    const { service, workspaces, emit } = build();
    await service.getStatus();
    service.revokeSession('disabled');
    service.revokeSession('disabled');
    expect(workspaces.close).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: 'session', reason: 'revoked' });
    const status = await service.getStatus();
    expect(status.authentication).toBe('expired');
    expect(status.isProvisioned).toBe(false);
    expect(status.message).toBe('This account is no longer active. Sign in again or contact your School Admin.');
  });

  it('is a no-op when nobody is signed in', async () => {
    const { service, workspaces, emit } = build(null);
    await service.getStatus();
    service.revokeSession('disabled');
    expect(workspaces.close).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not restore again on the next getStatus', async () => {
    const { service, restore } = build();
    await service.getStatus();
    service.revokeSession('disabled');
    restore.mockClear();
    expect((await service.getStatus()).authentication).toBe('expired');
    expect(restore).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/ProvisioningService.test.ts`
Expected: FAIL — `service.applyRestoredSession is not a function`.

- [ ] **Step 4: Implement in `ProvisioningService.ts`**

- Add constructor parameter `private readonly emit?: (event: RealtimeEvent) => void` after `workspaces?`. Import `RealtimeEvent` type from `@nemis-desktop/types` and the two helpers from `./sameProvisioningUser`.
- `applyRestoredSession(session)`:
  1. `const current = this.status.user; if (this.status.authentication !== 'authenticated' || !current) return;`
  2. `if (!sameWorkspaceIdentity(current, session.user)) { this.revokeSession('changed'); return; }`
  3. `if (sameProvisioningUser(current, session.user)) return;`
  4. `this.workspaces?.activate(session.user); this.status = { ...this.status, user: session.user }; this.emit?.({ type: 'session', reason: 'refreshed' });`
- `revokeSession(reason)`:
  1. `if (this.status.authentication !== 'authenticated') return;`
  2. `this.workspaces?.close(); this.restored = true; this.status = { ...anonymousStatus(this.status.device), authentication: 'expired', message: REVOKE_MESSAGES[reason] }; this.emit?.({ type: 'session', reason: 'revoked' });`
- `const REVOKE_MESSAGES` holds the two exact strings from Global Constraints.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/provisioning/ProvisioningService.test.ts`
Expected: PASS (7 tests). Then `pnpm typecheck` — PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/realtime.ts apps/desktop/electron/provisioning/ProvisioningService.ts apps/desktop/electron/provisioning/ProvisioningService.test.ts
git commit -m "feat(desktop): provisioning service applies and revokes restored sessions"
```

---

### Task 3: `BackendProvisioningGateway` restore hooks

**Files:**
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts:94-98` (constructor), `:745-763` (`restoreSession`)
- Test: `apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts` (extend the `describe` that holds "concurrent requests share one restore", ~line 1235)

**Interfaces:**
- Produces: constructor 4th optional parameter
  ```ts
  export interface RestoreHooks {
    onRestored?(session: AuthenticatedSession): void;
    onRevoked?(): void;
  }
  constructor(baseUrl: string, authentication: AuthenticationGateway, sessions: SessionRepository, hooks: RestoreHooks = {})
  ```

- [ ] **Step 1: Write the failing tests** (inside the existing single-flight `describe`; reuse its `response()` helper and `session` fixture; `UnauthorizedError`/`ForbiddenError` come from `@nemis-desktop/shared`, already partly imported at line 12)

```ts
function gatewayWithHooks(restore: () => Promise<AuthenticatedSession>) {
  const hooks = { onRestored: vi.fn(), onRevoked: vi.fn() };
  const clear = vi.fn(async () => undefined);
  const gateway = new BackendProvisioningGateway(
    'https://nemis.example',
    { authenticate: async () => session, restore, logout: async () => undefined },
    { load: async () => session, save: async () => undefined, clear },
    hooks,
  );
  return { gateway, hooks, clear };
}

it('calls onRestored once per shared restore with the saved session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ years: [], transfers: [] })));
  const { gateway, hooks } = gatewayWithHooks(async () => session);
  await Promise.all([gateway.getStudentAcademicRecord('c', 's-1'), gateway.getStudentAcademicRecord('c', 's-2')]);
  expect(hooks.onRestored).toHaveBeenCalledTimes(1);
  expect(hooks.onRestored).toHaveBeenCalledWith(session);
  expect(hooks.onRevoked).not.toHaveBeenCalled();
});

it.each([
  ['UnauthorizedError', () => new UnauthorizedError()],
  ['ForbiddenError', () => new ForbiddenError('refused')],
])('calls onRevoked after clearing the session on %s', async (_name, make) => {
  const { gateway, hooks, clear } = gatewayWithHooks(async () => { throw make(); });
  await expect(gateway.getStudentAcademicRecord('c', 's-1')).rejects.toBeInstanceOf(Error);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(hooks.onRevoked).toHaveBeenCalledTimes(1);
  expect(hooks.onRestored).not.toHaveBeenCalled();
});

it.each([
  ['AuthenticationUnavailableError', () => new AuthenticationUnavailableError('offline')],
  ['a plain Error (5xx / contract mismatch)', () => new Error('NEMIS authentication failed with status 502.')],
])('calls no hook on %s', async (_name, make) => {
  const { gateway, hooks } = gatewayWithHooks(async () => { throw make(); });
  await expect(gateway.getStudentAcademicRecord('c', 's-1')).rejects.toBeInstanceOf(Error);
  expect(hooks.onRestored).not.toHaveBeenCalled();
  expect(hooks.onRevoked).not.toHaveBeenCalled();
});

it('a throwing onRestored does not fail the request', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ years: [], transfers: [] })));
  const { gateway, hooks } = gatewayWithHooks(async () => session);
  hooks.onRestored.mockImplementation(() => { throw new Error('boom'); });
  await expect(gateway.getStudentAcademicRecord('c', 's-1')).resolves.toBeDefined();
});
```

Also assert the existing plain-`Error` behaviour is unchanged: in the "calls no hook" case for the plain `Error`, add `expect(clear).toHaveBeenCalledTimes(1)` (today's code clears on any non-unavailable error; the spec keeps that).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts -t "onRestored|onRevoked|no hook"`
Expected: FAIL — hooks never called (`expected 1, received 0`).

- [ ] **Step 3: Implement**

- Export `RestoreHooks`; add `private readonly hooks: RestoreHooks = {}` as the 4th constructor parameter.
- In `restoreSession()`'s async body: after `await this.sessions.save(restored)` call `this.runHook(() => this.hooks.onRestored?.(restored))`. In the `catch`: keep `if (!(error instanceof AuthenticationUnavailableError)) await this.sessions.clear();` and add, after it, `if (error instanceof UnauthorizedError || error instanceof ForbiddenError) this.runHook(() => this.hooks.onRevoked?.());` then rethrow as today.
- `private runHook(fn: () => void): void` — try/catch, on failure `console.warn('[provisioning] session hook failed', error)` (the gateway has no logger; match whatever the file already uses for warnings, else `console.warn`).
- Import `UnauthorizedError` from `@nemis-desktop/shared` alongside the existing imports.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts`
Expected: PASS (116 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/provisioning/BackendProvisioningGateway.ts apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts
git commit -m "feat(desktop): report restore outcome from the provisioning gateway"
```

---

### Task 4: Wire hooks and event broadcast in `main.ts`

**Files:**
- Modify: `apps/desktop/electron/main/main.ts:109-124` (gateway + service construction), `:145-151` (`RealtimeClient` `emit`)

**Interfaces:**
- Consumes: Task 2 `ProvisioningService(…, workspaces, emit)`, `applyRestoredSession`, `revokeSession('disabled')`; Task 3 `RestoreHooks`.

- [ ] **Step 1: Add `broadcastEvent` and wire both sides**

In `main.ts`, just before `const sessionRepository = …` (line 109):

```ts
const broadcastEvent = (event: RealtimeEvent) => {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(REALTIME_EVENT_CHANNEL, event);
};
let provisioning: ProvisioningService;
```

- Pass `{ onRestored: (session) => provisioning.applyRestoredSession(session), onRevoked: () => provisioning.revokeSession('disabled') }` as the 4th argument to `new BackendProvisioningGateway(...)`. (`provisioning` is assigned a few lines later; hooks can only fire from `authorized()` calls, which happen after startup, so there is no TDZ risk — say so in a one-line comment.)
- Change `const provisioning = new ProvisioningService(` to `provisioning = new ProvisioningService(` and append `broadcastEvent` as the last argument.
- Replace the inline `emit: (event) => { for (...) ... }` of `RealtimeClient` with `emit: broadcastEvent`.
- Add `RealtimeEvent` to the `@nemis-desktop/types` type imports.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: both PASS. (If ESLint flags `no-use-before-define` on `provisioning` inside the closures, the `let` declaration above already precedes the gateway; if the rule still objects, move the `let` above `broadcastEvent`.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/main/main.ts
git commit -m "feat(desktop): refresh the workspace user from every successful restore"
```

---

### Task 5: `RouteGuard` re-reads the session on `session` events

**Files:**
- Modify: `apps/desktop/renderer/components/shell/RouteGuard.tsx`
- Test: `apps/desktop/renderer/components/shell/RouteGuard.test.tsx`

**Interfaces:**
- Consumes: `useRealtime(onEvent)` from `@/hooks/use-realtime`; Task 2 event shape.

- [ ] **Step 1: Write the failing tests** (add to `RouteGuard.test.tsx`; add `vi.mock('@/hooks/use-realtime', () => ({ useRealtime: vi.fn() }));` next to the existing mocks and `import { useRealtime } from '@/hooks/use-realtime';`; use `act` from `@testing-library/react`)

```ts
const fire = (event: unknown) => act(() => { vi.mocked(useRealtime).mock.calls.at(-1)![0](event as never); });

// `status()` is typed `never`; build staff statuses with modules separately.
const staffStatus = (modules: string[]) =>
  ({
    isProvisioned: true,
    authentication: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: SystemRole.INSTITUTION_STAFF, scope: 'INSTITUTION', modules },
  }) as never;

function ModulesProbe() {
  return <div>modules:{(useSessionUser().modules ?? []).join(',')}</div>;
}

it('re-reads the provisioning status and provides the new user on session/refreshed', async () => {
  vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(staffStatus(['STUDENTS']));
  render(<RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}><ModulesProbe /></RouteGuard>);
  expect(await screen.findByText('modules:STUDENTS')).toBeTruthy();
  vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(staffStatus(['STUDENTS', 'REPORTS']));
  fire({ type: 'session', reason: 'refreshed' });
  expect(await screen.findByText('modules:STUDENTS,REPORTS')).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
});

it('sends the user to the sign-in page on session/revoked', async () => {
  vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.INSTITUTION_STAFF));
  render(<RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}><Probe /></RouteGuard>);
  await screen.findByText(`role:${SystemRole.INSTITUTION_STAFF}`);
  fire({ type: 'session', reason: 'revoked' });
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
});

it('ignores other realtime events', async () => {
  vi.mocked(sharedBridge.getProvisioningStatus).mockResolvedValue(status(SystemRole.INSTITUTION_STAFF));
  render(<RouteGuard requiredRoles={[SystemRole.INSTITUTION_STAFF]}><Probe /></RouteGuard>);
  await screen.findByText(`role:${SystemRole.INSTITUTION_STAFF}`);
  vi.mocked(sharedBridge.getProvisioningStatus).mockClear();
  fire({ type: 'notification' });
  expect(sharedBridge.getProvisioningStatus).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/components/shell/RouteGuard.test.tsx`
Expected: the 3 new tests FAIL (`useRealtime` never called → `mock.calls.at(-1)` is undefined); the 2 existing PASS.

- [ ] **Step 3: Implement in `RouteGuard.tsx`**

- Extract the body of the mount effect into `const check = useCallback(() => { void sharedBridge.getProvisioningStatus().then(...same branches...) }, [requiredRoles, router])`; the mount effect becomes `useEffect(() => check(), [check])`.
- `useRealtime((event) => { if (event.type !== 'session') return; if (event.reason === 'revoked') { router.replace('/'); return; } check(); });`

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/desktop/renderer/components/shell/RouteGuard.test.tsx apps/desktop/renderer/components/shell/ModuleGuard.test.tsx apps/desktop/renderer/components/shell/Sidebar.test.tsx`
Expected: PASS (5 RouteGuard tests; ModuleGuard and Sidebar unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/components/shell/RouteGuard.tsx apps/desktop/renderer/components/shell/RouteGuard.test.tsx
git commit -m "feat(desktop): route guard follows session refresh and revocation events"
```

---

### Task 6: Sign-in page shows why the session ended

**Files:**
- Modify: `apps/desktop/renderer/app/page.tsx:147-160` (the `showLogin || status.authentication !== 'authenticated'` branch)
- Test: `apps/desktop/renderer/app/page.test.tsx` (new `describe`; reuse the file's `installMock()` / `DEVICE` fixtures. Give `installMock` an optional parameter `overrides: { anonymous?: Partial<typeof anonymousStatus> } = {}` and build `anonymousStatus` as `{ ...defaults, ...overrides.anonymous }`; the existing call stays `installMock()`.)

- [ ] **Step 1: Write the failing test**

```ts
describe('Expired session notice', () => {
  const page = () => render(
    <PresentationProvider layer={createRendererPresentation()}>
      <ProvisioningPage />
    </PresentationProvider>,
  );

  it('shows the revoke reason above the login form when the status is expired', async () => {
    installMock({ anonymous: {
      authentication: 'expired',
      message: 'This account is no longer active. Sign in again or contact your School Admin.',
    } });
    page();
    expect(await screen.findByText('This account is no longer active. Sign in again or contact your School Admin.')).toBeTruthy();
    expect(screen.getByText('Sign in to your school')).toBeTruthy();
  });

  it('shows no notice for a plain anonymous status', async () => {
    installMock();
    page();
    await screen.findByText('Welcome to NEMIS Desktop');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/desktop/renderer/app/page.test.tsx -t "Expired session notice"`
Expected: first test FAILS (message not found). The pre-existing "Fresh login without a page reload" failure is out of scope and must not be touched.

- [ ] **Step 3: Implement in `page.tsx`**

Inside the white login card `<div className="space-y-6 bg-white p-8 …">`, before `<LoginForm`:

```tsx
{status.authentication === 'expired' && status.message ? (
  <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    {status.message}
  </p>
) : null}
```

Also make sure the `showLogin` state is `true` for an expired status on mount (it already is: `setShowLogin(next.authentication !== 'authenticated')`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/desktop/renderer/app/page.test.tsx -t "Expired session notice"`
Expected: PASS (2 tests). Then `pnpm typecheck && pnpm lint` — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/app/page.tsx apps/desktop/renderer/app/page.test.tsx
git commit -m "feat(desktop): sign-in page explains a revoked session"
```

---

### Task 7: Gate

- [ ] **Step 1: Focused suite**

Run:
```
pnpm vitest run apps/desktop/electron/provisioning apps/desktop/renderer/components/shell apps/desktop/renderer/app/page.test.tsx apps/desktop/electron/ipc/authorizeChannel.test.ts packages/types
```
Expected: everything green except the two **pre-existing** failures named in Global Constraints (`WorkspaceManager.test.ts` ABI, `page.test.tsx` "Fresh login without a page reload"). If `ProvisioningImporter.test.ts` also fails with `ERR_DLOPEN_FAILED`, that is the same ABI issue; confirm with the Electron-ABI runner command.

- [ ] **Step 2: `pnpm typecheck && pnpm lint`** — PASS.

- [ ] **Step 3: Manual GUI checklist** — run the five items in the spec's "Manual GUI checklist" against a running server; record the outcome in the handoff, item by item (pass / fail / not run).
