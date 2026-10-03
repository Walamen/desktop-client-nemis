# NEMIS ID Desktop Parity — Stage 4 (Transfers Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop's read-only transfers list with portal-web's C3 inbox — tabs by who asked, lapse-aware status, online Approve/Reject/Release/Cancel/Complete/Withdraw/New transfer — readable offline from local rows, plus a sidebar badge counting decisions this school owes.

**Architecture:** The server snapshot adds four display fields to each transfer row (student name + NEMIS ID, both school names); the desktop stores them (migration 028). A pure `renderer/lib/transfers.ts` module derives tabs, pending counts and the per-row action matrix from local rows and the workspace institution id; `isLapsed` lives in `@nemis-desktop/shared`, mirroring the server exactly. The inbox page reads local rows (offline-viewable) and every action goes through Stage 2's online `transferBridge` / `registryBridge`, followed by a local reload. A new online school search feeds "New transfer".

**Tech Stack:** NestJS + Prisma + Jest (`Nemis/apps/Server`, Task 1); Electron + better-sqlite3 + Vitest + React Testing Library (desktop).

**Spec:** `docs/superpowers/specs/2026-10-02-nemis-id-desktop-parity-design.md` — §5.1 (transfers pull-only), §8 (Stage 4), §11 (known limits).

## Global Constraints

- Desktop branch: `nemis-id-desktop-parity-stage-4` (already created from `main` @ `1223527`; its first commit is this plan). Server branch (Task 1): create `nemis-id-desktop-parity-stage-4` in `Nemis` from `main` @ `99bd2306`. Server dir on disk is `apps/Server` (capital S). Never commit to `main`.
- Tabs, verbatim: `Requests to us`, `Our requests`, `History`.
- `isLapsed` must equal the server's: `status === 'PENDING' && initiatedBy === 'RECEIVING_SCHOOL' && lapsesAt !== null && Date.parse(lapsesAt) < now` (strictly less — equal to now is NOT lapsed).
- The status chip checks lapsed **before** status; a lapsed row reads `Lapsed — ready to complete` (ours) or `Lapsed` (theirs), never `Approved`.
- A lapsed row is never counted as a pending decision.
- Transfers stay pull-only: no local writes to `student_transfers`; every action is an online command, and the UI reloads local rows afterwards (D5). If the command's `refreshed` is false, say the change "will appear once this device syncs".
- Snapshot enrichment is built field by field — exactly `studentName`, `studentNemisId`, `fromInstitutionName`, `toInstitutionName`; never spread a related row.
- Remove the Stage 1 notice `Review transfers on the web portal.` from the school-admin page (the DEO page keeps its generic read-only list).
- The user's Electron app is usually running and locks `node_modules/better-sqlite3/build/Release/better_sqlite3.node`; never kill it. For SQLite tests: rename the locked file aside, `pnpm rebuild:node`, test, restore the original (2281472 bytes, Jun 18 09:16).
- Desktop: `pnpm vitest run <path>`, `pnpm typecheck`, `pnpm lint` (6 pre-existing errors). Server: from `Nemis/apps/Server`, `npx jest <path>`, `npx tsc --noEmit`. Known failures: desktop `renderer/app/page.test.tsx` (+ occasionally `teacher/timetable/timetable.test.tsx`); server `desktop-provisioning.service.spec.ts` "includes every district…", rarely `nemis-id.spec.ts` (timing).
- `noUncheckedIndexedAccess` on; CRLF line endings kept. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Scope rulings (decided while planning)

- **New online school search (Task 3).** "New transfer" needs a destination school, and the desktop only stores its own institution. portal-web uses `GET /institutions?search=…&approvalStatus=APPROVED&isActive=true`; the desktop gets the same through a new online channel `transfer:search-schools` (≥ 2 characters, read-only, no refresh).
- **Complete re-asks the date of birth.** A lapsed pull is for a child still at the other school, so their date of birth is not on this device; the claim needs it. Same as portal-web.
- **Approve sends class/term only when the row has none stored** (`needsPlacement`): a receiving-initiated row already carries the requester's class and term, and the server prefers those (portal-web's rule).
- **The badge refreshes on sync and after any transfer command** via a tiny in-renderer change signal (`notifyTransfersChanged`) — no polling, no server calls.
- **List cap.** The generic school-admin list returns at most 250 rows (newest first); History beyond that is truncated. Recorded, not fixed.

