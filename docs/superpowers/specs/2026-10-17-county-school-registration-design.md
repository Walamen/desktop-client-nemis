# County Admin: register schools offline (Create School + Bulk Import)

Date: 2026-10-17. Repos: `desktop-client-nemis` (most of the work) and `Nemis` (server change, ships first).
Branches: `feat/county-school-registration` in both.

This is Schools sub-projects 3 (create) and 4 (bulk import) of the County Admin migration, done together
because they share one new piece of machinery. Sub-project 2 (approvals queue) is still to come.

## 1. Intent

County Admins register schools out in the field, often with no signal. Today the desktop's
`/government/county/schools/create` and `/bulk-import` routes are ComingSoon placeholders, and every server
write in the County port so far has been online-only. Alvin wants these two pages to be exact copies of
portal-web's (`Nemis/apps/portal-web/src/app/government/county/schools/create/page.tsx`, 1435 lines, and
`…/bulk-import/page.tsx`, 896 lines) **and to work offline**: the admin fills the form or uploads the
spreadsheet with no connection, the school is kept on the device, and it goes to the server when the device
is back online.

The hard part is the principal's login. On the web, the server creates the school and the principal's account
together and hands back the login (email + starting password), which the page shows in a pop-up. Offline,
none of that exists yet. So the desktop has to keep the waiting school visible, send it later, cope with the
server refusing it, and give the admin the principal's login once it exists.

## 2. What the County Admin sees (decided by Alvin)

Alvin approved this behaviour on 2026-10-17:

**Saving a school (create form).** The same seven steps as portal-web.
- Offline: on Save, instead of the login pop-up they see *"Saved on this device. It will be sent when you're back
  online."*, then they go back to the Schools list.
- Online: it saves the same way but sends straight away. If the server accepts it within a few seconds they get
  the same principal-login pop-up as the web. Online use still feels like portal-web; offline goes through the
  same path.

**While it waits.**
- The school appears in the Schools list at once, with an amber **"Waiting to sync"** badge.
- Its detail page shows what they entered. Figures only the server knows (student count, staff count) show 0.
- It is counted on the existing Pending changes page and in the status-bar count, like every other unsent change.

**When it syncs.**
- Accepted: the badge goes, and a notice says e.g. *"3 schools added: principal logins are ready."*
- Each such school's detail page gets a **Principal Login** card: the principal's email and starting password,
  each with a copy button. The County Admin can open it any time to pass the login on.
  The starting password is the shared default Alvin keeps on purpose during internal testing, so keeping it on
  the device reveals nothing new. **When real per-account passwords arrive, this card must go.**
- Refused: the badge turns red, **"Couldn't be added"**, with the server's reason (e.g. "Principal email already
  in use"), and two buttons:
  - **Fix and resend**: reopens the create form already filled in.
  - **Discard**: removes the school from this device.

**Bulk import.**
- Same as the web up to Save: template download, upload, review, fix rows, add rows. All of that already runs on
  the device (SheetJS), so it works offline.
- On Save each valid row becomes a waiting school; the last step says *"12 schools saved; they'll be sent when
  you're back online."*
- After that, each school behaves exactly like one created on the form: same badges, same refused handling,
  same Principal Login card.

## 3. Goals, non-goals, anti-goals

**Goals**
- Desktop create page and bulk-import page that look and behave like portal-web's, including every field,
  step, validation rule, template column and copy.
- Both work with no connection. Nothing the admin saved is lost.
- The server ends up with exactly the school the web would have created from the same input, with the principal
  account auto-activated, exactly as `InstitutionsService.create` does today.
- The admin can always get the principal's login after the school is accepted.

**Non-goals**
- Editing or discarding a school while it is still waiting (amber). Only refused (red) schools can be fixed or
  discarded. *(My call: keeps the send path simple — a waiting school may already be in flight. Revisit if
  admins ask.)*
- The approvals queue (sub-project 2), school photos, inspections.
- Changing portal-web's behaviour or look.
- The activation-email flow: county-created schools always auto-activate the principal, as on the web.

