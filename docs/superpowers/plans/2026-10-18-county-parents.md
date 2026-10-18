# County Parents & Guardians Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port portal-web's County Parents & Guardians list and profile into the desktop app, offline from synced SQLite. Send Message opens Messages with the child's School Admin selected, on both web and desktop.

**Architecture:** The server ships each guardian's user photo in the desktop snapshot (desktop migration 036 stores it). A new `ICountyGuardiansReadModel` (SQLite) feeds two use cases on `CountyApplicationService`. Two ViewModels sit on top, then IPC channels `county:list-guardians` / `county:get-guardian`, then two renderer pages. On the web, recipients gain `institutionId`, the CEO Messages panel preselects from `?institutionId=`, and the parent profile button navigates there.

**Tech Stack:** TypeScript; Electron + better-sqlite3 + Next.js static export (desktop); NestJS + Prisma + Jest (server); Next.js + RTK Query + Vitest (portal-web); Vitest + Testing Library (desktop).

**Spec:** `docs/superpowers/specs/2026-10-18-county-parents-design.md` (in `desktop-client-nemis-parents`). Read it before any task. Section numbers below (§) refer to it.

## Global Constraints

- Work only in the worktrees `Walamen/desktop-client-nemis-parents` and `Walamen/Nemis-parents`, branch `feat/county-parents`. Never touch `Walamen/desktop-client-nemis` or `Walamen/Nemis` (Teachers is being built there).
- Server ships first. A desktop on an old server must still import (`photoUrl` absent → null).
- Desktop migration number is **036**. It must not call `installOutboxTriggers` or regenerate any trigger.
- Keep edits to the shared files small and appended at the end of existing lists (Teachers merges later): `packages/types/src/ipc.ts`, `packages/types/src/api.ts`, `county-application-service.ts`, `create-application-layer.ts`, `createDataLayer.ts`, `createApplicationComposition.ts`, `authorizeChannel.ts`, `registrar.ts`, `validateIpc.ts`, the county preload/bridge/facade indexes. Do **not** edit `electron/main/main.ts`.
- Relationship options, exactly: All, Father, Mother, Guardian, Grandparent, Uncle, Aunt, Sibling, Other. Values are the labels; "all" means no filter.
- Page size 12. Validator `limit` cap 50, `page` 1…1,000,000.
- Copy is the web's, verbatim (see the two web pages named in §1), plus the desktop-only strings: "Inactive" badge, and the disabled Send Message title "No linked school".
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Desktop: run `pnpm rebuild:node` in the desktop worktree before the vitest suite. The worktree has its own `node_modules`, so this does not affect the main checkout.

## Review Focus

1. **A guardian with two children at county schools appears once.** JOINs must not duplicate list rows or inflate `total`/stats. The read-model test is in Task 7.
2. **Stored relationship " FATHER " or "father" matches the Father filter.** It must be trimmed and case-insensitive. Test in Task 7.
3. **Search text containing `%`, `_` or `\` matches literally,** not as a wildcard. Test in Task 7.
4. **`parents/details` with no `?id=` or an unknown id shows "Guardian not found",** never a crash or an endless spinner. Test in Task 10.
5. **A device with no `counties` row (older server) still lists guardians** at all its schools (the `OWN_COUNTY` fallback). Test in Task 7.

---

## Part A — Nemis repo (`Walamen/Nemis-parents`)

### Task 0: Worktree setup (both repos)

- [ ] **Step 1:** In `Nemis-parents`: `pnpm install`. In `desktop-client-nemis-parents`: `pnpm install`, then `pnpm rebuild:node`.
- [ ] **Step 2: Baselines.** Expected: all pass, except that desktop `apps/desktop/renderer/app/government/school-admin/page.test.tsx` is a known pre-existing failure. Record the counts.
  - Server: `pnpm --filter ./apps/Server test`.
  - portal-web: `pnpm --filter ./apps/portal-web test`.
  - Desktop: `pnpm test`, `pnpm lint`, `pnpm typecheck`.

  No commit.

### Task 1: Snapshot ships guardian photos

**Files:**
- Modify: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts` (the `tx.guardian.findMany` at about line 356 and the `guardians:` mapping at about line 918).
- Test: `apps/Server/src/desktop-provisioning/desktop-provisioning.service.spec.ts`.