## Review Focus

1. **The device's clock is ahead of or behind the server** — a row the desktop shows as lapsed may still be reviewable on the server (or vice versa); pressing Complete/Approve must surface the server's refusal text, not crash or silently do nothing (Task 5 test "server refusal is shown").
2. **A transfer row from an older server without the four display fields** — the inbox must still render (fall back to the student id / school id), not show `undefined` or throw (Task 2 importer test + Task 5 test "missing display fields").
3. **Approving a pull request whose stored term is from an expired academic year** (spec §11) — the server 404s; the row must show that message and stay actionable (Task 5 test "server refusal is shown" covers the mechanism).
4. **Offline** — the inbox and badge still render from local rows; every action button is disabled with the offline hint, and the school search is not called (Task 5 test "offline").
5. **A transfer row involving neither our school** (should never arrive, but a DEO-scoped desktop has many) — the split must not throw or misfile; rows where we are neither from nor to are ignored (Task 4 test).

---

### Task 1: Server — enrich snapshot transfer rows with display fields

**Repo:** `C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis`.

**Files:**
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (`tx.studentTransfer.findMany` ~line 367; `studentTransfers: studentTransfers.map(jsonRow)` ~line 735)
- Test: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`

**Interfaces:**
- Produces: every snapshot `studentTransfers` row additionally carries `studentName: string`, `studentNemisId: string | null`, `fromInstitutionName: string | null`, `toInstitutionName: string | null`.

- [ ] **Step 1: Branch** — `cd "C:/Users/Alvin Dogba Jr/Desktop/Walamen/Nemis" && git switch -c nemis-id-desktop-parity-stage-4`

- [ ] **Step 2: Failing test** — in the spec, following the existing snapshot tests' Prisma-mock style (find the test that stubs `studentTransfer.findMany`, or the Stage 3 C1 test that asserts where-clauses), add:

```ts
  it("adds exactly four display fields to each transfer row, built field by field", async () => {
    // Arrange the snapshot with one transfer whose findMany result includes the
    // relations the service now requests:
    const transferRow = {
      id: "t-1", studentId: "s-1", fromInstitutionId: "school-2", toInstitutionId: "school-1",
      requestedBy: "u-2", reason: "Relocation", status: "PENDING", initiatedBy: "ORIGIN_SCHOOL",
      lapsesAt: null, classId: null, termId: null, reviewedBy: null, reviewedAt: null,
      reviewNotes: null, requestedDate: null, toGradeLevel: "GRADE_7",
      createdAt: new Date("2026-09-01T00:00:00.000Z"), updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      student: { firstName: "Musu", lastName: "Kollie", nemisId: "482915736045", phoneNumber: "should-not-leak" },
      fromInstitution: { name: "Other School", code: "should-not-leak" },
      toInstitution: { name: "Our School", code: "should-not-leak" },
    };
    // ...wire it into the mocked tx.studentTransfer.findMany used by the snapshot builder...
    // ...build the snapshot via the same entry point the other tests use...
    const row = snapshot.data.studentTransfers[0];
    expect(row).toMatchObject({
      id: "t-1",
      studentName: "Musu Kollie",
      studentNemisId: "482915736045",
      fromInstitutionName: "Other School",
      toInstitutionName: "Our School",
    });
    expect(row).not.toHaveProperty("student");
    expect(row).not.toHaveProperty("fromInstitution");
    expect(row).not.toHaveProperty("toInstitution");
    expect(JSON.stringify(row)).not.toContain("should-not-leak");
    // and the query asked only for the needed relation fields:
    expect(tx.studentTransfer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        student: { select: { firstName: true, lastName: true, nemisId: true } },
        fromInstitution: { select: { name: true } },
        toInstitution: { select: { name: true } },
      },
    }));
  });
