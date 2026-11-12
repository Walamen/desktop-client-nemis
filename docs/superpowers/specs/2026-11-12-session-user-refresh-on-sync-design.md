# Session user refresh on sync — design

**Date:** 2026-11-12
**Repo:** desktop-client-nemis only (no Nemis server or portal-web changes)
**Status:** approved in conversation by Alvin 2026-11-12 (chat playback); document pending builder check

## Intent

When a School Admin changes an office-staff account on the web — adds or removes
a module, changes the title, or disables the account — the NEMIS Desktop user who
is signed in as that account must see the change on their next sync, exactly as a
web user sees it on their next page refresh. Today they only see it after a
logout + login (or an app restart).

## The bug this fixes

The desktop main process holds the signed-in user (`ProvisioningUser`: id, name,
role, scope, `modules`, `title`) in three places and only one of them is ever
refreshed:

| Copy | Written by | Read by | Fresh? |
|---|---|---|---|
| Disk session (`EncryptedSessionRepository`) | `BackendProvisioningGateway.restoreSession()` after **every** authorized server call (`/auth/me`), incl. every sync | nothing live | **yes** |
| `ProvisioningService.status.user` | `login()` and the **first** `getStatus()` per process (`restored` latch) | `AUTH_GET_STATUS` → renderer `RouteGuard` → `SessionUserProvider` → `Sidebar`, `ModuleGuard`, `hasModule` | stale |
| `WorkspaceManager.active.user` | `activate()`, called from the same two places | `authorizeChannel.assertOfficeAccess` on every IPC call | stale |