**Interfaces:**
- Produces: every snapshot `guardians[]` row carries `photoUrl: string | null` (raw `user.imageUrl`). The desktop importer (Task 4) reads it.

- [ ] **Step 1: Update the failing expectations.** In the existing test "on a delta pull also ships guardians and links whose student changed since `since`", both `guardian.findMany` expectations gain `include: { user: { select: { imageUrl: true } } }`. Add a test, `it("ships each guardian's linked user photo, null without a login", …)`, using the same Proxy-`tx` setup. `guardian.findMany` resolves two rows, one with `user: { imageUrl: "https://x/g.jpg" }` and one with `user: null`. Assert that `data.guardians` maps them to `photoUrl: "https://x/g.jpg"` and `photoUrl: null`.
- [ ] **Step 2:** Run `pnpm --filter ./apps/Server test -- desktop-provisioning.service.spec`. Expected: FAIL.
- [ ] **Step 3:** Add the `include` to the guardian query. Add `photoUrl: row.user?.imageUrl ?? null` to the mapping, right after `isEmergencyContact`. If a `DesktopProvisioningData`-style type declares guardian rows, add `photoUrl: string | null` there. It is shipped for all scopes.
- [ ] **Step 4:** Rerun. Expected: PASS. Then run the whole server suite. Expected: baseline count + 1, all green.
- [ ] **Step 5:** Commit: `feat(desktop-provisioning): ship guardian photos in the snapshot`.

### Task 2: Messaging recipients carry `institutionId`; guardian profile children carry active/county flags

**Files:**
- Modify: `apps/Server/src/direct-messages/direct-messages.service.ts:402-425` (`toRecipient`).
- Modify: `apps/Server/src/guardians/guardians.service.ts:128-216` (`findOne`).
- Modify: `packages/types/src/messaging.ts:88` (`EligibleRecipient`) and `packages/types/src/nemis.ts:223` (`GuardianStudent`).
- Create: `apps/Server/src/direct-messages/direct-messages.service.spec.ts` and `apps/Server/src/guardians/guardians.service.spec.ts`.

**Interfaces:**
- Produces: `EligibleRecipient.institutionId?: string`.
- Produces: `GuardianStudent.isActive?: boolean` and `GuardianStudent.institution.countyId?: string | null` / `.isActive?: boolean`. These are optional, because other endpoints also return `GuardianStudent` without them.

- [ ] **Step 1: Write the failing tests.**
  - `direct-messages.service.spec.ts`, `it("gives a County Admin's School Admin recipients their institutionId", …)`:
    - Build the service as `new DirectMessagesService(prisma, {} as never, {} as never, { getProfileImageUrl: () => null } as never)`.
    - `prisma.userOrganization.findFirst` resolves `{ role: "COUNTY_ADMIN", countyId: "county-1", districtId: null, institutionId: null, institution: null }`.
    - `prisma.user.findMany` resolves one user whose `organizations: [{ role: "INSTITUTION_ADMIN", institutionId: "sch-a", districtId: "d-1", district: { id: "d-1", name: "Buchanan" }, institution: { name: "Alpha" } }]`.
    - Expect `listEligibleRecipients("ceo-1")` to resolve `[expect.objectContaining({ role: "INSTITUTION_ADMIN", institutionId: "sch-a", institutionName: "Alpha" })]`.
  - `guardians.service.spec.ts`, `it("findOne returns each child's active flag and its school's county and active flag", …)`:
    - Build `new GuardiansService(prisma, {} as never, { getProfileImageUrl: () => null } as never)`.
    - `prisma.guardian.findUnique` resolves a guardian with one `students[0].student` carrying `isActive: false` and `institution: { id: "sch-a", name: "Alpha", countyId: "county-1", isActive: true, levels: [], district: { id: "d-1", name: "Buchanan" } }`.
    - Assert that `findUnique` was called with a select containing `isActive: true` on the student and `countyId: true, isActive: true` on the institution (`expect.objectContaining` on the nested select).
    - Assert that `students[0]` contains `isActive: false` and `institution` contains `{ countyId: "county-1", isActive: true }`.

    If `resolvePersonPhotoUrl` needs more of the cloudinary stub, extend the stub.