```

Write the elided arrangement lines concretely using the spec file's existing helpers (read the neighbouring snapshot tests first).

- [ ] **Step 3: Run to verify it fails** — `cd apps/Server && npx jest src/desktop-provisioning/desktop-provisioning.service.spec.ts -t "display fields"` → FAIL.

- [ ] **Step 4: Implement** — add to the `studentTransfer.findMany` call:

```ts
            include: {
              student: { select: { firstName: true, lastName: true, nemisId: true } },
              fromInstitution: { select: { name: true } },
              toInstitution: { select: { name: true } },
            },
```

and replace `studentTransfers: studentTransfers.map(jsonRow),` with:

```ts
          // NEMIS ID desktop parity §8.1: four display fields, built field by
          // field so no other student or institution data rides along. This
          // school is party to every row it receives, and a request already
          // discloses the origin school (C1), so nothing new is disclosed.
          studentTransfers: studentTransfers.map(
            ({ student, fromInstitution, toInstitution, ...row }) => ({
              ...jsonRow(row),
              studentName: `${student.firstName} ${student.lastName}`,
              studentNemisId: student.nemisId ?? null,
              fromInstitutionName: fromInstitution?.name ?? null,
              toInstitutionName: toInstitution?.name ?? null,
            }),
          ),
```

Check whether the snapshot's manifest/checksum or a `ProvisioningData` type on the server enumerates transfer columns — if so, extend it consistently.

- [ ] **Step 5: Run, typecheck, commit** — `npx jest src/desktop-provisioning && npx tsc --noEmit` (only the known district failure). Commit `feat(desktop-provisioning): add display names to snapshot transfer rows`.

---

### Task 2: Desktop — store the display fields (migration 028)

**Files:**
- Create: `apps/desktop/electron/database/migrations/028-add-transfer-display-fields.ts` (+ `.test.ts`)
- Modify: `apps/desktop/electron/database/migrations/registry.ts`
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts` (`studentTransfers` spec)
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts`

**Interfaces:**
- Produces: local `student_transfers` columns `studentName TEXT`, `studentNemisId TEXT`, `fromInstitutionName TEXT`, `toInstitutionName TEXT` (nullable; no triggers — the table is pull-only since migration 025).

- [ ] **Step 1: Failing tests**

Migration test (copy the `migrated()` helper from `027-add-student-asserted-no-nemis-id.test.ts`):

```ts
  it('adds the four display columns and installs no outbox triggers', () => {
    const db = migrated();
    const columns = (db.prepare(`PRAGMA table_info("student_transfers")`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['studentName', 'studentNemisId', 'fromInstitutionName', 'toInstitutionName']));
    expect(db.prepare(`SELECT count(*) c FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbox_student_transfers%'`).get()).toEqual({ c: 0 });
    db.close();
  });
```

Importer test (in `ProvisioningImporter.test.ts`, using the existing `transferRow()` helper):

```ts
  it('imports the transfer display fields, and an older server row without them as nulls', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf({
      ...BASE_DATA,
      studentTransfers: [
        transferRow('t1', { studentName: 'Musu Kollie', studentNemisId: '482915736045', fromInstitutionName: 'Other', toInstitutionName: 'Ours' }),
        transferRow('t2'),
      ],
    }), CONTEXT);
    expect(manager.connection.prepare(
      `SELECT id, studentName, studentNemisId, fromInstitutionName, toInstitutionName FROM student_transfers ORDER BY id`,
    ).all()).toEqual([
      { id: 't1', studentName: 'Musu Kollie', studentNemisId: '482915736045', fromInstitutionName: 'Other', toInstitutionName: 'Ours' },
      { id: 't2', studentName: null, studentNemisId: null, fromInstitutionName: null, toInstitutionName: null },
    ]);
  });
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

