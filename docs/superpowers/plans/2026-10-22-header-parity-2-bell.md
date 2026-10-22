# Header Parity, Plan 2 of 4: Notification Bell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** County, School Admin and Teacher get a working Header notification bell that mirrors the web `NotificationBell`, reads from the device (works offline), and stays current after syncs, realtime pushes and reads on the Notifications pages.

**Architecture:** A role-agnostic read stack, following the County Notifications pattern:
- Types: a new `HeaderNotificationsSummary`.
- Application: the port `IHeaderNotificationsReadModel`, the use case `GetHeaderNotificationsUseCase`, and `IdentityApplicationService.getHeaderNotifications()`.
- Main process: a SQLite read model, plus the IPC channel `identity:header-notifications`.
- Presentation: `HeaderNotificationsViewModel`.
- Renderer: a `NotificationBell` component in the shell Header, shown only for the roles flagged in `headerConfigs`.

This replaces today's bell, which counts pop-up toasts (a spec anti-goal).

**Tech Stack:** TypeScript, Electron + better-sqlite3, Zustand (vanilla) ViewModels, React + Next.js renderer, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-21-header-parity-design.md](../specs/2026-10-21-header-parity-design.md), goal G3 and the DEO/Ministry non-goal. Plan 1 (identity) is merged. Plans 3 (messages) and 4 (Edit Profile) follow.

## Global Constraints

- Repo `desktop-client-nemis`, branch `feat/header-bell` (already created from `main` at `0ac5e28`). No server change in this plan.
- Alvin has uncommitted edits in `apps/desktop/package.json` and `pnpm-lock.yaml`. **Never stage them; never `git add -A` or `git add .`.** Stage only the files a task names.
- Hexagonal / CQRS / MVVM as in the repo. The renderer reaches data only through the presentation layer and `window.nemis`; respect the renderer ESLint boundary guard. `noUncheckedIndexedAccess` is on.
- Desktop SQLite tests run with `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>` from the repo root. **Never `pnpm rebuild:node`.** Pure-TS tests may use `pnpm vitest run <paths>`. Known pre-existing failures: `apps/desktop/renderer/app/page.test.tsx` and `.../teacher/timetable/timetable.test.tsx`.
- Bell behaviour, verbatim from the spec:
  - The badge counts unread notifications **excluding type `NEW_MESSAGE`**, showing `99+` above 99.
  - The dropdown lists up to **5** unread non-message notifications, newest first. Each shows the title, a coloured type tag (`getNotificationMeta`), the message clamped to 2 lines (`line-clamp-2`), and a relative time (`relativeTime`).
  - Clicking an item navigates to its link and closes the dropdown.
  - The footer reads **"View all notifications"** and links to `<basePath>/notifications`.
  - The empty state reads **"No notifications"**. When the count is above 0, the header pill reads **"{n} new"**.
- Bell roles: `INSTITUTION_ADMIN`, `COUNTY_ADMIN`, `TEACHER`. **DEO and MINISTRY_ADMIN show no bell at all.** That's my call under the spec's "builder's call", because a plain inert icon would pretend to have data.
- Reuse `getNotificationMeta` and `relativeTime` from `apps/desktop/renderer/components/notifications/shared.tsx` (already ported from the web). Don't make a third copy.
- Don't mark a notification read when it's clicked in the dropdown. The web doesn't.

## Review Focus

1. **A notification whose link is outside the user's portal, malformed, or null.** Clicking it must not 404 the static-export app; it goes to the role's Notifications page instead. Pinned in Task 4: `toPortalRoute` tests plus "an item without a usable link opens the Notifications page".
2. **Another user's notifications on the same device**, if `user_notifications` ever holds rows for other recipients. The bell must count and list only the signed-in user's. Pinned in Task 2's "ignores other recipients" test.
3. **A failing load (IPC error, locked database).** The bell keeps its last count and doesn't throw into the Header. Pinned in Task 3's "keeps the last summary when a reload fails" test.
4. **Reading notifications on the Notifications page.** The bell's count must drop without waiting for a sync. Pinned in Task 5.
5. **More than 99 unread, or exactly 0.** The badge shows `99+`, and nothing at all for 0. Pinned in Task 4's "caps at 99+" and "no badge at zero" tests.

---

### Task 1: Application read port, use case and Identity service method