- [ ] **Step 2:** Run both specs. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `toRecipient`: add `institutionId: string | null` to the `organizations` element type and `institutionId: org?.institutionId ?? undefined` to the output (`include` already returns the scalar).
  - `findOne`: student select gains `isActive: true`; institution select gains `countyId: true, isActive: true`; the mapped student gains `isActive: sg.student.isActive`. `institution` already passes through whole.
  - Add the optional fields to both shared types.
- [ ] **Step 4:** Run the two specs (PASS), then the full server suite and `pnpm --filter ./apps/Server exec tsc --noEmit` (0 errors).
- [ ] **Step 5:** Commit: `feat(server): recipient institutionId and guardian child flags for county Send Message`.

### Task 3: portal-web Send Message → Messages with the school's admin selected

**Files:**
- Create: `apps/portal-web/src/lib/county-parent-message.ts`, plus its test `county-parent-message.test.ts` next to it.
- Modify: `apps/portal-web/src/components/messaging/CeoDirectMessagePanel.tsx`.
- Modify: `apps/portal-web/src/app/government/county/parents/[id]/page.tsx:290-309` (the Send Message block).

**Interfaces:**
- Consumes: the Task 2 type fields.
- Produces:
  - `pickMessageInstitutionId(students: GuardianStudent[], countyId: string | null): string | null`: keep students with `isActive !== false`, `institution.isActive !== false` and `institution.countyId === countyId`; order by `lastName`, then `firstName`, then `id`; return the first `isPrimary` one's `institution.id`, else the first one's, else null.
  - `findInstitutionAdmin(recipients: EligibleRecipient[], institutionId: string): EligibleRecipient | undefined`: the first recipient with `role === "INSTITUTION_ADMIN"` and a matching `institutionId`.

- [ ] **Step 1: Write the failing tests** in `county-parent-message.test.ts`:
  - `pickMessageInstitutionId`:
    - picks a primary child's school over an earlier-named non-primary child's;
    - falls back to the first child by name when none is primary;
    - skips an inactive primary child;
    - skips a child at an inactive school;
    - skips another county's child;
    - returns null for `[]` and when nobody qualifies;
    - returns null when `countyId` is null.
  - `findInstitutionAdmin`: finds the School Admin of `sch-a` and ignores a DEO with no `institutionId`; returns undefined for an unknown id.
- [ ] **Step 2:** Run `pnpm --filter ./apps/portal-web test -- county-parent-message`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement both helpers.
- [ ] **Step 4:** Wire the panel. In `CeoDirectMessagePanel`, read `useSearchParams().get("institutionId")`. Copy `SchoolAdminDirectMessagePanel.tsx:164-187`'s `autoSelectedRef` effect, but use `findInstitutionAdmin` and set `roleFilter` to `"INSTITUTION_ADMIN"`. When no recipient matches, do nothing.
- [ ] **Step 5:** Wire the web profile. Read `countyId` from `useAppSelector((s) => s.auth).user?.countyId ?? null` and compute `pickMessageInstitutionId(students, countyId)`.
  - **Non-null:** the `<a href="mailto:…">` becomes a `<button>` with the same classes, calling `router.push(\`/government/county/messages?institutionId=${id}\`)`.
  - **Null:** keep the existing disabled button, but with `title="No linked school"`.
  - Send Message no longer depends on `guardian.email`.
- [ ] **Step 6:** Run the full portal-web suite (baseline + new, green) and the portal-web typecheck: `pnpm --filter ./apps/portal-web exec tsc --noEmit` (0 errors).
- [ ] **Step 7:** Commit: `feat(portal-web): county Send Message opens Messages with the school admin selected`.

---

## Part B — Desktop repo (`Walamen/desktop-client-nemis-parents`)

### Task 4: Migration 036 + importer column

**Files:**
- Create: `apps/desktop/electron/database/migrations/036-add-guardian-photo.ts`, plus its test `036-add-guardian-photo.test.ts`.
- Modify: `apps/desktop/electron/database/migrations/registry.ts` (import + append after `addCountyStudentsData`).
- Modify: `apps/desktop/electron/provisioning/ProvisioningImporter.ts:77` (append `'photoUrl'` to the `guardians` spec).
- Test: `apps/desktop/electron/provisioning/ProvisioningImporter.test.ts` and the existing `SqliteGuardianRepository` test file.