```ts
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/** Display fields the server now ships on each transfer row (NEMIS ID desktop
 * parity spec §8.1), so the inbox can show who and where while offline. The
 * table is pull-only (migration 025): no outbox triggers to regenerate. */
export const addTransferDisplayFields: Migration = {
  version: 28,
  name: 'add-transfer-display-fields',
  up(db: SqliteDatabase): void {
    db.exec(`
      ALTER TABLE student_transfers ADD COLUMN studentName TEXT;
      ALTER TABLE student_transfers ADD COLUMN studentNemisId TEXT;
      ALTER TABLE student_transfers ADD COLUMN fromInstitutionName TEXT;
      ALTER TABLE student_transfers ADD COLUMN toInstitutionName TEXT;
    `);
  },
};
```

Register after migration 027. Add the four names to the `studentTransfers` column spec in `ProvisioningImporter.ts` (before `createdAt`). Absent keys already import as `NULL`.

- [ ] **Step 4: Run** `apps/desktop/electron/database apps/desktop/electron/provisioning` + typecheck → PASS. **Commit** `feat(transfers): store transfer display fields locally`.

---

### Task 3: Online school search for "New transfer"

**Files:**
- Modify: `packages/types/src/registry.ts` (`SchoolSearchResult`), `packages/types/src/ipc.ts`, `packages/types/src/api.ts` (`TransferApi.searchSchools`)
- Modify: `apps/desktop/electron/provisioning/BackendProvisioningGateway.ts` (`searchSchools`)
- Modify: `apps/desktop/electron/security/validateIpc.ts` (`assertSchoolSearchArgs`)
- Modify: `apps/desktop/electron/ipc/handlers/school-admin/transfers.ts`, `apps/desktop/electron/ipc/authorizeChannel.ts`
- Modify: `apps/desktop/electron/preload/school-admin/transfer-api.ts`, `apps/desktop/renderer/services/nemis-bridge/school-admin/transfer-bridge.ts`
- Test: `BackendProvisioningGateway.test.ts`, `handlers/school-admin/online-commands.test.ts`, `authorizeChannel.test.ts`

**Interfaces:**
- Produces: `SchoolSearchResult { id: string; name: string; code: string }`; channel `IpcChannels.TRANSFER_SEARCH_SCHOOLS = 'transfer:search-schools'` → `{ args: [query: string]; result: SchoolSearchResult[] }` (INSTITUTION_ADMIN only); `BackendProvisioningGateway.searchSchools(query): Promise<SchoolSearchResult[]>`; `transferBridge.searchSchools(query)`.

- [ ] **Step 1: Failing tests**

Gateway (inside `describe('online commands')`):

```ts
    it('searchSchools GETs approved, active institutions and keeps only id/name/code', async () => {
      const fetchMock = vi.fn(async () => response([
        { id: 'i1', name: 'Central High', code: 'CH', countyId: 'should-not-leak' },
        { id: 7, name: 'bad row' },
      ]));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().searchSchools('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url.pathname).toBe('/institutions');
      expect(url.searchParams.get('search')).toBe('cent');
      expect(url.searchParams.get('approvalStatus')).toBe('APPROVED');
      expect(url.searchParams.get('isActive')).toBe('true');
      expect(init.method ?? 'GET').toBe('GET');
    });

    it('searchSchools accepts a paginated { data: [...] } envelope too', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ data: [{ id: 'i1', name: 'Central High', code: 'CH' }], meta: {} })));
      expect(await buildGateway().searchSchools('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
    });
```

Handler (`online-commands.test.ts`, extend `transferGateway()` with `searchSchools: vi.fn(async () => [{ id: 'i1', name: 'Central High', code: 'CH' }])`):

