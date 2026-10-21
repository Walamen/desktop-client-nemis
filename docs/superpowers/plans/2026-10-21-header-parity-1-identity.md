# Header Parity, Plan 1 of 4: Identity, Photo, Logout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every role's desktop Header shows the signed-in person's real name, role label and photo, never flashes "User" during a reload, and has a busy, single-fire Sign Out.

**Architecture:** Root cause is server-side. The provisioning snapshot's `userOrganizations` (and the `users` derived from it) only holds institution-scoped memberships, so a County, DEO or Ministry caller's own row never reaches the device. A second, tiny query adds the caller's own desktop-role memberships to every snapshot. On the desktop, `photoUrl` is carried domain → repository → DTO → view, role labels gain overrides, `Avatar` falls back to initials when an image fails, and the Header reads `refreshing` as data.

**Tech Stack:** NestJS + Prisma + Jest (`Nemis/apps/server`); Electron + better-sqlite3, TypeScript, Vitest, React Testing Library (`desktop-client-nemis`).

**Spec:** [docs/superpowers/specs/2026-10-21-header-parity-design.md](../specs/2026-10-21-header-parity-design.md) (goals G1, G2, G5, G6). Plans 2–4 (bell, direct messages, Edit Profile) follow separately.

## Global Constraints

- Server first: Task 1 (Nemis) merges before the desktop tasks ship.
- Branches: `feat/header-parity` in `desktop-client-nemis` (already exists, holds the spec), and a new `feat/header-parity` in `Nemis` from `main`.
- Alvin has uncommitted edits in `desktop-client-nemis`: `apps/desktop/renderer/components/shell/Header.tsx` (one added `console.log`) and `apps/desktop/renderer/components/county/settings/CountySettingsPage.tsx`. **Never `git add -A` or `git add .`; stage only the files a task names.** Never stage `CountySettingsPage.tsx`. Task 5 removes the Header debug logs, including Alvin's line, only with Alvin's go-ahead at plan approval.
- Layering: hexagonal / CQRS / MVVM as in the repo. The renderer reaches data only through the presentation layer and `window.nemis`; respect the renderer ESLint boundary guard.
- `noUncheckedIndexedAccess` is on in the desktop repo; index access returns `T | undefined`.
- Desktop SQLite tests need the Node ABI build of better-sqlite3 (`pnpm rebuild:node`). Restore it with `pnpm rebuild:electron` before running the app.
- Photo URLs are Cloudinary (`https://res.cloudinary.com`), already allowed by `img-src` in `apps/desktop/electron/security/csp.ts`. Don't widen the CSP.

## Review Focus

1. **A County Admin whose own membership is inactive, or who holds two memberships (e.g. a DEO assignment and a COUNTY_ADMIN one).** The Header must show the active role's label, and the snapshot must carry both rows without duplicating the user. Pinned by Task 1's duplicate-merge test and Task 3's "inactive org is not a role" test.
2. **A photo URL that 404s or can't load offline.** The Header must show initials, not the generic placeholder photo. Pinned by Task 4.
3. **A user whose name is one word, or has a middle name.** The initials come from the first and last words, and the full name is shown untouched. Pinned by Task 5's "one-word name" and "three-word name" tests.
4. **Sign-out IPC that rejects or hangs.** It must still route to `/` and must not fire twice. Pinned by Task 5's "rejects" and "double click" tests.
5. **A Teacher snapshot.** `restrictTeacherSnapshot` filters `users` and `userOrganizations` to the caller. The new own-membership rows must survive that filter and still be the only ones. Pinned by Task 1's teacher test.

---

### Task 1 (Nemis server): the caller's own memberships in every snapshot

**Files:**
- Modify: `Nemis/apps/server/src/desktop-provisioning/desktop-provisioning.service.ts` (the `Promise.all` block around L303–414 and the `users`/`userOrganizations` mapping around L863–890)
- Test: `Nemis/apps/server/src/desktop-provisioning/desktop-provisioning.roster.spec.ts`

**Interfaces:**
- Produces: snapshot `data.users` always contains the caller (`user.userId`), and `data.userOrganizations` always contains every one of the caller's memberships whose role is in `DESKTOP_ROLES` (active **and** inactive, since merge never deletes), for every scope type. No new types. Desktop Task 2 relies on this shape.