**Interfaces:**
- Produces: `guardians.photoUrl TEXT` (nullable), and `export const addGuardianPhoto: Migration` with `version: 36` and `name: 'add-guardian-photo'`.

- [ ] **Step 1: Write the failing tests.**
  - Migration test, modelled on `035-add-county-students-data.test.ts` (run ≤ 35, seed `sync_metadata`, run 36):
    - `guardians` has a `photoUrl` column;
    - `lastFullResyncAt` is null;
    - the `sqlite_master` SQL of the three `outbox_guardians_*` triggers is identical before and after 036;
    - after `UPDATE guardians SET firstName='X'` on a seeded guardian, the newest `sync_queue` payload has no `photoUrl` key in `record` (`JSON.parse(payload).record.photoUrl === undefined`).
  - Importer test: a snapshot guardian with `photoUrl: 'https://x/g.jpg'` is stored; a guardian row without the field imports with `photoUrl` null.
  - Guardian repository test: seed a guardian with `photoUrl` set, run the repository's update path, and expect `photoUrl` unchanged.
- [ ] **Step 2:** Run those three test files with `pnpm vitest run <paths>`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration (`ALTER TABLE guardians ADD COLUMN photoUrl TEXT`, then the same `lastFullResyncAt` reset block as 035, with a doc comment naming the spec and "no outbox triggers regenerated"). Register it and add the importer column.
- [ ] **Step 4:** Rerun. Expected: PASS. Also run the migration-registry tests (`pnpm vitest run apps/desktop/electron/database`).
- [ ] **Step 5:** Commit: `feat(data): migration 036 stores guardian photos`.

### Task 5: Types + application layer

**Files:**
- Create: `packages/types/src/county-guardians.ts`, and export it from `packages/types/src/index.ts`.
- Create: `packages/application/src/interfaces/county/county-guardians-read-model.ts`, and export it from `interfaces/county/index.ts`.
- Create: `packages/application/src/use-cases/county/get-county-guardians.ts` and `get-county-guardian-detail.ts`, both exported from `packages/application/src/index.ts`.
- Create: `packages/application/src/testing/county/in-memory-county-guardians-read-model.ts`, exported from `testing/county/index.ts`.
- Modify: `packages/application/src/services/county-application-service.ts`, `factories/create-application-layer.ts` (+ its `.test.ts` `buildLayer`), `packages/presentation/src/testing/create-test-application.ts`, and `apps/desktop/electron/data/adapters/createApplicationComposition.ts` (temporary `notBuilt('CountyGuardians')` Proxy, replaced in Task 7).
- Test: `packages/application/src/use-cases/county/county-guardians.test.ts`.

**Interfaces (produced, exact):**
```ts
// packages/types/src/county-guardians.ts
export interface CountyGuardiansQuery { search?: string; relationship?: string; districtId?: string; page: number; limit: number }
export interface CountyGuardianListItem {
  id: string; firstName: string; lastName: string; relationship: string; phoneNumber: string;
  email: string | null; photoUrl: string | null; studentsCount: number; districts: string[];
}
export interface CountyGuardianStats { total: number; primaryGuardians: number; childrenCovered: number }
export interface CountyGuardiansResult {
  county: { id: string; name: string } | null; districts: Array<{ id: string; name: string }>;
  stats: CountyGuardianStats; data: CountyGuardianListItem[]; total: number; page: number; limit: number; totalPages: number;
}
export interface CountyGuardianChild {
  id: string; firstName: string; lastName: string; nemisId: string | null; photoUrl: string | null;
  isActive: boolean; isPrimary: boolean; institution: { id: string; name: string; districtName: string | null };
}
export interface CountyGuardianDetail {
  id: string; firstName: string; lastName: string; relationship: string; phoneNumber: string; email: string | null;
  address: string | null; occupation: string | null; isEmergencyContact: boolean; photoUrl: string | null;
  studentsCount: number; districts: string[]; messageInstitutionId: string | null; children: CountyGuardianChild[];
}
```
- `ICountyGuardiansReadModel { listGuardians(query: CountyGuardiansQuery): Omit<CountyGuardiansResult, 'county' | 'districts'>; getGuardian(id: string): CountyGuardianDetail | null }`
- `GetCountyGuardiansUseCase` (deps `{ readModel, districtsReadModel, countyReadModel, logger }`, the same composition as `GetCountyStudentsUseCase`, invoker name `'GetCountyGuardians'`).
- `GetCountyGuardianDetailUseCase` (input `{ guardianId: string }`).
- `ApplicationPorts.countyGuardians: ICountyGuardiansReadModel`.
- `CountyApplicationService.listGuardians(query): Promise<ApplicationResponse<CountyGuardiansResult>>` and `.getGuardian(guardianId: string): Promise<ApplicationResponse<CountyGuardianDetail | null>>`, with deps keys `listGuardians` / `getGuardian`.
- `InMemoryCountyGuardiansReadModel`: settable `page`, `guardianById: Map`, and `lastQuery`, as in the Students fake.