```ts
  it('search-schools validates the query (2..100 chars) and does not refresh', async () => {
    const { calls, handle } = capture();
    const gateway = transferGateway();
    const refresh = vi.fn(async () => true);
    registerTransferHandlers(handle, gateway, refresh);
    const search = calls.get('transfer:search-schools')!;
    expect(() => search.validate(['ce'])).not.toThrow();
    expect(() => search.validate(['c'])).toThrow();
    expect(() => search.validate(['x'.repeat(101)])).toThrow();
    expect(() => search.validate([5])).toThrow();
    expect(await search.handler('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
    expect(refresh).not.toHaveBeenCalled();
  });
```

Add `'transfer:search-schools'` to the authorizeChannel `it.each` list.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`registry.ts`: `export interface SchoolSearchResult { id: string; name: string; code: string }`.
`ipc.ts`: `'transfer:search-schools': { args: [query: string]; result: SchoolSearchResult[] };` and `TRANSFER_SEARCH_SCHOOLS: 'transfer:search-schools',`.
`api.ts`: `TransferApi.searchSchools(query: string): Promise<SchoolSearchResult[]>;`

Gateway (keep the online-command opt-in the other Stage 2 methods pass):

```ts
  /** Destination-school search for "New transfer" — the desktop only stores
   * its own institution. Same query portal-web makes. Read-only. */
  async searchSchools(query: string): Promise<SchoolSearchResult[]> {
    const params = new URLSearchParams({ search: query, approvalStatus: 'APPROVED', isActive: 'true' });
    return this.authorized(
      `/institutions?${params.toString()}`,
      { method: 'GET' },
      toSchoolResults,
      ONLINE_COMMAND,
    );
  }
```

```ts
function toSchoolResults(value: unknown): SchoolSearchResult[] {
  const list = Array.isArray(value) ? value : asRecord(value).data;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    return typeof row.id === 'string' && typeof row.name === 'string'
      ? [{ id: row.id, name: row.name, code: typeof row.code === 'string' ? row.code : '' }]
      : [];
  });
}
```