**Files:**
- Create: `packages/types/src/header-notifications.ts`; export it from `packages/types/src/index.ts`
- Create: `packages/application/src/interfaces/identity/header-notifications-read-model.ts`; export it from the identity interfaces barrel, following how `IUserRepository` is exported
- Create: `packages/application/src/use-cases/identity/get-header-notifications.ts`
- Create: `packages/application/src/testing/identity/in-memory-header-notifications.ts`, mirroring `packages/application/src/testing/county/in-memory-county-messaging.ts`; export it the same way the county fakes are exported
- Modify: `packages/application/src/services/identity-application-service.ts`, `packages/application/src/factories/create-application-layer.ts` (`ApplicationPorts` + the identity wiring near L478), `packages/presentation/src/testing/create-test-application.ts` (register the fake, as `countyNotifications` is at L70/L121)
- Test: `packages/application/src/use-cases/identity/get-header-notifications.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // @nemis-desktop/types
  export interface HeaderNotification { id: string; type: string; title: string; message: string; link: string | null; createdAt: string }
  export interface HeaderNotificationsSummary { unread: number; recent: HeaderNotification[] }
  // @nemis-desktop/application
  export interface IHeaderNotificationsReadModel { summary(recipientId: string, limit: number): HeaderNotificationsSummary }
  export const HEADER_NOTIFICATIONS_LIMIT = 5;
  class GetHeaderNotificationsUseCase // deps { readModel: IHeaderNotificationsReadModel; currentUserId: string; logger: IAppLogger }; execute(query: Record<string, never>)
  IdentityApplicationService.getHeaderNotifications(): Promise<ApplicationResponse<HeaderNotificationsSummary>>
  ApplicationPorts.headerNotifications: IHeaderNotificationsReadModel
  class InMemoryHeaderNotificationsReadModel implements IHeaderNotificationsReadModel // public `summaries: Map<string, HeaderNotificationsSummary>`; records the last `limit` it was called with as `lastLimit`
  ```

- [ ] **Step 1: Write the failing tests** in `get-header-notifications.test.ts`:
  - `it("asks the read model for the current user's summary, five at most")`: an in-memory read model holds `summaries.set('user-1', { unread: 3, recent: [one item] })`. The use case is built with `currentUserId: 'user-1'`. Expect `(await uc.execute({})).data` toEqual that summary, and `readModel.lastLimit` toBe `5`.
  - `it('returns an empty summary for a user with none')`: `currentUserId: 'nobody'` → data toEqual `{ unread: 0, recent: [] }`. The in-memory fake returns that default.