- [ ] **Step 1: Write the failing tests**, mirroring `county-students.test.ts`:
  - `listGuardians` adds the county and the active districts (`{id,name}` only) to the read-model page and forwards the query;
  - `getGuardian` is null for an unknown id.
- [ ] **Step 2:** Run `pnpm vitest run packages/application/src/use-cases/county/county-guardians.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the files above, then wire the factory, the test builders and the composition Proxy.
- [ ] **Step 4:** Rerun (PASS) and run `pnpm typecheck`. Expected: 0 errors. If `renderer/lib/ipc/county.ts` (`group<CountyApplicationService>`) errors, it requires every method: add the two entries now, calling `countyBridge.listGuardians` / `getGuardian`, which Task 8 creates, and move this sub-step into Task 8 instead.
- [ ] **Step 5:** Commit: `feat(application): county guardians list and guardian detail`.

### Task 6: Presentation ViewModels

**Files:**
- Create: `packages/presentation/src/view-models/county/county-guardians-view-model.ts`, `county-guardian-detail-view-model.ts`, and the test `county-guardians-view-models.test.ts`.
- Modify: `packages/presentation/src/factories/create-presentation-layer.ts`, `packages/presentation/src/index.ts`, and `apps/desktop/renderer/lib/presentation/hooks/county.ts`.

**Interfaces:**
- Consumes: Task 5 service methods.
- Produces:
  - `CountyGuardiansViewModel`: store `{ summary: AsyncState<CountyGuardiansResult>; query: CountyGuardiansQuery }`, initial query `{ page: 1, limit: 12 }`, and `load(query)`.
  - `CountyGuardianDetailViewModel`: store `{ detail: AsyncState<CountyGuardianDetail>; requestedId: string | null }`, and `load(guardianId)` with `isEmpty: (d) => d === null`.
  - Presentation keys `countyGuardians` / `countyGuardianDetail`.
  - Hooks `useCountyGuardiansViewModel` / `useCountyGuardianDetailViewModel`.

  Copy the Students ViewModels' shape exactly.

- [ ] **Step 1:** Write the tests, mirroring `county-students-view-models.test.ts`: the query passes through and is kept, with status `success`; `requestedId` is set before the load resolves, and an unknown id ends `empty`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run them (PASS), then `pnpm typecheck` (0 errors).
- [ ] **Step 5:** Commit: `feat(presentation): county guardians view models`.

### Task 7: SQLite read model

**Files:**
- Create: `apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyGuardiansReadModel.ts`, plus its test `SqliteCountyGuardiansReadModel.test.ts`.
- Modify: `…/business/support.ts`: export `OWN_COUNTY` (moved, text unchanged).
- Modify: `…/business/SqliteCountyStudentsReadModel.ts:16`: import it instead of declaring it.
- Modify: `apps/desktop/electron/data/factories/createDataLayer.ts` (`countyGuardians` beside `countyStudents`) and `createApplicationComposition.ts` (replace the Task 5 Proxy with `dataLayer.repositories.countyGuardians`).

**Interfaces:**
- Consumes: `ICountyGuardiansReadModel` and the types from Task 5.
- Produces: `class SqliteCountyGuardiansReadModel implements ICountyGuardiansReadModel`, with `constructor(repository: RepositoryContext)`. Every public method runs inside `guarded('SqliteCountyGuardiansReadModel.<method>', …)`.

**Rules (copy from §5.2–5.6):**
- `COUNTY_LINK` (a link counts): its student's school matches `OWN_COUNTY`, whatever the student or school active state.
- `IN_LIST` (a guardian is in the base set): `EXISTS` a link to an `s.isActive = 1` student at a school with `i.isActive = 1 AND OWN_COUNTY`.
- List rows: `studentsCount` = count of county links; `districts` = distinct district names of the county links' schools, sorted. Compute both per row with sub-selects (or group in TS), never by joining the list query to links.
- Filters:
  - search: four `LIKE … ESCAPE '\'` clauses on the escaped, trimmed term;
  - relationship: `lower(trim(g.relationship)) = lower(?)`;
  - district: `EXISTS` a county link whose school has `i.districtId = ?`.