**Anti-goals (would be a failure even if it technically works)**
- A saved school vanishing: after a crash, a restart, a sign-out/sign-in, the 24-hour full resync, or a refusal.
- The same school created twice on the server because a send was retried after a lost response.
- A school shown as added when the server actually refused it, or a refusal nobody can see.
- One refused school blocking the others, or blocking the rest of the device's sync.
- A school or login from another county or another user's session showing on this device.

## 4. Constraints

- Alvin's standing County-migration choices: compute offline from local SQLite; full hexagonal path
  (types → application port/use case → presentation ViewModel → SQLite adapter / main-process service →
  IPC + preload + bridge → renderer hooks); detail routes use `?id=` (static export); port web quirks as-is
  except fake hard-coded fallbacks; server ships first.
- Next 15 static export (`output: 'export'`); no dynamic routes.
- `institutions` is **not** an outbox table and must not become one (school-admin devices also hold it).
- A full import (`ProvisioningImporter` without `merge`) runs `DELETE FROM` every snapshot table, and
  `verifyDatabase` checks row counts against the snapshot. So anything that must survive cannot live in
  `institutions` until the server has it.
- Server `ValidationPipe` uses `whitelist + forbidNonWhitelisted`: an older server answers 400 to any new field
  the desktop sends. That is why the server must ship first.
- SQLite tests run under Electron-as-Node:
  `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe ./node_modules/vitest/vitest.mjs run <paths>`.
  Server tests: `npx jest` in `Nemis/apps/Server`.
- Known pre-existing desktop failures (not ours): `renderer/app/page.test.tsx`, `renderer/app/government/teacher/timetable/timetable.test.tsx`.

## 5. How it works (my technical calls, for the builder)

Every item in this section is my call, not something Alvin chose. The builder may change an item if it keeps the
behaviour in §2 and the anti-goals in §3.

### 5.1 Local storage: a `school_registrations` table (desktop migration 034)

A waiting school lives in its own table, never in `institutions`, following the `grade_completions` precedent
(migration 029: own table, no outbox triggers, the importer never deletes pending/rejected rows):

