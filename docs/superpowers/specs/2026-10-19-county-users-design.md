# County Admin: Administrative Users

Date: 2026-10-19. Repos: `desktop-client-nemis` (the port) and `Nemis` (server + portal-web fixes).
Branches: `feat/county-users` in both (worktrees `Walamen/desktop-client-nemis-users`, `Walamen/Nemis-users`).

Page 7 of the County Admin migration, after Dashboard, Districts, Schools, Students, Teachers and Parents &
Guardians. The Schools approvals queue is still skipped.

## 1. Intent

A County Admin uses this page to manage the administrators who work under them: the county's DEOs and its School
Admins. They see who exists and their status, create new ones (one at a time or from a CSV), assign or re-assign
them to a district or school, enable or disable them, and hand an unactivated user their activation link.

Alvin asked (2026-10-19) to **follow the patterns he chose for the earlier County pages**:

- an exact port of the web's design and behaviour;
- the list and stats computed offline from synced SQLite;
- server-side writes as online-only commands (the Manage DEO pattern: `runOnline` + forced pull, disabled offline);
- the full hexagonal path;
- the web's broken numbers fixed on both sides, and the endpoints the page uses locked to the county's admin (the
  Teachers precedent).

Decisions marked **[ALVIN]** are still open. Each one shows my recommendation, and the rest of the spec assumes it.

## 2. What the web does today (recon, 2026-10-19)

Files: `portal-web/src/app/government/county/users/page.tsx`, `create/page.tsx`, `create/bulk/page.tsx`,
`components/AssignUserModal.tsx`, `components/DisableUserModal.tsx`, `src/components/ActivationTokenDisplay.tsx`,
`store/county/Api/userManagementApi.ts`. (`users/components/CreateUserModal.tsx`, `BulkCreateUsersModal.tsx` and
`users/components/ActivationTokenDisplay.tsx` are not used by the county pages and are not ported.)

- **List page ("User Management"):**
  - a dark header band (county name, "User Management", **Bulk Create** and **Create User** buttons);
  - four stat cards: Total Users ("All roles"), Active Users ("Last 30 days"), Pending Activation ("Not verified"),
    School Admins ("Institutions");
  - a filter sidebar: Search (name or email), Role (All / DEO / School Admin);
  - "N users found" and a cards/table toggle (cards by default), 12 per page, the web's 7-button pager;
  - a card: photo (40% width, `/deo-fallback.jpg` fallback), name, email, Active/Inactive pill, role chip, scope
    line, phone;
  - the table: User, Role (+ scope line), Last Login ("Never"), Status, Actions;
  - actions per user: **Activation URL** (only when `emailVerified === false`), **Assign** / **Re-assign** (when the
    user has a district or school), **Disable** (with the confirm modal) / **Enable** (immediate).
- **Data:** `GET /users/county/:countyId?includeInactive=true` and `GET /users/county/:countyId/stats`. Rows with role
  COUNTY_ADMIN, SUPER_ADMIN or MINISTRY_ADMIN are hidden client-side.
- **Writes:** `POST /users/with-activation`, `POST /users/bulk-create`, `PATCH /users/:id { isActive }`,
  `POST /users/:id/assign-district`, `POST /users/:id/assign-institution`, `GET /users/:id/activation-token`.