(If `authorized()` always sets a JSON content-type or body, a GET with no body is still fine — check; use the existing option constant's name.)

Validator:

```ts
export function assertSchoolSearchArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [query] = args;
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 100) {
    throw new IPCError('Expected a school search of 2 to 100 characters.');
  }
}
```

Handler (in `registerTransferHandlers`; widen `TransferGateway` to include `'searchSchools'`): `handle(IpcChannels.TRANSFER_SEARCH_SCHOOLS, assertSchoolSearchArgs, (query: string) => gateway.searchSchools(query.trim()));` — no refresh. Add the channel to `SCHOOL_ADMIN_CHANNELS`. Preload: `searchSchools: (query) => invoke(IpcChannels.TRANSFER_SEARCH_SCHOOLS, query),`. Bridge: `searchSchools: (query: string): Promise<SchoolSearchResult[]> => api().transfer.searchSchools(query),`.

- [ ] **Step 4: Run** `apps/desktop/electron/ipc apps/desktop/electron/security apps/desktop/electron/provisioning/BackendProvisioningGateway.test.ts apps/desktop/renderer/services` + typecheck + lint. **Commit** `feat(transfers): online destination-school search`.

---

> **Granularity note for Tasks 4–7.** These tasks are specified at the requirement level — exact names, behaviours, copy and the test cases each must have — rather than as full code. The implementer writes the code against the real files, following the conventions of `add-student/` (Stage 3), `renderer/lib/errors/parseIpcError.ts`, and the Stage 2 bridges. Every listed test case is mandatory; write it first and see it fail.

### Task 4: Pure transfer logic

**Files:** `packages/shared/src/transfers.ts` (+ test; export from the package index); `apps/desktop/renderer/lib/transfers.ts` (+ test); `apps/desktop/renderer/components/transfers/TransferStatusChip.tsx` (+ test).

**Produces (exact names — Tasks 5 and 6 use them):**
- `isLapsed(row: { status: string; initiatedBy: string | null; lapsesAt: string | null }, now: number): boolean` in `@nemis-desktop/shared` — the Global Constraints formula, with a doc comment naming the server function it mirrors. An unparseable `lapsesAt` is not lapsed.
- In `renderer/lib/transfers.ts`:
  - `LocalTransfer` — a typed view of one local `student_transfers` row: the four ids, status, `initiatedBy` (default `ORIGIN_SCHOOL`), `lapsesAt`, `classId`, `termId`, `toGradeLevel`, `reason`, `reviewNotes`, `requestedDate`, `reviewedAt`, `createdAt`, and the four display fields as nullable strings.
  - `toLocalTransfer(record: SchoolAdminRecord): LocalTransfer | null` — `null` when any of `id`, `studentId`, `fromInstitutionId`, `toInstitutionId` is missing.
  - `splitByWhoAsked(rows, us)` returning `{ requestsToUs, ourRequests }`. Requests to us: to us and origin-initiated, or from us and receiving-initiated. Ours: to us and receiving-initiated, or from us and origin-initiated. Rows involving neither side are dropped.
  - `countPendingDecisions(requestsToUs, now)` — pending and not lapsed.
  - `type TransferAction = 'approve' | 'reject' | 'release' | 'cancel' | 'complete' | 'withdraw'` and `actionsFor(row, us, now): TransferAction[]`, implementing spec §8.3: a push to us that is pending gets approve and reject; a pull against us that is pending and not lapsed gets release and reject; a pull against us that has lapsed gets nothing; our own pending, not-lapsed request gets cancel; our lapsed pull gets complete and withdraw; anything already decided gets nothing.
  - `needsPlacement(row)` — true when `classId` or `termId` is missing.
  - `onTransfersChanged(listener): () => void` and `notifyTransfersChanged(): void` — a small in-renderer change signal.
- `TransferStatusChip({ status, lapsed, ours })` — checks `lapsed` first: `Lapsed — ready to complete` when ours, `Lapsed` otherwise; else `Pending` / `Approved` / `Rejected` / `Cancelled`.

**Mandatory test cases:** `isLapsed` — lapsed past the deadline; not lapsed exactly at the deadline; not for origin-initiated; not without `lapsesAt`; not once decided; not for an unparseable date. Split — one row of each of the four kinds plus an unrelated row lands correctly. Count — excludes decided and lapsed rows. Action matrix — one case per matrix row. `needsPlacement` — both directions. `toLocalTransfer` — parses a minimal record with defaults; rejects one missing ids. Change signal — notifies until unsubscribed. Chip — lapsed-before-status for both `ours` values, and each status label.

**Commit:** `feat(transfers): lapse rule, who-asked split and action matrix`.

---

### Task 5: The transfers inbox page

**Files:** create `apps/desktop/renderer/components/transfers/TransfersInboxPage.tsx` (+ test), plus small focused components beside it if the page grows (review form, complete form, new-transfer form); modify `apps/desktop/renderer/app/government/school-admin/students/inter-school-transfer/page.tsx` to render it, dropping the Stage 1 notice. The DEO transfers page is unchanged.

**Consumes:** Task 4's logic and chip; `sharedBridge.listSchoolAdminRecords({ collection: 'student_transfers', limit: 250 })`; the workspace institution id from the settings ViewModel's school profile; `transferBridge.reviewTransfer / cancelTransfer / createTransfer / searchSchools` and `registryBridge.claimStudent`; `parseIpcError`; `ClassTermPicker`; `useRevalidateOnSync`; the connectivity store's `isOnline`.

**Behaviour:**
- Tabs `Requests to us` (with the pending count), `Our requests`, `History` (decided rows, newest first). Each row shows the student's name and formatted NEMIS ID (falling back to the student id), the other school's name (falling back to its id), the reason, the dates, and the status chip.
- Each row offers exactly `actionsFor(row, us, Date.now())`:
  - Approve: class and term via `ClassTermPicker` (grade from the row's `toGradeLevel`, or a grade select when it is null) only when `needsPlacement(row)`, plus optional notes. Sends `reviewTransfer({ id, status: 'APPROVED', reviewNotes, classId, termId })`, omitting the placement fields when not needed.
  - Reject: optional notes; sends `reviewTransfer({ id, status: 'REJECTED', reviewNotes })`; never gated on placement.
  - Release: `reviewTransfer({ id, status: 'APPROVED' })` — the requester already chose class and term.
  - Cancel and Withdraw: `cancelTransfer(id)`.
  - Complete: asks for the child's date of birth plus class and term (pre-filled from the row when stored), then `claimStudent({ nemisId: row.studentNemisId, dateOfBirth, classId, termId, gradeLevel: row.toGradeLevel })`. When the row has no `studentNemisId`, Complete is unavailable with an explanation.
  - New transfer (button above the tabs): pick a local student (search via `listStudents({ keyword })`), search a destination school (at least 2 characters, online, our own school excluded), a reason, and an optional grade; sends `createTransfer`.
- After any successful command: reload local rows, call `notifyTransfersChanged()`, and when `refreshed` is false show `Saved — this will appear once this device syncs.` Failures show `parseIpcError(error)?.message` (or a generic retry message) on that row or form and keep the inputs. Buttons are disabled while submitting.
- Offline: rows still render; every action and New transfer are disabled with `Connect to the internet to act on transfers.`; the school search is never called.
- Reload on `useRevalidateOnSync`.

**Mandatory test cases (real presentation layer with `window.nemis` stubs, as in `AddStudentWizard.test.tsx`):** tab split and pending count; the action buttons shown for each row kind; Approve on a row without placement requires class and term and sends them, while on a row with placement it sends neither; Reject sends no class or term; Complete sends the row's NEMIS ID, the entered date of birth, class, term and grade; a server refusal (`[REMOTE_REJECTED] …`) is shown on the row and the form keeps its inputs; `refreshed: false` shows the sync note; offline disables actions and New transfer and never calls the search; a row from an older server (no display fields) renders with id fallbacks; New transfer sends `createTransfer` with the chosen student, school and reason.

**Commit:** `feat(renderer): transfers inbox with online actions`.

---

### Task 6: Sidebar entry and pending-decision badge

**Files:** `apps/desktop/renderer/components/shell/sidebarConfig.ts`, `apps/desktop/renderer/components/shell/Sidebar.tsx` (+ its test), and a small hook such as `apps/desktop/renderer/lib/use-pending-transfer-count.ts` (+ test).

**Behaviour:**
- The school-admin "User Management" group gains `Student Transfers` linking to `/government/school-admin/students/inter-school-transfer`, icon `ArrowRightLeft`, `badge: 'transfers'`. Extend the closed `SidebarBadge` union with `'transfers'` and map it in `getBadgeCount`. Anchor the edit on the school-admin `Students` entry, because other roles share the file.
- The hook returns the pending-decision count from local rows (`countPendingDecisions` over `splitByWhoAsked(...).requestsToUs`). It runs only for INSTITUTION_ADMIN — other roles make no reads. It re-reads on `useRevalidateOnSync` and on `onTransfersChanged`; it never calls the server and never polls.
- A failed local read shows no badge and does not throw.

**Mandatory test cases:** the entry appears for a school admin with the right href; the badge shows the count from stubbed rows and hides at zero; a non-admin role makes no `listSchoolAdminRecords` call; `notifyTransfersChanged()` triggers a re-read; existing Sidebar tests still pass.

**Commit:** `feat(renderer): student transfers sidebar entry with pending badge`.

---

### Task 7: Stage gate

- Desktop (binary set aside, node build in place): `pnpm vitest run && pnpm typecheck && pnpm lint` — only the known failures; lint shows the 6 pre-existing errors. Restore the Electron binary afterwards.
- Server (`Nemis/apps/Server`): `npx tsc --noEmit && npx jest` — only the known failure(s).
- Deploy coupling: the desktop tolerates a server without the display fields (Task 2), but the new `GET /student-transfers/destination-schools` endpoint (added by the final-review ruling) exists only on the new server — against an old server, New transfer's school search fails. **Deploy the server first**, then ship the desktop. Record both branch heads for the merge decision.