- [ ] **Step 1: Create the branch.** In `Nemis`: `git switch main && git switch -c feat/header-parity`.

- [ ] **Step 2: Update the existing roster test, and write the new failing ones.**
  - The existing test expects `userOrganization.findMany` to be called once. Change it to: the **first** call's `where` (the scope roster) keeps `isActive: true` and `role: { in: [...5 roles] }`.
  - Add a test-local helper `snapshotFor(caller: UserContext, device, orgRows)`. It builds the Proxy `tx` from the existing test. Its `userOrganization.findMany` is a `jest.fn` whose `mockImplementation` returns `orgRows.filter(r => r.userId === where.userId)` when `where.userId` is set, and `[]` otherwise (the scope roster finds nothing). It returns `(await service.getSnapshot(...)).data`. Each org row carries `user: { id, firstName, lastName, email, isActive, emailVerified: true, phoneNumber: null, lastLoginAt: null, imageUrl, createdAt, updatedAt }`.
  - New tests:
    - `it("a County Admin snapshot carries the caller's own user and county membership")`: the caller is `{ userId: "ceo-1", role: "COUNTY_ADMIN", countyId: "county-1", organizations: [] }`; the device has `role: "COUNTY_ADMIN"`, `scopeType: "COUNTY"`, `scopeId: "county-1"`, `institutionId: null`; the org row is `{ id: "org-ceo", userId: "ceo-1", role: "COUNTY_ADMIN", institutionId: null, countyId: "county-1", districtId: null, isActive: true }`, with firstName `"Musu"`, lastName `"Kollie"`, imageUrl `"https://res.cloudinary.com/x/ceo.jpg"`. Assert `data.users` contains `{ id: "ceo-1", firstName: "Musu", lastName: "Kollie", photoUrl: "https://res.cloudinary.com/x/ceo.jpg" }` (`toEqual(expect.arrayContaining([expect.objectContaining(...)]))`) and `data.userOrganizations` contains `expect.objectContaining({ id: "org-ceo", role: "COUNTY_ADMIN", countyId: "county-1" })`.
    - `it("a Ministry Admin and a DEO snapshot carry the caller's own user")`: same shape, with MINISTRY_ADMIN/NATIONAL/`"national"` and DEO/DISTRICT/`"district-1"` (DEO org: `districtId: "district-1"`, `countyId: "county-1"`). Assert the caller's id is in `data.users` for each.
    - `it("does not duplicate the caller when the scope roster already returned their membership")`: the mock returns the same org row for both calls (scope and own). Assert `data.users.filter(u => u.id === "user-1")` has length 1 and `data.userOrganizations.filter(o => o.id === "org-1")` has length 1.
    - `it("keeps a Teacher snapshot to the caller's own user and memberships")`: TEACHER caller `user-t`, scope roster returns the teacher's org plus another teacher `user-x`'s org. Assert `data.users.map(u => u.id)` equals `["user-t"]`.
    - `it("asks for the caller's own memberships by userId and desktop role only")`: assert one `findMany` call has `where` equal to `{ userId: "user-1", role: { in: [5 roles] } }` and **no** `isActive` key.