- Order: `g.lastName, g.firstName, g.id`.
- `totalPages = Math.max(1, Math.ceil(total / limit))`; `page = Math.max(query.page, 1)`.
- Stats, over the base set:
  - `total`;
  - `primaryGuardians`: has an `isPrimary = 1` link to an active student at an active own-county school;
  - `childrenCovered`: sum of county-link counts.
- `getGuardian`: null unless the guardian has at least one county link. Children are ordered `lastName, firstName, id`.
- `messageInstitutionId`, computed over children whose student is active and whose school is active: the first primary child's school, else the first child's school, else null.

- [ ] **Step 1: Write the failing tests.** Reuse the Students test's `school`/`student` helpers (copy them) and add `guardian(id, lastName, opts)` and `link(studentId, guardianId, isPrimary)`. Each case is its own `it`:
  - lists base-set guardians ordered by last name, then first name, then id, with `studentsCount` and sorted distinct `districts`. A guardian with children at two schools in the same district shows that district once;
  - **a guardian with two county children appears once and `total` counts them once** (Review Focus 1);
  - excludes a guardian whose only child is inactive, whose only child is at an inactive school, or whose only child is in another county's school (insert a school with `countyId 'county-2'`);
  - `studentsCount` includes an inactive child for a guardian who is in the list;
  - relationship `' FATHER '` and `'father'` both match `relationship: 'Father'`; `'Other'` doesn't match `'Stepfather'` (Review Focus 2);
  - search matches first name, last name, phone and email case-insensitively; `'50%'` matches only a literal `50%`, and `'a_b'` doesn't match `'axb'` (Review Focus 3);
  - the district filter keeps a guardian whose county child is in that district;
  - paging: limit 2 over 3 guardians gives `totalPages 2`, and page 2 holds the third; an empty result gives `totalPages 1`;
  - stats: `total`; `primaryGuardians` counts only via an active link (a primary link to an inactive child alone doesn't count); `childrenCovered` = sum of `studentsCount`;
  - **with the `counties` table emptied, guardians at every school are listed** (Review Focus 5);
  - `getGuardian`:
    - returns the contact fields, `photoUrl`, children in name order with `isPrimary`/`isActive`/`institution.districtName`, and `studentsCount`/`districts`;
    - `messageInstitutionId`: primary child wins; falls back to the first child; skips an inactive primary child; null when every child is inactive;
    - stays openable (non-null) for a guardian whose children are all inactive;
    - null for an unknown id and for a guardian linked only to another county's student.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business/SqliteCountyGuardiansReadModel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, move `OWN_COUNTY`, and wire the data layer and composition.
- [ ] **Step 4:** Run the new test and `SqliteCountyStudentsReadModel.test.ts` (both PASS), then `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(data): SQLite county guardians read model`.

### Task 8: IPC, preload, bridge, facade

**Files:**
- Modify: `packages/types/src/ipc.ts` (map entries + `IpcChannels.COUNTY_LIST_GUARDIANS: 'county:list-guardians'` / `COUNTY_GET_GUARDIAN: 'county:get-guardian'`) and `packages/types/src/api.ts` (`CountyApi.listGuardians(query): Promise<CountyGuardiansResult>` / `getGuardian(guardianId): Promise<CountyGuardianDetail | null>`).
- Modify: `apps/desktop/electron/security/validateIpc.ts`: add `assertCountyGuardiansQueryArgs`.
- Modify: `apps/desktop/electron/ipc/authorizeChannel.ts` (`COUNTY_ADMIN_CHANNELS`) and its test.
- Create: `apps/desktop/electron/ipc/handlers/county/guardians.ts` (`registerCountyGuardianHandlers(handle: IpcHandle, app: ApplicationLayer): void`), plus its test `guardians.test.ts`. Export the handler from `handlers/county/index.ts`.
- Modify: `apps/desktop/electron/ipc/registrar.ts`: call `registerCountyGuardianHandlers(securedHandle, app)` after `registerCountySchoolHandlers`.
- Create: `apps/desktop/electron/preload/county/guardians-api.ts` (`countyGuardiansApi: Pick<CountyApi, 'listGuardians' | 'getGuardian'>`), and spread it in `preload/county/index.ts`.
- Create: `apps/desktop/renderer/services/nemis-bridge/county/guardians-bridge.ts` (`guardiansBridge`), and spread it in that folder's `index.ts`.
- Modify: `apps/desktop/renderer/lib/ipc/county.ts` (`listGuardians`, `getGuardian`) and `renderer/lib/ipc/index.test.ts`.

**Validator:** arity 1; plain object; known keys `search, relationship, districtId, page, limit`; `page` int 1…1,000,000; `limit` int 1…50; the three strings ≤ `ID_MAX_LENGTH`. `county:get-guardian` uses `assertSingleIdArg`.

- [ ] **Step 1: Write the failing tests.**
  - `guardians.test.ts`, mirroring `students.test.ts` without the gateway:
    - list and detail forward to `app.county.listGuardians` / `getGuardian`;
    - the validators refuse `limit: 51`, an extra key, `page: 0.5` and a non-string id, and accept `{ page: 1, limit: 12, relationship: 'Father', districtId: 'd-1', search: 'ada' }`.
  - `authorizeChannel.test.ts`: both channels are COUNTY_ADMIN-only.
  - `index.test.ts`: `county.listGuardians` / `getGuardian` return the bridged data.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement everything listed above.
- [ ] **Step 4:** Run them (PASS), then `pnpm typecheck` and `pnpm lint` (0/0).
- [ ] **Step 5:** Commit: `feat(ipc): county guardians channels`.

### Task 9: List page

**Files:**
- Replace: `apps/desktop/renderer/app/government/county/parents/page.tsx` (the placeholder) with the port.
- Create: `apps/desktop/renderer/components/county/parents/ParentCard.tsx`.
- Test: `apps/desktop/renderer/app/government/county/parents/page.test.tsx`.

**Interfaces:**
- Consumes: `useCountyGuardiansViewModel`, `useViewModel`, `useRevalidateOnSync`, `SchoolPhoto` (`fallback="/parent-fallback.jpg"`), and `Avatar` (`role="parent"`), as the Students page does.

**Behaviour:**
- A port of the web list (§2.1). The search term is debounced 400 ms before it reaches the query (the web's `debouncedSearch`). Changing debounced search, relationship or district resets to page 1.
- The spinner shows only for `idle`/`loading`, as on Students.
- The query sends `search`/`relationship`/`districtId` only when set (not "all"), plus `page` and `limit: 12`.
- Headline numbers:
  - "N parents found" = `result.total`;
  - header Total and the Total card = `stats.total`;
  - Children Covered = `stats.childrenCovered`;
  - Primary Guardians = `stats.primaryGuardians`.
- The card "View Profile" link and table rows go to `/government/county/parents/details?id=<id>`. The toggle buttons carry aria-labels "Card view" / "Table view". The default view is cards (as on the web).

- [ ] **Step 1: Write the failing tests**, with the setup copied from `students/page.test.tsx` and `window.nemis = { county: { listGuardians } }`:
  - the header shows the county name, and the three cards show `stats` (10 / 14 / 6);
  - a relationship button and the district select reach `listGuardians` with `relationship: 'Father'` / `districtId: 'd-1'` and `page: 1`;
  - typing in search calls `listGuardians` with `search` only after the debounce (`vi.useFakeTimers()`, advance 400 ms);
  - "N parents found" shows `total`;
  - card view shows "2 children" and "1 child", plus phone/email; table view (after clicking "Table view") shows the district list joined with ", " and "—" when empty;
  - the empty state copy;
  - the pagination window: `totalPages: 9` on page 1 shows buttons 1–7; clicking 2 loads `page: 2`;
  - links go to `details?id=g-1`.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/county/parents/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it (PASS), then `pnpm lint` and `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(county): port the Parents & Guardians list page`.

### Task 10: Profile page

**Files:**
- Create: `apps/desktop/renderer/components/county/parents/ParentProfilePage.tsx`, plus its test `ParentProfilePage.test.tsx`.
- Create: `apps/desktop/renderer/app/government/county/parents/details/page.tsx` (a `Suspense` wrapper copied from `students/details/page.tsx`).
- Modify: `apps/desktop/renderer/app/government/county/messages/page.tsx`. Add only this comment: `// TODO(county Messages port): honour ?institutionId= — preselect that school's School Admin (docs/superpowers/specs/2026-10-18-county-parents-design.md §5.5).`

**Interfaces:**
- Consumes: `useCountyGuardianDetailViewModel`, `useSearchParams().get('id') ?? ''`, `useRouter`, `formatNemisId` from `@nemis-desktop/shared`, and `Avatar`.

**Behaviour:**
- A port of the web profile (§2.2). Load on the id with `useRevalidateOnSync`. Show the spinner while `requestedId !== id` or the status is idle/loading.
- Show "Guardian not found" + "Go back" (`router.back()`) for `empty`/`error`, or when the id is `''`. With no id, don't call `load`.
- Children box and "Students covered" use `studentsCount`. Districts are joined with " · " (hero) and ", " (contact row).
- Badges: "Active" (`bg-active text-slate-100`) or "Inactive" (`bg-slate-200 text-slate-500`); "Primary" when `isPrimary`.
- Each child card is a `Link` to `/government/county/students/details?id=<childId>`.
- Send Message:
  - `messageInstitutionId` set: a button that runs `router.push(\`/government/county/messages?institutionId=${id}\`)`;
  - otherwise: the web's disabled button with `title="No linked school"`;
  - never a `mailto:` link.
- The engagement level and colours are exactly the web's.

- [ ] **Step 1: Write the failing tests**, mocking `next/navigation` (`useSearchParams`, `useRouter` with `push`/`back`) as `StudentDetailPage.test.tsx` does:
  - hero: name, relationship, "Buchanan · Owensgrove", Children `2`;
  - contact rows: email shown or "Not provided"; occupation;
  - engagement:
    - High when email and emergency contact (with the "Designated emergency contact" line);
    - Medium with email only;
    - Low with neither;
  - "Students covered" reads "2 students";
  - child cards: the formatted NEMIS ID, an "Inactive" badge for an inactive child, "Primary" on the primary child, and a link to `students/details?id=s-1`;
  - Send Message pushes `/government/county/messages?institutionId=sch-a`; with `messageInstitutionId: null` it is disabled with the title "No linked school"; no `a[href^="mailto:"]` in the document;
  - **`getGuardian` resolving null shows "Guardian not found"; with no `?id=` the page shows it without calling `getGuardian`** (Review Focus 4).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the component, the route and the comment.
- [ ] **Step 4:** Run it (PASS), then `pnpm lint` and `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(county): parent profile page with Send Message to the school admin`.

### Task 11: Whole-branch verification

- [ ] **Step 1: Desktop.** `pnpm lint` → 0; `pnpm typecheck` → 0; `pnpm test` → baseline + new, with only the known pre-existing `school-admin/page.test.tsx` failing. Then `pnpm --filter @nemis-desktop/app build:renderer` succeeds and emits `government/county/parents/details`. Finish with `pnpm rebuild:electron`, so the worktree can run `pnpm dev`.
- [ ] **Step 2: Nemis.** Server `tsc --noEmit` → 0 and Jest all green; portal-web Vitest all green and `tsc --noEmit` → 0.
- [ ] **Step 3:** Record the counts in the final report. No merge. Merging is Alvin's choice, and the server ships first.