- [ ] **Step 2: Run** `pnpm vitest run packages/application/src/use-cases/identity/get-header-notifications.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the types, port, constant, use case (`invokeUseCase('GetHeaderNotifications', …)`, as `GetCountyNotificationsUseCase` does), fake, service method and port wiring (`new GetHeaderNotificationsUseCase({ readModel: ports.headerNotifications, currentUserId: ports.currentUserId, logger })`).
- [ ] **Step 4: Run** the test → PASS. Then `pnpm typecheck`. Expected: errors only where `ApplicationPorts` is constructed in the main process (`createApplicationComposition.ts`); Task 2 fixes those. Fix any other construction sites (test helpers) now.
- [ ] **Step 5: Commit** the files above: `feat(identity): header notifications read port and use case`.

---

### Task 2: SQLite read model, composition and IPC channel

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteHeaderNotificationsReadModel.ts`
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (repositories type + construction, as `countyNotifications` at L101/L178/L238), `apps/desktop/electron/data/adapters/createApplicationComposition.ts` (`headerNotifications: dataLayer.repositories.headerNotifications`)
- Modify: `packages/types/src/ipc.ts` (channel map entry `'identity:header-notifications': { args: []; result: HeaderNotificationsSummary }`, and `IpcChannels.IDENTITY_HEADER_NOTIFICATIONS`), `packages/types/src/api.ts` (`IdentityApi.getHeaderNotifications(): Promise<HeaderNotificationsSummary>`), `apps/desktop/electron/preload/shared/identity-api.ts`, `apps/desktop/electron/ipc/handlers/shared/identity.ts` (validator `assertNoArgs`)
- Test: `apps/desktop/electron/data/repositories/sqlite/business/SqliteHeaderNotificationsReadModel.test.ts` (seed through a real `DatabaseManager`, as `SqliteCountyNotificationsRepository`'s test does; find it next to that file or in the business-e2e tests). Also add an `it` to the existing IPC registration test for shared identity handlers, if one exists, asserting the channel is registered.

**Interfaces:**
- Consumes: `IHeaderNotificationsReadModel`, `HeaderNotificationsSummary` (Task 1).
- Produces: `window.nemis.identity.getHeaderNotifications(): Promise<HeaderNotificationsSummary>` over channel `identity:header-notifications`.

- [ ] **Step 1: Write the failing tests** for `new SqliteHeaderNotificationsReadModel(context).summary(recipientId, 5)`. Seed `user_notifications` rows directly (look up its columns in the migrations).
  - `it('counts unread non-message notifications and lists the newest five')`: 7 unread non-message rows for `user-1` with increasing `createdAt`, plus 1 read row. Expect `unread` 7, `recent.length` 5, `recent[0]` the newest, and each item to have exactly `{ id, type, title, message, link, createdAt }`.
  - `it('leaves NEW_MESSAGE notifications out of the count and the list')`: 2 unread `NEW_MESSAGE` + 1 unread `GENERAL_ALERT` → `unread` 1, and `recent.map(r => r.type)` equals `['GENERAL_ALERT']`.
  - `it('ignores other recipients')`: 3 unread rows for `user-2` → summary for `user-1` is `{ unread: 0, recent: [] }`.
  - `it('breaks createdAt ties by id, newest id first')`: two rows with the same `createdAt` and ids `n-a` and `n-b` → `recent[0].id` is `n-b`.
- [ ] **Step 2: Run** them with Electron-as-Node. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** with two prepared statements, wrapped in `guarded('SqliteHeaderNotificationsReadModel.summary', …)`:
  - `COUNT(*) … WHERE recipientId = ? AND isRead = 0 AND type <> 'NEW_MESSAGE'`
  - `SELECT id, type, title, message, link, createdAt … same WHERE … ORDER BY createdAt DESC, id DESC LIMIT ?`

  Wire the data layer, the composition, the channel, the preload method and the handler, as `IDENTITY_GET_CURRENT_USER` is wired.
- [ ] **Step 4: Run** the tests → PASS. Then `pnpm typecheck` (clean) and `pnpm lint` (0 errors).
- [ ] **Step 5: Commit:** `feat(identity): SQLite header notifications summary over IPC`.

---

### Task 3: Presentation ViewModel and renderer wiring

**Files:**
- Create: `packages/presentation/src/view-models/notifications/header-notifications-view-model.ts` (+ export from the presentation barrel, as the county VMs are)
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts` (`viewModels.headerNotifications = new HeaderNotificationsViewModel({ identity: app.identity })`)
- Modify: `apps/desktop/renderer/lib/ipc/shared.ts` (`identity.getHeaderNotifications: () => query(() => sharedBridge.getHeaderNotifications())`), `apps/desktop/renderer/services/nemis-bridge/shared/identity-bridge.ts` (`getHeaderNotifications`), `apps/desktop/renderer/lib/presentation/hooks/shared.ts` (`useHeaderNotificationsViewModel`)
- Test: `packages/presentation/src/view-models/notifications/header-notifications-view-model.test.ts` (use `create-test-application`'s in-memory fake from Task 1)

**Interfaces:**
- Consumes: `IdentityApplicationService.getHeaderNotifications` (Task 1), `window.nemis.identity.getHeaderNotifications` (Task 2).
- Produces:
  ```ts
  interface HeaderNotificationsState { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly unread: number; readonly recent: readonly HeaderNotification[] }
  class HeaderNotificationsViewModel { readonly store; load(): Promise<void> }
  useHeaderNotificationsViewModel(): HeaderNotificationsViewModel   // renderer hook
  ```
  `load()` sets `loading` only from `idle`. A reload keeps the current `unread`/`recent` on screen (no flicker). On failure it sets `status: 'error'` and keeps the last data. It never throws.

- [ ] **Step 1: Write the failing tests:**
  - `it('loads the summary')`: the fake holds `{ unread: 2, recent: [a, b] }` for the test app's current user → after `load()`, state matches `{ status: 'ready', unread: 2, recent: [a, b] }`.
  - `it('keeps the last summary when a reload fails')`: load once (unread 2), then make the fake's `summary` throw, and `await load()` resolves (it doesn't reject). State matches `{ status: 'error', unread: 2 }`.
  - `it('does not drop to loading during a reload')`: after a first load, start a second `load()` and synchronously assert `store.getState().status` is not `'loading'`.
- [ ] **Step 2: Run** `pnpm vitest run packages/presentation/src/view-models/notifications`. Expected: FAIL.
- [ ] **Step 3: Implement** the VM and the wiring.
- [ ] **Step 4: Run** → PASS. Then `pnpm vitest run apps/desktop/renderer/lib` (the IPC facade tests; `index.test.ts` may enumerate methods, so update it if it does) and `pnpm typecheck`.
- [ ] **Step 5: Commit:** `feat(presentation): header notifications view model`.

---

### Task 4: NotificationBell in the Header

**Files:**
- Modify: `packages/ui/src/Dropdown.tsx`: add optional props `triggerLabel?: string` (the trigger button's `aria-label`) and `panelClassName?: string` (replaces the default `w-56`). Existing callers are unchanged.
- Create: `apps/desktop/renderer/components/shell/notification-links.ts` with `toPortalRoute(link: string | null | undefined, basePath: string): string | null`
- Create: `apps/desktop/renderer/components/shell/NotificationBell.tsx` with `NotificationBell({ basePath }: { basePath: string })`
- Modify: `apps/desktop/renderer/components/shell/sidebarConfig.ts`: add `showNotificationBell: boolean` to `HeaderConfig`; `true` for INSTITUTION_ADMIN, COUNTY_ADMIN and TEACHER, `false` for DEO and MINISTRY_ADMIN
- Modify: `apps/desktop/renderer/components/shell/Header.tsx`: delete the old bell button and the `useNotificationStore`/`unread` lines; render `{headerConfigs[role].showNotificationBell && <NotificationBell basePath={headerConfigs[role].basePath} />}`
- Test: `apps/desktop/renderer/components/shell/notification-links.test.ts`, `apps/desktop/renderer/components/shell/NotificationBell.test.tsx`, and update `Header.test.tsx` (drop the toast-count assertion; mock `useHeaderNotificationsViewModel`)

**Interfaces:**
- Consumes: `useHeaderNotificationsViewModel` (Task 3); `getNotificationMeta` and `relativeTime` from `@/components/notifications/shared`; `toDesktopRoute` from `@/components/county/notifications/links`; `useRevalidateOnSync`, `useRealtime`, `usePathname`, `useRouter`.
- Produces: `toPortalRoute`, used by Task 5's page links only if a page chooses to (not required).

`toPortalRoute` rules:
- When `basePath` is the County route, delegate to `toDesktopRoute(link)`.
- Otherwise return `link` when it is the base path itself or starts with `${basePath}/`, and doesn't start with `//`.
- Anything else, including `null`, `''` and other portals, returns `null`.

Bell behaviour:
- Load on mount, on every `pathname` change and after every sync (`useRevalidateOnSync(() => { void vm.load(); }, [pathname])`).
- Load on a realtime `{ type: 'notification' }` event.
- Load when the dropdown opens.
- Panel: `w-80`, a "Notifications" heading, the `"{n} new"` pill when `unread > 0`, the list in `max-h-96 overflow-y-auto`, and the footer.
- An item click routes to `toPortalRoute(link, basePath) ?? \`${basePath}/notifications\``, then closes the dropdown.
- Trigger: the `Bell` icon plus a badge (`99+` cap), with `triggerLabel={\`${unread} unread notifications\`}`.

- [ ] **Step 1: Write the failing tests.**
  - `notification-links.test.ts`:
    - `toPortalRoute('/government/school-admin/students', '/government/school-admin')` → the same string.
    - `toPortalRoute('/government/teacher', '/government/teacher')` → the same.
    - `toPortalRoute('/government/county/schools/abc', '/government/county')` → `'/government/county/schools/details?id=abc'`.
    - `toPortalRoute('/government/county/schools', '/government/school-admin')` → `null`.
    - `toPortalRoute('//evil.example/x', '/government/teacher')` → `null`.
    - `toPortalRoute(null, '/government/teacher')` → `null`.
    - `toPortalRoute('/government/school-adminx', '/government/school-admin')` → `null`.
  - `NotificationBell.test.tsx` (mock the VM hook with a vanilla store, plus `next/navigation` with a shared `push` spy, `useRevalidateOnSync` and `useRealtime`):
    - `it('shows the unread count')` (unread 3 → `getByLabelText('3 unread notifications')` and text `3`)
    - `it('caps at 99+')` (unread 150 → `99+`)
    - `it('shows no badge at zero')` (unread 0 → `queryByText('0')` is null)
    - `it('lists recent notifications with their type tag and time')`: one item of type `GENERAL_ALERT`, title `Exam week`. Open → `getByText('Exam week')`, `getByText('Alert')`, `getByText('3 new')` when unread 3.
    - `it('says when there is nothing new')`: recent `[]` → open → `getByText('No notifications')`.
    - `it('goes to the notification link inside the portal')`: link `/government/school-admin/students`, basePath school-admin → click the item → `push` called with that link, and the dropdown is closed (`queryByText('View all notifications')` is null).
    - `it('an item without a usable link opens the Notifications page')`: link `null` → push `'/government/school-admin/notifications'`.
    - `it('View all notifications opens the Notifications page')`.
    - `it('reloads when opened')`: the `load` spy has one more call after clicking the trigger.
  - `Header.test.tsx`:
    - `it('shows no bell for DEO or Ministry')`: `queryByLabelText(/unread notifications/)` is null for `SystemRole.DEO` and `SystemRole.MINISTRY_ADMIN`.
    - `it('shows the bell for County, School Admin and Teacher')`.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/components/shell packages/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.** The Dropdown props, `toPortalRoute`, `NotificationBell`, the config flag and the Header change. Item markup follows the web bell: title (`truncate`), type tag, message, time.
- [ ] **Step 4: Run** → PASS. Then the Electron-as-Node run over `apps/desktop/renderer` (only the 2 known failures), `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit:** `feat(shell): working notification bell for County, School Admin and Teacher`.

---

### Task 5: Notifications pages refresh the bell after marking read

**Files:**
- Modify: `apps/desktop/renderer/components/notifications/NotificationsPage.tsx` (School Admin and Teacher): after `handleMarkRead` and `handleMarkAllRead` reload, also `void headerNotifications.load()`
- Modify: `apps/desktop/renderer/components/county/notifications/CountyNotificationsPage.tsx`: the same, after its mark-read and mark-all-read actions (find the single-item handler near the list, around L150)
- Test: `apps/desktop/renderer/components/county/notifications/CountyNotificationsPage.test.tsx` (extend), and a new `apps/desktop/renderer/components/notifications/NotificationsPage.test.tsx`

**Interfaces:**
- Consumes: `useHeaderNotificationsViewModel().load()` (Task 3).

- [ ] **Step 1: Write the failing tests.**
  - County page: `it('refreshes the header bell after Mark all read')`: mock `useHeaderNotificationsViewModel` with a `load` spy, click "Mark all read", and `await waitFor(() => expect(load).toHaveBeenCalled())`. Also `it('refreshes the header bell after marking one read')`.
  - Shared page: mock `sharedBridge.listSchoolAdminRecords` (one unread row for the current user), `sharedBridge.saveSchoolAdminRecord`, `schoolAdminBridge.getSchoolSummary`, the current-user VM and the header VM. Then `it('refreshes the header bell after Mark all read')`.
- [ ] **Step 2: Run** `pnpm vitest run apps/desktop/renderer/components/notifications apps/desktop/renderer/components/county/notifications`. Expected: FAIL.
- [ ] **Step 3: Implement** the two calls.
- [ ] **Step 4: Run** → PASS. Then `pnpm lint`.
- [ ] **Step 5: Commit:** `feat(notifications): reading on the Notifications page updates the bell`.

---

### Task 6: Whole-branch verification

- [ ] `pnpm typecheck`; `pnpm lint` → 0 errors; Electron-as-Node full `vitest.mjs run` → only the 2 known failures.
- [ ] A manual check for Alvin, if it can't be run here. Sign in as a County Admin with unread notifications: the bell shows the count, the dropdown lists them, and marking all read on the Notifications page drops the count straight away. As a DEO there's no bell.