- **Create User:** a 3-step wizard (Basic Information → Role & Assignment → Review & Submit). The creatable roles are
  DEO and School Admin, with a school picker for School Admin. Errors are made friendly ("This email is already
  registered…"). On success it shows `ActivationTokenDisplay` (the link, Copy, back to the list).
- **Bulk Create:** a 3-step page (Upload CSV → Preview → Results), with a template download. Columns are
  `firstName,lastName,email,phoneNumber,role,districtId,institutionId`; ids are raw database ids. Results show the
  successes with their activation links, and the failures with the server's message.

### 2.1 What is broken (verified on Alvin's local database, 2026-10-19)

1. **School Admins are missing from the list.** The list and the stats only count user links (`user_organizations`)
   whose `countyId` is the county. But:
   - school registration (`institutions.service.ts`) creates the principal's link with only an `institutionId`;
   - the web's own Create User sends a School Admin with only `institutionId`, so it is stored without `countyId`
     too.
   Locally all 9 INSTITUTION_ADMIN links have no `countyId`. The page shows only DEOs, and **School Admins reads 0**.
   A School Admin appears only after someone presses Assign (assign-institution copies the school's `countyId`).
2. **Pending Activation is always about 0.** A new user is created with `isActive = false, emailVerified = false`,
   but the count requires `isActive = true`. The people it should count (created, not yet activated) are excluded.
3. **Total Users counts the County Admin** ("All roles") but the list hides them, so the card and "N users found"
   disagree.
4. **An unassigned-pool DEO shows as "Viewer".** The server only returns links in this county, a pool DEO's link has
   no county, so the web falls back to role VIEWER. Such a user drops out of the DEO filter.

### 2.2 Security holes in the endpoints this page calls (verified in code)

`canManageUser` and `canManageActivation` (`users.service.ts`) allow any COUNTY_ADMIN to act on **any user in the
country**, and nothing checks which roles a County Admin may create:

- `POST /users/with-activation` and `/users/bulk-create` accept **any role, SUPER_ADMIN included**, and return the
  activation token. A County Admin can create a super admin, then activate it themselves.
- `PATCH /users/:id`: can disable (or rename) any user, a ministry admin included.
- `GET /users/:id/activation-token`: can read any unactivated user's token nationwide, which is an account takeover.
- `assign-district` / `assign-institution`: any user, into any district or school.
- `GET /users/county/:countyId` (+ `/stats`): any county's list.

## 3. Decisions

- **[ALVIN] D1: fix the list on both sides** (recommended). Exact parity would show today's broken page on the
  desktop: DEOs only, School Admins = 0. The fix is section 5.1's membership rule and section 5.2's stats.
- **[ALVIN] D2: lock the endpoints** (recommended). This is the Teachers precedent, extended to the write endpoints
  (section 5.5). It only changes what a **County Admin** caller may do. Super and ministry admins keep today's
  behaviour, so the ministry portal's users page is unaffected.
- **[ALVIN] D3: Create User and Bulk Create are online-only** (recommended). The Schools page went offline (your
  2026-10-17 reversal), but a user is different: the page's whole result is the **activation link**, which only the
  server can issue. An offline queue would leave the admin with nothing to hand over until a sync. The buttons stay
  visible offline and are disabled with the usual offline hint.

## 4. Goals, non-goals, anti-goals

- **Goals:**
  - Desktop parity with the web's list, wizard and bulk page; the list and stats work offline.
  - Assign, Enable/Disable, Activation URL, Create and Bulk Create work online, with local truth pulled afterwards.
  - Real numbers on both sides (D1); a County Admin confined to their county and to administrator roles (D2).
- **Non-goals:**
  - A user detail page (the web has none).
  - Removing an assignment (the web's `removeUserAssignment` is not on this page).
  - Resend activation email, password reset, or editing names/phones.
  - DATA_OFFICER accounts on devices: the role is not a desktop role and is not synced.
  - The ministry portal's users page, and the INSTITUTION_ADMIN-can-read-any-activation-token hole (section 8).
- **Anti-goals:**
  - Any County Admin path to a SUPER_ADMIN, MINISTRY_ADMIN or COUNTY_ADMIN account, or to another county's users.
  - Showing a zero that is not a real count.
  - Shipping activation tokens or other secrets into the synced database.

## 5. How it works (my technical calls, for the builder)

Every item here is my call unless marked [ALVIN] or "web". The builder may change one if it keeps sections 3 and 4.

### 5.1 Who is on the list (D1, both sides)

- **Listed roles:** DEO and INSTITUTION_ADMIN only. The web's client-side exclusion leaves DATA_OFFICER/VIEWER/TEACHER
  in principle, but in practice no other role reaches the list (teachers' links carry no county, and DATA_OFFICER is
  not offered when creating). The Role filter offers only these two anyway.
- **A user is in the county** when they have an **active** link with one of those roles where any of these hold:
  - `link.countyId` = the county;
  - the link's institution is in the county (`institutions.countyId`);
  - the link's district is in the county (`districts.countyId`);
  - or it is an **unassigned-pool DEO** link (`role = DEO`, `countyId` null, `districtId` null), as the web does
    today.
- **The user's displayed role, district and school** come from that link (the first one by role DEO before
  INSTITUTION_ADMIN, then by id, when there are several). The web's `transformApiUserToManagementUser` picks the first
  active link; with this rule a pool DEO shows as **DEO**, not Viewer.
- **Scope line** (web): the school name for a school link, the district name for a district link, otherwise
  "County Level". The web shows `countyName || districtName || schoolName`, but the server never fills `countyName`
  for these rows, so this is what the web already renders.
- **"Assigned"** (Assign vs Re-assign) = the link has a district or a school (web).
- **Status pill:** Active when `users.isActive`, otherwise Inactive (web).
- **Search** (web): case-insensitive substring on first name, last name or email. **Role** filter: DEO /
  INSTITUTION_ADMIN.
- **Order:** `createdAt` descending (web), then `id` for stable paging. A missing `createdAt` sorts last.
- **Paging:** 12 per page, in SQL on the desktop (the web pages client-side).

### 5.2 Stats (D1, both sides), over exactly the list's users before search/role filtering

- **Total Users:** all of them, any status. Sub-line changes from "All roles" to **"DEOs and School Admins"**.
- **Active Users:** `isActive` and `lastLoginAt` within the last 30 days. Sub-line "Last 30 days" (web meaning kept).
- **Pending Activation:** `emailVerified = false`, any `isActive` (fixes 2.1-2). Sub-line "Not verified".
- **School Admins:** those whose listed role is INSTITUTION_ADMIN. Sub-line "Institutions".
- The desktop computes "30 days ago" from the device clock.

### 5.3 Data on the device (Nemis snapshot + desktop migration 037)

- The county device already receives every user it needs: school-level links (active, desktop roles) for every
  school in the county, every DEO link in the county (active and inactive), and the pool DEOs. User rows travel with
  their links and are never delta-filtered.
- **New:** `users.emailVerified`. The snapshot's `users` mapping adds `emailVerified: row.emailVerified`. Desktop
  migration 037 adds `users.emailVerified INTEGER` (nullable); `ProvisioningImporter`'s `users` spec gains the column.
  `users` has no outbox triggers, so nothing is pushed back.
- **NULL emailVerified** (a row from an older server, before the first pull after upgrade) counts as verified: it is not
  pending and has no Activation URL button. The migration does not force a resync; the next pull fills it, because user
  rows ship in full on every pull.
- **Release order: server first** (the desktop reads `emailVerified`; an old server leaves the column NULL, which
  degrades safely as above).

### 5.4 Online commands (desktop)

All follow `ipc/handlers/county/deo.ts`: `runOnline(gatewayCall, refresh)`, then a forced pull so the list shows local
truth. `refreshed: false` shows the existing SYNC_NOTE. The server's message is surfaced via `.remoteMessage`
(`toIpcError`). Disabled offline.

| Channel | Server call | Result to renderer |
|---|---|---|
| `county:set-user-active` | `PATCH /users/:id { isActive }` | `null` |
| `county:assign-user` | `POST /users/:id/assign-district` or `/assign-institution` `{ districtId \| institutionId, role }` | `null` |
| `county:get-activation-link` | `GET /users/:id/activation-token` | `{ activationUrl }` |
| `county:create-user` | `POST /users/with-activation` | `{ userId, activationUrl }` |
| `county:bulk-create-users` | `POST /users/bulk-create` | `{ succeeded: [{ email, name, activationUrl }], failed: [{ email, error }] }` |

- **The activation link comes from the server.** The web builds it from its own origin, which the desktop does not
  have. The server already knows `FRONTEND_URL` (`createUserWithActivation` uses it for the email). The server adds
  `activationUrl` (`${FRONTEND_URL}/activate?token=…`) beside `activationToken` in the with-activation, bulk-create and
  activation-token responses. The desktop shows only the URL. The web keeps building its own link, unchanged.
- **Tokens are never stored on the device:** not in SQLite and not in logs. The URL lives in renderer state only
  while its dialog is open.
- **Validators** (`validateIpc.ts`): ids are non-empty strings ≤ 64; `role` ∈ {DEO, INSTITUTION_ADMIN, DATA_OFFICER}
  (the web's Assign modal offers Data Officer); `isActive` boolean; bulk ≤ 500 rows (the existing IPC cap); names
  ≤ 100, email ≤ 255, phone matches the server's `^\+?[1-9]\d{1,14}$`.
- **Create payloads (desktop):**
  - School Admin sends `institutionId` **and the school's `countyId`**, so new links carry the county (D1 belt and
    braces; the server also fills it, see 5.5).
  - DEO sends `countyId`, no district (web).
  - Email is required (web).
- **Bulk Create (desktop):** a port of the web page, same CSV template and columns. Before sending, rows are checked
  offline against local data (as the school bulk import did):
  - the role is DEO or INSTITUTION_ADMIN;
  - a School Admin row's `institutionId` is a school in this county, and a `districtId` is a district in this county;
  - the email is valid and not repeated in the file.
  Bad rows are listed on the preview step and block Submit, so the admin fixes the file. The web's
  "Row N: Missing required fields" message is kept. CSV parsing is the web's simple comma split (ported as-is; no
  quoted fields).
- **Assign modal** (web): Assignment type District/Institution, role options per type (DEO/Data Officer;
  School Admin/Data Officer), district and school dropdowns from local SQLite (county districts; county schools of
  type SCHOOL, as the Schools list).

### 5.5 Server fixes (Nemis, D1 + D2)

- **A helper `countyUserScope(countyId)`** (users.service) builds the Prisma `where` for section 5.1's membership rule.
  `getUsersByCounty` (filters kept), `getCountyUserStats` and the D2 checks all use it.
- **`getUsersByCounty`:**
  - the membership rule;
  - `organizations` include returns the matching links with `institution { id, name, code, countyId }` and
    `district { id, name, code }`;
  - order `createdAt desc, id`.
  The web's Districts page calls this with `role=DEO`, and its result does not shrink.
- **`getCountyUserStats`:** returns `{ totalUsers, activeUsers, pendingActivation, usersByRole }` per 5.2.
  `usersByRole` holds DEO and INSTITUTION_ADMIN counts by the listed role. The shape is unchanged, so the web needs only
  the sub-line text.
- **portal-web `transformApiUserToManagementUser`:** pick the link by the 5.1 order (role DEO before
  INSTITUTION_ADMIN) instead of "first active". A pool DEO maps to DEO.
- **Creation fills the county:** `createUserWithActivation` sets the link's `countyId` (and `districtId`) from the
  institution when `institutionId` is given. School registration's principal link (`institutions.service.ts`) gets the
  school's `countyId` and `districtId` too. Existing rows need no backfill, because 5.1 also matches through the
  institution.
- **D2: County Admin confinement** (only when the caller's role is COUNTY_ADMIN and not SUPER/MINISTRY):
  - **list / stats:** `countyId` must be the caller's county, else 403 (the `ensureCountyAccess` rule).
  - **create / bulk-create:**
    - role must be DEO, INSTITUTION_ADMIN or DATA_OFFICER, else 403;
    - `countyId` is forced to the caller's county;
    - an `institutionId` or `districtId` must belong to it, else 403.
    In bulk, each refused row lands in `failed` with the message; the others still go through.
  - **PATCH `/users/:id`, activation-token, assign-district, assign-institution:**
    - the target user must be in the caller's county per 5.1 (pool DEOs included), else 403;
    - the target district or school must be in the caller's county;
    - PATCH from a County Admin may change only `isActive`; other fields are 403.
- Every 403 message is plain ("You can only manage users in your county.").

### 5.6 Layers (desktop, same shape as Teachers/Parents)

- **types:**
  - `CountyUsersQuery`, `CountyUserListItem`, `CountyUserStats`, `CountyUsersResult`;
  - the five command request/result types;
  - the IPC channel entries.
- **application:**
  - `ICountyUsersReadModel.listUsers(query)`;
  - `GetCountyUsersUseCase`, which adds the county name for the header;
  - `CountyApplicationService` method, port `countyUsers`, and an in-memory fake.
- **presentation:**
  - `CountyUsersViewModel` (list, filters, paging, the commands with pending/error state and refresh-after);
  - `CountyCreateUserViewModel` (wizard + bulk), with hooks.
- **electron:**
  - `SqliteCountyUsersReadModel` (wired in `createDataLayer`, composition, and the hand-listed `deferredApplication`
    keys in `main.ts`);
  - migration 037;
  - `BackendProvisioningGateway` methods for the five calls;
  - `ipc/handlers/county/users.ts`, validators, `authorizeChannel` (COUNTY_ADMIN), preload, bridge, facade.
- **renderer:**
  - `app/government/county/users/page.tsx` replaces the ComingSoon;
  - `users/create/page.tsx` and `users/create/bulk/page.tsx`;
  - `components/county/users/` for AssignUserModal, DisableUserModal and ActivationLinkDisplay (with copy to
    clipboard, as `PrincipalLoginCard` does);
  - photos via the existing `SchoolPhoto` with `fallback="/deo-fallback.jpg"` (add the asset if missing);
  - toggle aria-labels "Card view" / "Table view";
  - the web's `alert()` failures become the desktop's toast/error pattern.

## 6. Testing

- **Server (jest):**
  - list membership: a principal link with no `countyId`, a district-only legacy link, a pool DEO, and another
    county's user excluded;
  - each stat, including pending with `isActive = false`;
  - the role pick;
  - creation fills `countyId` (with-activation and school registration);
  - every D2 rule: 403 cases and the allowed case for a County Admin, plus unchanged behaviour for a ministry admin;
  - `activationUrl` in all three responses.
- **portal-web (vitest):** the transform's role pick (pool DEO → DEO) and the card sub-lines.
- **Desktop SQLite:**
  - membership (all four ways in, and inactive links and other roles out);
  - search, role filter, order, paging;
  - stats including the 30-day edge and NULL `emailVerified`;
  - migration 037 and the importer column.
- **Desktop IPC/gateway:** each command's request shape, `runOnline` offline refusal, `remoteMessage` passthrough,
  and the validators.
- **Renderer:**
  - list parity (cards, table, filters, toggle, pager, button visibility rules);
  - the disable confirm and immediate enable;
  - the activation dialog;
  - the wizard steps and error text;
  - bulk preview validation and results.

## 7. Release

- **Server first** (D2 is server-only; `emailVerified` and `activationUrl` come from the server).
- **Older desktops in the field are unaffected:** they have no users page yet.
- **Effect on the web:** the D2 locks change it only for County Admins acting outside their county or creating
  higher roles.

## 8. Known risks and open points

- **Staleness:** a School Admin link deactivated elsewhere stays active on the device until the 24 h full resync
  (school-level links ship active-only and merge never deletes). This is the same class as the deferred pool-DEO
  minor. The forced pull after this page's own commands covers its own writes, except Disable/Enable, which are
  user-row changes and do ship.
- **Not in this project:** `canManageActivation` also lets an INSTITUTION_ADMIN read any user's activation token
  nationwide. Recorded here to raise separately.
- **Data Officer:** assigning someone Data Officer works on the server, but devices never see that role, so on the
  desktop list the user keeps showing their DEO/School Admin link (or drops off if they had none).
- **Shared default password:** irrelevant here. Activation users set their own password on activation.