| column | meaning |
|---|---|
| `id` TEXT PK | Client-minted UUID. **Becomes the institution's server id** (see 5.3), so the school arrives in `institutions` with the same id on the next pull. |
| `countyId` TEXT NOT NULL | The county it was registered under. |
| `createdBy` TEXT NOT NULL | Signed-in user id at save time. |
| `source` TEXT | `'form'` or `'bulk'`. |
| `payload` TEXT NOT NULL | JSON: exactly the body portal-web would `POST /institutions` (same field mapping as the web's `submitSchool` / bulk `handleSubmit`), minus anything the server derives. |
| `syncState` TEXT NOT NULL | `'pending' \| 'synced' \| 'rejected'`. |
| `syncError` TEXT | Server's refusal message for `rejected`. |
| `principalEmail` TEXT, `principalPassword` TEXT | Filled from the server's answer on acceptance (`adminActivations` entry with `autoActivated`). |
| `createdAt`, `updatedAt`, `syncedAt` TEXT | |

- The importer never reads or touches this table. A forced re-provision must not delete it either. Check
  `ProvisioningService.start()` and every place that wipes local data. The table sits in the encrypted
  (SQLCipher) database like everything else.
- Isolation: every read and every push filters on `createdBy = signed-in user` and `countyId = the user's
  county`.
- `synced` rows are kept: they carry the Principal Login card. They are never re-sent.

### 5.2 Sending: a dedicated push service, not the generic sync queue

`SchoolRegistrationSyncService` in `apps/desktop/electron/sync/`, shaped like `GradeCompletionSyncService`:
- `DesktopSyncWorker` runs it every cycle, like the assignment, fee-reversal and grade-completion paths. A
  pending registration keeps an otherwise idle cycle alive, the same way `reversalPending` and
  `completionPending` do.
- It never throws; a failure must not abort the worker cycle.
- It sends one request per pending row, oldest first, through a new `BackendProvisioningGateway` method.
- The outcome of each request:
  - **2xx:** mark the row `synced` and store the principal credential from the answer. Then force a delta pull
    so the real institution row arrives (the same forced-pull idea as `runOnline`).
  - **`RemoteRejectedError` (4xx):** mark the row `rejected` with `error.remoteMessage` (fallback text if empty).
    The other rows carry on.
  - **Network error or 5xx:** leave the row `pending` for the next cycle.

Why not the generic queue: `institutions` has no outbox triggers, and adding them would capture school-admin
edits too. A refusal needs Fix/Discard on the school itself, not an entry in the Sync Conflicts screen. And the
credential in the answer needs a home.

Pending changes page and status bar: add a fifth source, `SchoolRegistrationPendingSource`, next to the four in
`electron/sync/pending/`. Pending rows count as "pending". Rejected rows count in the failed count, as rejected
grade completions do.

### 5.3 Server: let the existing create endpoint take the school's id, idempotently (Nemis, ships first)

The desktop calls the **same `POST /institutions` the web calls**, so the server applies one set of rules to
both. Changes:

1. **Optional `id`.** `CreateInstitutionDto` gains an optional `id` (`@IsOptional() @IsUUID()`). When present,
   the institution is created with that id. The web does not send it, so the web is unchanged.
2. **Safe retries.** If an institution with that `id` already exists, is in the caller's county, and the request
   is otherwise the same school, answer 201 with the existing school. Include an `adminActivations` entry for its
   linked INSTITUTION_ADMIN (`{autoActivated: true, email, defaultPassword}`) instead of creating anything. The
   builder decides what "the same school" means, e.g. same code and same admin email. If the id exists with
   different content, or in another county, answer 409. This covers a lost response followed by a retry.
3. **All or nothing.** `create()` currently writes the institution, then levels, then the admin user, then
   deletes the institution by hand if the email pre-check fails. The admin step does not take a transaction
   (`createAdminUser` uses `this.prisma`). Wrap the whole create, including the admin-user creation, in one
   `prisma.$transaction` so that any refusal leaves nothing behind. Behaviour for the web must stay identical
   apart from this.
4. **Community / Town (decided by Alvin, 2026-10-17).** `CreateInstitutionDto` has no `communityTown`, so with
   `forbidNonWhitelisted` the server refuses the whole school whenever the admin fills that field. That breaks
   the web today too. Add `communityTown` (`@IsOptional() @IsString()`) to the DTO and store it in `create`.
   The `Institution` model already has the column and the snapshot already ships it. This fixes the web as well.
5. `bulkCreate` is untouched. The desktop sends each registration through `create`, because each row is its own
   waiting school.

Server tests (jest):
- create with an id → institution has that id;
- a replay of the same id + body → 201 with no second row and the same credential;
- the same id with a different body, or another county → 409;
- an admin-email conflict leaves no institution, no level rows and no user behind;
- the existing web-shaped create still passes unchanged;
- a create with `communityTown` is accepted and stores it.

**Release order:** server first. A desktop talking to an older server gets a 400 on the unknown `id`, which this
design would show as a red "Couldn't be added" with the server's text. Acceptable for the short gap. Note it in
the release notes.

### 5.4 Create page (renderer)

- Port `create/page.tsx` as-is: the seven `STEPS`, `SchoolFormData`, `GenderRow`, the classes, copy, step
  validation (`isStep1Valid`, `isStep2Valid`), and the payload mapping in `submitSchool`, including the
  `principalName` → first/last split and `metadata.enrollmentStats` / `teacherStats`.
- Districts come from local `districts` (the county's active ones), and the county code from local `counties`.
- The school code uses the web formula at save time: `${county.code || "XX"}-${emisCode.slice(-4) || Date.now().toString().slice(-6)}`.
- The phone field uses `react-phone-number-input`, as on the web. That means a new desktop dependency, with
  **bundled flags** (the package loads flag images from a CDN by default, which the CSP blocks and which fails
  offline). Note: portal-web collects `phone` in step 2 but never sends it. Port that quirk as-is.
- `communityTown` is sent as on the web; the server now stores it (5.3 item 4).
- **Extra checks at save time (decided by Alvin, 2026-10-17).** Offline, a refusal only shows up days later, so
  the desktop catches what it can before saving, even where the web doesn't. These checks are desktop-only:
  - **Server-side rules:** go through `CreateInstitutionDto` and `AdminUserDto` (`Nemis/apps/Server/src/institutions/dto/`)
    and mirror every validator the form's input can break. Example: the principal email must pass the same
    `@IsEmail()` rule (the web only checks it is non-empty).
  - **Duplicate code:** "This school code already exists" when the generated code matches a local
    `institutions` row or another non-rejected registration. Name the existing school in the message. Codes are
    prefixed with the county code, so the county's own schools (all on the device) are the ones that can clash.
    Only schools created on the web since the last pull escape this check.

  Errors show inline in the web's style, on the step that owns the field. The same checks apply to bulk rows
  through `validateRow`, which already checks email format with its own regex. Swap that regex for the
  server-equivalent check.
- **Saving**:
  1. Write the `school_registrations` row (`pending`) through a command, then trigger a sync cycle.
  2. If offline, show the "Saved on this device…" message straight away and go to the list.
  3. If online, wait up to ~5 s for the row to leave `pending`:
     - **Synced:** show the web's `showCredentials` pop-up (`@nemis-desktop/ui` already exports it), then go to
       the list.
     - **Rejected:** show the web's `showError(message, "Registration Failed")`, keep the form as it is, and
       delete that registration row, because the admin is fixing it right there.
     - **Still pending:** show the "Saved on this device…" message and go to the list.
- **Fix and resend** opens `create/?registration=<id>`, prefilled from the row's payload. For a bulk row only its
  fields are filled; the rest stay at form defaults. Saving updates the same row back to `pending`. The id is
  unchanged.
  - *(My call)* **The code is regenerated with a random 5-character ending** (the bulk formula). The form's
    formula would rebuild the same code from the EMIS code. The red badge still names the clashing code, so the
    admin can spot a real duplicate before resending.
  - *(My call)* **Saving a bulk row rebuilds the payload with the form mapping.** It keeps any payload field the
    form does not show (e.g. bulk `metadata.phone`, `metadata.principalName`). It does not add enrollment or
    teacher stats unless the admin entered some.

### 5.5 Bulk import page (renderer)

- Port `bulk-import/page.tsx` as-is: `BulkRow`, `validateRow`, `parseLevels`, the 10 template headers, the
  example row (skipped on upload when its name starts with "example"), the Districts and Reference sheets, the
  review table with inline editing, Add Row, `CopyButton`, and the code formula
  (`${county.code ?? "XX"}-<5 random chars>`).
- Import:
  1. Write one `pending` registration per valid row (one transaction), then trigger a sync.
  2. Offline: the done step says *"N schools saved; they'll be sent when you're back online."*
  3. Online: wait until every new row has left `pending`, up to a cap (my call: ~30 s). Then show the web's done
     step (Submitted / Created / Failed, the Admin Login Credentials table, Failed Schools) for the rows that
     settled. Add a line for any still waiting.
     - **Retry Failed Rows:** works as on the web. Rows refused during the wait go back to review, and their
       registrations are deleted.

### 5.6 List, detail, and notices

- `SqliteCountySchoolsReadModel` (sub-project 1) merges the county user's `pending` and `rejected` registrations
  into `listActiveSchools()`, plus `synced` ones whose institution row has not arrived yet. Fields come from the
  payload. A new `syncState` on `CountySchoolListItem` drives the badge: amber "Waiting to sync", red "Couldn't
  be added" with the reason. Once the institution row exists locally, the institution wins and no badge shows.
- *(My call)* Waiting and refused schools appear **only** in the Schools list and detail. The County dashboard and
  Districts totals keep showing the server's figures until the school syncs.
- `getSchool(id)` falls back to the registration when no institution row exists. The detail page shows the badge,
  the reason and the Fix and resend / Discard buttons for refused ones, and the **Principal Login** card whenever
  a `synced` registration with a credential exists for that id.
- **Discard** asks for confirmation (`showConfirm`), then deletes the registration row.
- **Notice:** when a background sync (not the online wait in 5.4/5.5) moves registrations to `synced`, show one
  toast: "N school(s) added: principal logins are ready." When it moves them to `rejected`, show one toast:
  "N school(s) couldn't be added". The renderer listens the way `useRevalidateOnSync` already does. The builder
  picks the exact mechanism.

### 5.7 Layers (hexagonal path)

- **types:** `SchoolRegistration`, `SchoolRegistrationInput` (the payload), `syncState` on the list/detail types.
- **application:** port `ISchoolRegistrationStore`, with use cases:
  - `RegisterSchools` (one or many; mints ids and codes);
  - `ResendSchoolRegistration`, `DiscardSchoolRegistration`;
  - `GetSchoolRegistration` (prefill, credential);
  - `AwaitSchoolRegistrations(ids, timeoutMs)`, or the builder's equivalent for the online wait.
- **presentation:** ViewModels for the create and bulk pages, and the detail ViewModel extended with the
  registration.
- **electron:** the SQLite adapter, the push service, the gateway method, the pending source, and IPC channels
  added to `COUNTY_ADMIN_CHANNELS`, plus preload, bridge, `lib/ipc` facade and hooks. Remember
  `electron/main/main.ts` `deferredApplication` needs a line for any new application service.

## 6. Testing

- **Server:** the jest cases in 5.3.
- **Desktop SQLite (Electron runner):**
  - migration 034;
  - the store adapter (isolation filters, prefill, resend keeps id and changes code, discard);
  - the full import does not touch registrations;
  - the read-model merge (each state, institution wins once present).
- **Push service (fake gateway):**
  - 2xx → synced + credential + pull requested;
  - 4xx → rejected with `remoteMessage`;
  - 5xx/network → still pending;
  - one rejection does not stop the next row;
  - another user's or county's rows are never sent.
- **Worker:** a pending registration keeps an idle cycle alive.
- **Pending source:** pending rows are counted; rejected rows go to failed.
- **Renderer:**
  - the create steps and their validation;
  - the payload mapping matches the web's;
  - the desktop-only save checks (server-equivalent email rule, duplicate code against local schools and
    registrations) on both pages;
  - Fix and resend of a bulk row keeps its bulk-only fields and gets a new random code;
  - the online-wait outcomes (pure decision function, given the RTL `act()` lesson from sub-project 1);
  - the bulk template headers, parse, validation and done step;
  - the list badges;
  - the detail Principal Login card and refused-school buttons.

## 7. Build order

One plan, two stages. Each stage ends green and reviewed.
1. **Server change, then create:** server (5.3) → migration + store + push service + pending source → create page
   → list/detail badges, Principal Login card, Fix/Discard, notices.
2. **Bulk import:** on top of stage 1's machinery.

## 8. Known risks and open points

- **Server quirk:** if the principal's email already belongs to a user who is not a school admin anywhere and
  already has a password, `createAdminUser` links them but still returns `defaultPassword`. The pop-up (web) and
  the Principal Login card (desktop) would then show a password that is not theirs. This is a web quirk; ported
  as-is unless Alvin says otherwise.
- **Code collisions:** the web formula can collide (e.g. two schools with the same last-4 EMIS digits). The
  save-time check (5.4) catches clashes with schools already on the device. A clash with a school created on the
  web since the last pull is refused by the server ("Institution with this code already exists"), and Fix and
  resend picks a random code.
- **Duplicate emails in one spreadsheet:** the web does not check for these. The second school is refused by the
  server. Ported as-is.