- [ ] **Step 3: Run the tests to verify they fail.**
  Run: `cd Nemis/apps/server && npx jest src/desktop-provisioning/desktop-provisioning.roster.spec.ts`
  Expected: the County/Ministry/DEO/own-membership tests FAIL (the caller is missing from `data.users`, and there's only one `findMany` call). The dedupe and Teacher tests may pass already; that's fine.

- [ ] **Step 4: Implement.**
  - Add a second query to the `Promise.all` destructure, named `ownMemberships`: `tx.userOrganization.findMany({ where: { userId: user.userId, role: { in: [...DESKTOP_ROLES] } }, include: { user: true }, orderBy: { id: "asc" } })`. Put a comment above it: the caller's own assignment can carry only a countyId/districtId (County, DEO) or nothing at all (Ministry), so the scope roster misses it, and the Header and every current-user lookup need it.
  - Build `const roster = uniqueBy([...userOrganizations, ...ownMemberships], "id")`. Use `roster` in place of `userOrganizations` everywhere the snapshot maps users, `userOrganizations` and `institutionAdmin` (around L863–900). `uniqueBy` already exists in the file. Don't touch the scope query itself.

- [ ] **Step 5: Run the tests to verify they pass.** Same command. Expected: all roster tests PASS. Then run `npx jest src/desktop-provisioning` and expect no new failures compared with `main`. Note any pre-existing failures in the report rather than fixing them.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/desktop-provisioning/desktop-provisioning.service.ts src/desktop-provisioning/desktop-provisioning.roster.spec.ts
  git commit -m "fix(desktop-provisioning): every snapshot carries the caller's own user and memberships"
  ```

---

### Task 2 (desktop): a regression guard that a county-only membership imports and resolves

**Files:**
- Test: `desktop-client-nemis/apps/desktop/electron/data/adapters/business-e2e.test.ts` (add one `it`)

**Interfaces:**
- Consumes: the Task 1 snapshot shape (a `users` row plus a `user_organizations` row with `institutionId: null`, `countyId: "county-1"`).
- Produces: nothing new. This is a characterization test proving the desktop side needs no import change. It is expected to pass on first run.

- [ ] **Step 1: Write the test** `it('resolves the current user for a County Admin whose only membership is county-scoped')`. Insert directly through `manager.connection`, as the file's other seeds do: a `users` row (`id 'ceo-1'`, `firstName 'Musu'`, `lastName 'Kollie'`, `email 'ceo@moe.gov.lr'`, `isActive 1`, `version 1`, `updatedAt` ISO) and a `user_organizations` row (`id 'org-ceo'`, `userId 'ceo-1'`, `role 'COUNTY_ADMIN'`, `institutionId NULL`, `countyId 'county-1'`, `districtId NULL`, `isActive 1`). Then `createApplicationComposition(dataLayer, 'ceo-1', silent)`. Assert `(await app.identity.getCurrentUser()).data` matches `{ id: 'ceo-1', fullName: 'Musu Kollie', roles: ['COUNTY_ADMIN'] }`.

- [ ] **Step 2: Run it.** `pnpm rebuild:node`, then `pnpm vitest run apps/desktop/electron/data/adapters/business-e2e.test.ts`. Expected: PASS. If it fails, stop and report. That would mean a desktop-side filter exists and Plan 1 needs a new task.

- [ ] **Step 3: Commit.** `git add apps/desktop/electron/data/adapters/business-e2e.test.ts && git commit -m "test(identity): county-only membership resolves the current user"`

---

### Task 3 (desktop): photo URL and role labels reach the view

**Files:**
- Modify: `packages/domain/src/identity/entities/user.ts` (`UserState`, `ReconstituteUserInput`, a getter)
- Modify: `apps/desktop/electron/data/repositories/sqlite/business/SqliteUserRepository.ts` (`UserRow`, `USER_COLUMNS`, `#toUser`)
- Modify: `packages/application/src/dto/identity/identity-dto.ts`, `packages/application/src/mappers/identity/user-mapper.ts`
- Modify: `packages/presentation/src/view-models/current-user/current-user-views.ts`, `packages/presentation/src/mappers/identity/user-view-mapper.ts`, `packages/presentation/src/formatters/format-text.ts`
- Test: `packages/presentation/src/view-models/current-user/current-user-view-model.test.ts`, `packages/application/src/use-cases/identity/get-current-user.test.ts`, `packages/domain/src/identity/identity.test.ts`, and the formatter test next to `format-text.ts` (create `format-text.test.ts` if none exists)

**Interfaces:**
- Produces:
  - `ReconstituteUserInput.photoUrl?: string | null`, and `get photoUrl(): string | null` on `User` (absent → `null`). `CreateUserInput` is unchanged.
  - `UserOutput.photoUrl: string | null`.
  - `UserView.photoUrl: string | null`, `UserView.firstName: string`, `UserView.lastName: string`. Task 5 uses them for the Avatar instead of splitting `fullName`.
  - `UserOutput.firstName: string` and `UserOutput.lastName: string`, taken from `user.name` (`PersonName`; read its existing getters).
  - `humanizeRole`: `COUNTY_ADMIN → 'County Education Officer'`, `DEO → 'DEO'`, `MINISTRY_ADMIN → 'Ministry Admin'`, and `INSTITUTION_ADMIN → 'Principal'` stays. These are my calls, matching the web's intent. The web keys County's label to `COUNTY_OFFICER`, which no County Admin has, so the web actually shows the raw role, and the desktop dashboard already says "County Education Officer".

- [ ] **Step 1: Write the failing tests.**
  - Domain: `reconstitute` with `photoUrl: 'https://res.cloudinary.com/x/a.jpg'` → `user.photoUrl` equals it. Without it → `null`.
  - Application `get-current-user.test.ts`: the repository returns a user reconstituted with `photoUrl`, `firstName 'Musu'`, `lastName 'Kollie'` and one inactive DEO org plus one active COUNTY_ADMIN org. Expect `data` to match `{ photoUrl: 'https://res.cloudinary.com/x/a.jpg', firstName: 'Musu', lastName: 'Kollie', roles: ['COUNTY_ADMIN'] }`.
  - Presentation view-model test: `toUserView` carries `photoUrl`, `firstName` and `lastName`, and `roleLabels` is `['County Education Officer']` for `roles: ['COUNTY_ADMIN']`.
  - Formatter: `humanizeRole('DEO') === 'DEO'`, `humanizeRole('MINISTRY_ADMIN') === 'Ministry Admin'`, `humanizeRole('COUNTY_ADMIN') === 'County Education Officer'`, `humanizeRole('TEACHER') === 'Teacher'`.

- [ ] **Step 2: Run them to verify they fail.** `pnpm vitest run packages/domain packages/application/src/use-cases/identity packages/presentation/src/view-models/current-user packages/presentation/src/formatters`. Expected: FAIL on the missing `photoUrl`/`firstName` and on the labels.

- [ ] **Step 3: Implement.** Add the fields along the chain listed in Interfaces. In the repository, add `photoUrl` to `USER_COLUMNS` and `UserRow` (`string | null`) and pass it to `reconstitute`. The column exists since migration 032. Add the three `ROLE_LABEL_OVERRIDES` entries.

- [ ] **Step 4: Run the tests to verify they pass.** Same command → PASS. Then `pnpm vitest run` and `pnpm typecheck`. Expected: no new failures. Fix any test that asserted the old `'Deo'` label; grep `'Deo'` across the repo. Every other fixture that builds a `UserOutput`/`UserView` literal must gain the new fields, or the typecheck fails. Fix them.

- [ ] **Step 5: Commit.** Stage only the files listed above, plus any fixtures Step 4 touched. Message: `feat(identity): current user carries photo, first/last name, friendlier role labels`.

---

### Task 4 (desktop ui): Avatar falls back to initials when the image fails

**Files:**
- Modify: `packages/ui/src/Avatar.tsx` (the `src` branch)
- Test: `packages/ui/src/ui-package.test.tsx` (add to it, or create `packages/ui/src/Avatar.test.tsx`)

**Interfaces:**
- Produces: the `Avatar` contract is unchanged. Behaviour: when `src` errors and initials are computable, render the initials `div` (same classes as the no-`src` path). Otherwise use the role fallback image, as today.

- [ ] **Step 1: Write the failing tests.**
  - `it('shows initials when the photo fails to load')`: render `<Avatar src="https://res.cloudinary.com/x/missing.jpg" firstName="Musu" lastName="Kollie" />`, then `fireEvent.error(screen.getByRole('img'))`. Expect `screen.getByText('MK')`, and expect `screen.queryByRole('img')` to be null.
  - `it('shows the role fallback image when the photo fails and there are no initials')`: render `<Avatar src="https://res.cloudinary.com/x/missing.jpg" role="deo" />`, fire an error, and expect the img `src` to end with `/deo-fallback.jpg`.

- [ ] **Step 2: Run them to verify they fail.** `pnpm vitest run packages/ui`. The first test is expected to FAIL.

- [ ] **Step 3: Implement** by routing `errored` into the existing no-`src` branch (treat `errored` as "no src").

- [ ] **Step 4: Run them to verify they pass.** Same command → PASS.

- [ ] **Step 5: Commit.** `git add packages/ui/src/Avatar.tsx <test file> && git commit -m "fix(ui): Avatar shows initials when the photo fails to load"`

---

### Task 5 (desktop renderer): Header shows name/role/photo through reloads; busy single-fire Sign Out

**Files:**
- Modify: `apps/desktop/renderer/components/shell/Header.tsx`
- Modify: `apps/desktop/renderer/app/government/county/page.tsx:40-46` (use `firstName`/`lastName` from the view instead of splitting `fullName`)
- Test: `apps/desktop/renderer/components/shell/Header.test.tsx`

**Interfaces:**
- Consumes: `UserView.photoUrl`, `firstName`, `lastName` and `roleLabels` (Task 3), and the `Avatar` fallback (Task 4). `sharedBridge.logout(): Promise<void>` already exists.
- Produces: nothing for later plans except the Header layout. Plans 2–3 replace the bell. Leave the existing bell markup and its toast-count line alone; Plan 2 replaces it.

- [ ] **Step 0: Ask before touching Alvin's line.** If plan approval didn't explicitly OK removing Alvin's uncommitted `console.log` in `Header.tsx`, stop and ask.

- [ ] **Step 1: Write the failing tests** in `Header.test.tsx`. The mock store's data gains `firstName`, `lastName` and `photoUrl`. Mock `@/services/nemis-bridge/shared` as `{ sharedBridge: { logout: vi.fn() } }`, and give the mocked `useRouter` a shared `replace` spy.
  - `it('keeps the name and role on screen while the user reloads')`: state `{ status: 'refreshing', data: {...} }` → `getByText('Joseph Boakai')` and `getByText('Principal')`.
  - `it('shows the photo when the user has one')`: `photoUrl: 'https://res.cloudinary.com/x/jb.jpg'` → `getByRole('img', { name: 'Joseph Boakai' })` has that `src`.
  - `it('builds initials from first and last name for a one-word name')`: `fullName 'Musu'`, `firstName 'Musu'`, `lastName ''`, no photo → `getByText('M')`.
  - `it('shows a three-word name in full')`: `fullName 'Musu T. Kollie'` → `getByText('Musu T. Kollie')`.
  - `it('shows "Signing out…" and signs out once on a double click')`: `logout` returns a never-resolving promise. Open the menu and click "Sign Out" twice. Expect `logout` to have been called once and `getByText('Signing out…')`.
  - `it('still routes to sign-in when sign-out rejects')`: `logout` rejects → `await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))`.
  - `it('writes nothing to the console')`: spy on `console.log`, render, and expect it not to have been called.

- [ ] **Step 2: Run them to verify they fail.** `pnpm vitest run apps/desktop/renderer/components/shell/Header.test.tsx`. Expected: FAIL on refreshing, photo, initials, signing-out and console.

- [ ] **Step 3: Implement.**
  - Treat `status === 'success' || status === 'refreshing'` as data (the county dashboard's rule).
  - Pass `src={photoUrl}`, `firstName` and `lastName` to `Avatar`.
  - Add `const [signingOut, setSigningOut] = useState(false)`. The Sign Out item is `disabled={signingOut}`, reads `Signing out…` while busy, and guards on `signingOut` before calling. On rejection it `console.error`s the failure (the repo rule "never fail silently") and still `router.replace('/')`.
  - Remove both `console.log` lines.
  - In the county dashboard, take `firstName`/`lastName` from the view.

- [ ] **Step 4: Run them to verify they pass.** Same command → PASS. Then `pnpm vitest run apps/desktop/renderer` and `pnpm lint`. Expected: no new failures and 0 lint errors.

- [ ] **Step 5: Commit.** `git add apps/desktop/renderer/components/shell/Header.tsx apps/desktop/renderer/components/shell/Header.test.tsx apps/desktop/renderer/app/government/county/page.tsx && git commit -m "fix(shell): Header keeps the user through reloads, shows the photo, single-fire Sign Out"`. Confirm afterwards that `git status` still shows `CountySettingsPage.tsx` modified and unstaged.

---

### Task 6: whole-branch verification

- [ ] **Step 1:** `Nemis/apps/server`: `npx jest src/desktop-provisioning` → no new failures versus `main`.
- [ ] **Step 2:** `desktop-client-nemis`: `pnpm typecheck`, `pnpm lint`, then `pnpm vitest run` → no new failures versus `main` (record the pre-existing count first).
- [ ] **Step 3:** `pnpm rebuild:electron`, then run the app signed in as a County Admin, after the local server runs the Task 1 change. Confirm the next sync brings the name and role into the Header, and that the County dashboard greeting shows the name. Record this as a manual check for Alvin if it can't be run here.