`WorkspaceManager.activate()` already has a same-identity branch ("keep the open
database but take the fresh user, so modules or title changed on the server reach
the main process") but nothing calls it from the refresh path. The `restored`
latch dates from phase 11 and exists for single-flight restore (refresh-token
rotation); it was never meant to freeze the user for the life of the process.

The server is already correct: `/auth/me` reads `modules`/`title` from the DB org
row, and `ModulesGuard` authorizes from `request.user.organizations` loaded per
request — the JWT `scopes` claim is ignored. Only the desktop's local picture lags.

## Goals

1. A successful online `/auth/me` (which every sync and every online action
   performs) becomes the single source of the signed-in user in the main process:
   workspace user, provisioning status user, and the renderer's session user all
   update from it.
2. Module added → sidebar group and pages become available on the next sync, no
   reload. Module removed while the user is on one of its pages → they are sent to
   the dashboard (existing `ModuleGuard` behaviour, matching the web).
3. Account disabled (or any server-side revocation) → on the next sync the
   renderer leaves the workspace and shows the sign-in screen with a one-line
   reason, instead of sitting on a dead workspace until restart.
   *Verified on the server (2026-11-12):* `SchoolAdminUsersService.setActive`
   deactivates the org row and, when no other active org remains, sets
   `user.isActive = false`; `jwt.strategy.validate` loads the user per request
   and throws 401 "User not found or inactive". `/auth/refresh` fails the same
   way, so the desktop's `restore()` ends in `UnauthorizedError`. No server
   change is needed for this goal.
4. A renderer reload (`AUTH_GET_STATUS`) returns the most recently fetched user,
   not the process-start one.

## Non-goals

- No change to how often sync runs, nor a new "refresh my permissions" button.
- No server endpoint or portal-web change.
- No live push from the server (socket) for membership changes; "upon sync" is
  the agreed cadence (Alvin: "same way the web works … added or removed upon
  sync").
- No change to the office-staff gating model itself (`SchoolAccess`,
  `authorizeChannel`, `ModuleGuard` logic stay as they are).
- Showing the office-staff **title** in the desktop header. The header reads
  name/photo/role from the local `users` row via `useCurrentUserViewModel`
  (IDENTITY_GET_CURRENT_USER), not from the session user, and nothing in the
  shell renders `ProvisioningUser.title` today. Adding it is separate UI work
  (possible follow-up). Name changes already reach the header through the sync
  pull of `users`, independent of this change.
- Changing what happens on server errors other than 401/403 (e.g. a 502 during
  a deploy). Today such an error clears the disk session but leaves the open
  workspace running; that stays as is. (Pre-existing quirk worth its own
  follow-up: a 5xx should probably be treated like "unavailable" and keep the
  disk session. Out of scope here.)

## Anti-goals (would make this a failure even if it "works")

- Offline regression: a sync that fails because the server is unreachable must
  never alter the user. The stored session is the deliberate offline fallback
  (`RestoreSession` returns the stored session on `AuthenticationUnavailableError`
  while the offline lease is valid). Only a **successful** online restore may
  overwrite the in-memory user.
- Workspace hot-swap: if `/auth/me` ever returns a user whose workspace identity
  (`id`, `role`, `scope.type`, `scope.scopeId`) differs from the open workspace,
  we must not close and reopen a different encrypted database mid-session
  (sync cycles and IPC handlers hold the active database). See "Identity change".
- Renderer churn: `restoreSession()` runs on every authorized request. The
  renderer must only be notified when the user actually changed.
- Breaking the single-flight restore: the refresh-token-rotation trap stays
  solved; the hook rides on the existing single-flight promise, it does not add
  a second `/auth/me` path.

## Design

### Main process

**1. `ProvisioningService` becomes the owner of "the current user".**

Add two methods:

- `applyRestoredSession(session: AuthenticatedSession): void`
  - If `status.authentication !== 'authenticated'` or `status.user` is null:
    ignore (a restore that completes during/after logout must not resurrect a
    session).
  - If `workspaceIdentity(session.user) !== workspaceIdentity(status.user)`:
    this is the identity-change case — call `revokeSession('changed')` (below)
    and return. Do not call `workspaces.activate`.
  - Otherwise, if `session.user` deep-equals `status.user` (field-wise compare
    of `ProvisioningUser`, including `modules` as a set and `title`): return
    without side effects.
  - Otherwise: `workspaces.activate(session.user)` (same-identity branch, keeps
    the DB open), set `status = { ...status, user: session.user }`, and emit
    `{ type: 'session', reason: 'refreshed' }`.
- `revokeSession(reason: 'disabled' | 'changed'): void`
  - Idempotent. If not currently authenticated, return.
  - `workspaces.close()`, then
    `status = { ...anonymousStatus(device), authentication: 'expired', message }`
    where `message` is
    - `'disabled'` → "This account is no longer active. Sign in again or contact
      your School Admin."
    - `'changed'` → "Your role or school assignment changed. Sign in again to
      open the right workspace."
  - `restored = true` (so a later `getStatus()` does not try to restore a
    cleared session), emit `{ type: 'session', reason: 'revoked' }`.
  - Does **not** call the server (`Logout` is for user-initiated logout; the
    server already refused us).
  - `login()` and `logout()` already overwrite `status`, so the expired state
    clears on the next sign-in.

The constructor gains an optional `emit?: (event: RealtimeEvent) => void`.

`getStatus()` and `login()` keep their current behaviour; the `restored` latch
stays. The latch is no longer the only refresh because the gateway hook below
keeps `status.user` fresh after it.

**2. `BackendProvisioningGateway.restoreSession()` reports its outcome.**

Constructor gains an optional fourth argument:

```ts
hooks?: {
  onRestored?(session: AuthenticatedSession): void;
  onRevoked?(): void;
}
```

Inside the existing single-flight body:
- after `await this.sessions.save(restored)` → `hooks.onRestored?.(restored)`;
- in the `catch`, **only** when the error is an `UnauthorizedError` or a
  `ForbiddenError` (from `@nemis-desktop/shared`) → `hooks.onRevoked?.()` after
  the existing `sessions.clear()`. Any other error (plain `Error` from a 5xx or
  a contract mismatch, `AuthenticationUnavailableError`) calls **no** hook, so
  the open workspace behaves exactly as it does today. Rationale: a server
  hiccup during a deploy must not sign a school out of its offline workspace.

Hooks are called synchronously after the state change and before the promise
resolves/rejects, so the IPC call that triggered the restore observes the updated
workspace user. Hook exceptions must not break the request: wrap each call in
try/catch and log.

This is the only place the fresh user is produced, so every sync (`syncActive`,
`pullNow`), every online command, `sessionCookie()` for the realtime socket — all
of them refresh the user for free.

**3. Event broadcast.** `main.ts` already has an inline `emit` for the county
`RealtimeClient` that sends `REALTIME_EVENT_CHANNEL` to every `BrowserWindow`.
Lift it to a shared `broadcastEvent(event: RealtimeEvent)` function and pass it to
both `RealtimeClient` and `ProvisioningService`. Wire the gateway hooks to
`provisioning.applyRestoredSession` / `provisioning.revokeSession('disabled')`.
(The gateway is constructed before the service; use a small forwarding closure
or a setter — builder's choice.)

**4. Type.** `RealtimeEvent` (packages/types `realtime.ts`) gains
`| { type: 'session'; reason: 'refreshed' | 'revoked' }`. Existing consumers
(`CountyMessagesPanel`, `CountyNotificationsPage`, `NotificationBell`) switch on
`event.type` and ignore unknown types; verify they compile and do nothing for the
new type.

### Renderer

**5. `RouteGuard` re-reads the session user on `session` events.**

- Subscribe via the existing `useRealtime` hook (or `eventsBridge.subscribe`).
- On `reason: 'refreshed'`: call `sharedBridge.getProvisioningStatus()` again and
  run the same checks as the initial effect (provisioned, authenticated, role
  route, `requiredRoles`, `roleCanAccessRoute`), then `setUser(status.user)`.
  Factor the existing effect body into one function used by both the mount
  effect and the event handler.
- On `reason: 'revoked'`: `router.replace('/')` (the sign-in route), same branch
  the mount check already takes for an unauthenticated status.

**5b. Sign-in page shows why.** `renderer/app/page.tsx` already fetches the
provisioning status and shows the login form when
`authentication !== 'authenticated'`. Add: when `status.authentication ===
'expired'` and `status.message` is set, render that message as a quiet notice
above the login form (reuse the page's existing notice/error styling). No other
change to the page.
- `SessionUserProvider` receives the new object → `Sidebar.visibleConfig`
  recomputes, `ModuleGuard` recomputes `allowed` and redirects to the dashboard
  if the current route lost its module, `hasModule` consumers (e.g.
  `PaymentRow`) re-render. No changes needed in those components.

**6. Nothing else in the renderer changes.** The status bar keeps polling sync
status; the Users & Access page is unaffected.

### Identity change (edge case, my call)

`/auth/me` returning a different `role` or scope for the same account (e.g. a
county admin re-assigned the person, or "most recent role wins" flipped) is
treated like a revocation: the renderer goes to sign-in and the next login opens
the right workspace. This is rare, and hot-swapping the encrypted database under
running sync/IPC is not worth the risk. Today this case silently keeps the old
workspace; the new behaviour is strictly safer.

### Offline (unchanged by design)

`AuthenticationUnavailableError` paths call neither hook. The in-memory user is
left as is. `RestoreSession.execute()` at first `getStatus()` still returns the
stored session within the offline lease.

## Sequence (module removed while on its page)

1. Admin removes STUDENTS from the Registrar on the web → DB updated.
2. Desktop background sync (≤20 s) → `syncActive` → `authorized()` →
   `restoreSession()` → `/auth/me` → user without STUDENTS → `sessions.save` →
   `onRestored(session)`.
3. `applyRestoredSession`: same identity, modules differ → `workspaces.activate`
   (fresh user, DB kept) → `status.user` updated → `broadcastEvent({type:'session',
   reason:'refreshed'})`.
4. From this instant, `authorizeChannel` refuses STUDENTS channels for this user.
5. Renderer `RouteGuard` receives the event → `getProvisioningStatus()` → new
   user → `setUser`.
6. `ModuleGuard` on `/government/school-admin/students` recomputes → not allowed
   → `router.replace('/government/school-admin')`. Sidebar drops the group.

## Tests the builder must add

- `ProvisioningService`: `applyRestoredSession` (a) ignores when anonymous,
  (b) no-op + no emit when user unchanged (including same modules in a different
  order), (c) activates + updates status + emits `refreshed` when modules/title
  change, (d) revokes on identity change; `revokeSession` closes workspace, resets
  status, emits `revoked`, idempotent.
- `BackendProvisioningGateway`: `onRestored` called once per single-flight
  restore (two concurrent `authorized()` calls → one hook call); `onRevoked`
  called on `UnauthorizedError` and on `ForbiddenError`; neither hook called on
  `AuthenticationUnavailableError` nor on a plain `Error` (5xx / contract
  mismatch); a throwing hook does not fail the request.
- `RouteGuard`: on `session/refreshed` re-fetches status and provides the new
  user; on `session/revoked` navigates to `/`.
- `renderer/app/page.tsx`: renders `status.message` when
  `authentication === 'expired'`; renders no notice otherwise.
- `packages/types`: `RealtimeEvent` union includes the new member (compile-time;
  an exhaustiveness test if one exists for the union).
- Existing `WorkspaceManager` same-identity test already covers the activate
  branch; keep it.

## Manual GUI checklist (after merge)

1. Web: add REPORTS to a Registrar. Desktop (signed in as that Registrar): wait
   ≤20 s or press Sync now → Reports group appears, pages open, IPC calls succeed.
2. Web: remove STUDENTS while the desktop is on a Students page → desktop lands
   on the dashboard; Students group gone.
3. Web: disable the account → desktop goes to sign-in on the next sync and the
   sign-in page says the account is no longer active.
4. Disconnect the network, change modules on the web, Sync now on the desktop →
   desktop unchanged (offline fallback); reconnect → change applies.
5. Renderer reload (Ctrl+R) after a module change already synced → new modules.

## Calls made after the builder check (2026-11-12)

Resolved without a decision from Alvin; overturn any of them before the plan:

1. **Title in header: out of scope.** The shell never rendered the office title;
   adding it is separate UI work. Moved to non-goals.
2. **Revocation = 401/403 only.** 5xx and malformed responses keep today's
   behaviour (no sign-out). Pre-existing "5xx clears the disk session" quirk
   noted as a follow-up, not touched.
3. **Disabled accounts are refused per request by the server** — verified in
   `jwt.strategy.ts` and `SchoolAdminUsersService.setActive`; goal 3 needs no
   server change.
4. **Revoke shows a reason** on the sign-in page via the existing
   `authentication: 'expired'` + `status.message` fields, two fixed strings.

## Left to the builder

- Exact shape of the deep-equality helper for `ProvisioningUser` (a small pure
  function with its own test is fine; `modules` compare order-insensitively).
- Whether `ProvisioningService` takes the hooks through the constructor or a
  `bind(gateway)` step; both are acceptable. Keep the IPC-handler surface
  unchanged (no new invoke channel — `authorizeChannel.test.ts` "every channel is
  classified or deliberately open" must stay green).
- Where `broadcastEvent` lives (`main.ts` local function or a tiny module under
  `electron/realtime/`).
