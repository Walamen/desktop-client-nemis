# DEO Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The DEO Infrastructure page lists only real, open, school-filed infrastructure issues with their real status. Review, Resolve and Escalate work on the web and offline on the desktop. Resolving an infrastructure issue from Alerts or the dashboard also marks it Resolved for the school and County.

**Architecture:**
- **Server:** rewrites `getDistrictInfrastructure` in place on the Alerts rule (`districtAlertWhere`, active schools, no teacher requests, `INFRASTRUCTURE_ISSUE` only, unresolved). It enforces the action transitions and shares one officer-name helper with the alerts resolve. The shared `resolveInDistrict` also writes `metadata.status: "RESOLVED"` for infrastructure issues.
- **Desktop:** reads the synced alerts, maps them with a helper mirroring the server, and acts offline through `SqliteDistrictAlertStore`. The alerts outbox trigger queues each change.

**Tech Stack:**
- Nemis: NestJS + Prisma + Jest, Next.js + RTK Query + Vitest.
- desktop-client-nemis: Electron + better-sqlite3, the application and presentation layers, the renderer, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-deo-infrastructure-design.md` (desktop-client-nemis repo)

**Branches:** `feat/deo-infrastructure` in both repos, created from `main`. Tasks 1–3 are in Nemis, Tasks 4–7 in desktop-client-nemis.

## Global Constraints

**Rows**
- Alerts of type `INFRASTRUCTURE_ISSUE` with `isResolved = false`.
- District-tagged, or raised against an **active** school of the district.
- Never a teacher request (`metadata.staffId` is a string).
- Never county-level.

**Row fields**

| Field | Value |
|---|---|
| `status` | `metadata.status` ∈ {`OPEN`, `UNDER_REVIEW`, `ESCALATED`}, else `OPEN` |
| `category` | `metadata.category`, else `"Infrastructure"` |
| `reportedAt` | `metadata.submittedAt` if it is a valid ISO date, else `createdAt` |
| `schoolId` / `schoolName` | the alert's school. A district-only issue gives `schoolId: null` and `schoolName` = the district name. |
| `title` / `note` / `severity` | the alert's `title` / `description` / `severity` |

**Order:** severity CRITICAL, HIGH, MEDIUM, LOW; then newest `reportedAt`; then `id` ascending.

**Summary:** `{ totalIssues, critical, open (OPEN + UNDER_REVIEW), escalated }`.

**Transitions**

| Action | Allowed from | Requires |
|---|---|---|
| Review | `OPEN` | — |
| Resolve | `OPEN` or `UNDER_REVIEW` | — |
| Escalate | `OPEN` or `UNDER_REVIEW` | severity `HIGH` or `CRITICAL`, and a non-empty `reason` |

**Metadata written** (merged into the existing metadata, so every other key, such as `attachments`, `acknowledged*` and `submittedBy*`, is kept)

| Action | Keys |
|---|---|
| Review | `status: "UNDER_REVIEW"`, `reviewedAt`, `reviewedById`, `reviewedByName`, `reviewComments` (string or null) |
| Resolve | `status: "RESOLVED"`, `resolvedAt`, `resolvedById`, `resolvedByName`, `resolutionComments` (string or null). Also sets `isResolved = true`, `resolvedAt`, `resolvedBy`. |
| Escalate | `status: "ESCALATED"`, `escalatedAt`, `escalatedById`, `escalatedByName`, `escalationReason`, `escalatedToCounty: true`. Also sets `countyId` to the district's county when it is null. |

**Shared resolve** (Alerts Resolve and dashboard Mark Reviewed):
- On an `INFRASTRUCTURE_ISSUE`, including an escalated one, it also merges `status: "RESOLVED"`, `resolvedAt`, `resolvedById` and `resolvedByName`.
- Other alert types' metadata is untouched.

**Officer name:** first and last name joined, else `"DEO"`. Never the email prefix.

**Server refusal texts**
- `Infrastructure issue not found`
- `This issue can no longer be reviewed`, `This issue can no longer be resolved`, `This issue can no longer be escalated`
- `A reason is required to escalate`

**Page copy**
- Status chips `All` (the default), `Open`, `Under Review`, `Escalated`, with counts.
- Load error `Failed to load infrastructure issues.` with `Retry`.
- Action error: the modal stays open and shows the server's message, else `Couldn't save this action. Try again.`
- Header place: district · county.
- "View School": web `/government/deo/schools/${id}`, desktop `/government/deo/schools/details?id=`.

**Sidebar (both apps):** `Infrastructure`, href `/government/deo/infrastructure`, Lucide `Wrench`, placed after Transfers.

**Scope:** server `ensureDistrictAccess` or `enforceDistrictAccess` on list and actions; the desktop district only from the session.

**Repo hygiene**
- Never commit `apps/desktop/package.json` or `apps/portal-web/tsconfig.tsbuildinfo`.
- Stage files by name. No pushes.
- Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Desktop SQLite tests: on NODE_MODULE_VERSION, run `pnpm rebuild:node` first and `pnpm rebuild:electron` after.

## Review Focus

1. **An escalated issue resolved from the Alerts page.** On both apps it becomes `RESOLVED` in metadata and leaves the Infrastructure page. Tested in Tasks 2 and 4.
2. **A metadata merge that drops `attachments` or `acknowledgedAt`** would break the school's and County's views. Every write keeps unknown keys. Tested in Tasks 2 and 4.
3. **A district-only issue with a null `countyId`, escalated.** It gets the district's county, so County sees it. Tested in Tasks 2 and 4.
4. **A desktop action on an issue that changed state on another device.** The store's transition check refuses it (`false`), the page reloads, and the error shows only if it really failed. Tested in Tasks 4 and 6.
5. **Unparsable or non-object `metadata` on the desktop.** It is treated as `{}`: status `OPEN`, category `Infrastructure`. Nothing crashes. Tested in Task 4.

---

### Task 1: Server infrastructure list (Nemis)

**Files:**
- Create: `apps/Server/src/districts/infrastructure-issues.ts`. Pure mapping, with no Prisma.
- Modify: `apps/Server/src/districts/districts.service.ts`. Rewrite `getDistrictInfrastructure` (~l.2410–2560). Delete the synthetic-row code. Delete `getSeverityRank` (~l.371) if nothing else uses it.
- Create: `apps/Server/src/districts/districts.infrastructure.spec.ts`, mocked like `districts.alerts.spec.ts`.

**Interfaces:**
- Produces, in `infrastructure-issues.ts`:

```ts
export type InfrastructureStatus = "OPEN" | "UNDER_REVIEW" | "ESCALATED";
export function infrastructureStatus(metadata: unknown): InfrastructureStatus;
export function mapInfrastructureIssue(alert: { id: string; title: string; description: string; severity: string; institutionId: string | null; metadata: unknown; createdAt: Date }, school: { id: string; name: string } | null, districtName: string): DistrictInfrastructureIssue;
export function sortInfrastructureIssues(issues: DistrictInfrastructureIssue[]): DistrictInfrastructureIssue[];
export function infrastructureSummary(issues: DistrictInfrastructureIssue[]): { totalIssues: number; critical: number; open: number; escalated: number };
```

- [ ] **Step 1: Write the failing tests.**
  - Helper cases:
    - status `UNDER_REVIEW` kept; `RESOLVED` → `OPEN`; `null` metadata → `OPEN`; `"x"` → `OPEN`;
    - category fallback `Infrastructure`;
    - `reportedAt` from `submittedAt` `"2026-10-05T09:00:00.000Z"`, else `createdAt` when `submittedAt` is `"nope"`;
    - a district-only issue gives `schoolId: null` and `schoolName` = the district name;
    - order: CRITICAL before HIGH, newer first on a tie, then `id`;
    - summary for one each of OPEN, UNDER_REVIEW and ESCALATED: `{ totalIssues: 3, critical: <n>, open: 2, escalated: 1 }`.
  - Service cases:
    - only `INFRASTRUCTURE_ISSUE` rows: an `ATTENDANCE_CONCERN` alert and a teacher request (`metadata.staffId`) are absent;
    - an inactive school's issue is absent;
    - no ids containing `:`, so no synthetic rows;
    - another district's DEO gets `ForbiddenException`;
    - the Prisma `where` includes `type: "INFRASTRUCTURE_ISSUE"`, `isResolved: false` and `districtAlertWhere(...)`.
- [ ] **Step 2:** From `apps/Server`, run `pnpm jest src/districts/districts.infrastructure.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. School names come from one `institution.findMany` for the issues' ids.
- [ ] **Step 4:** Run `pnpm jest src/districts src/common/district` and `pnpm exec tsc --noEmit -p tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(districts): infrastructure page lists real school-filed issues`.

### Task 2: Server actions and shared resolve (Nemis)

**Files:**
- Modify: `apps/Server/src/districts/districts.service.ts`:
  - `reviewInfrastructureIssue`, `resolveInfrastructureIssue`, `escalateInfrastructureIssue` and `getInfrastructureIssueById` (~l.5178–5370);
  - `resolveInDistrict` (~l.3089);
  - add `private async officerName(userId: string): Promise<string>`, and use it wherever these methods named the officer.
- Modify: `apps/Server/src/districts/districts.infrastructure.spec.ts` and `apps/Server/src/districts/districts.alerts.spec.ts`.

**Interfaces:**
- Consumes: Task 1's `infrastructureStatus`.
- Each action loads the issue with `{ id, type: INFRASTRUCTURE_ISSUE, isResolved: false, AND: [districtAlertWhere(districtId, activeSchoolIds)] }`. If nothing matches, it throws `NotFoundException("Infrastructure issue not found")`.

- [ ] **Step 1: Write the failing tests.**
  - Review: `OPEN` → `UNDER_REVIEW`, and `UNDER_REVIEW` is refused with `This issue can no longer be reviewed`.
  - Resolve:
    - `OPEN` and `UNDER_REVIEW` both resolve;
    - `ESCALATED` is refused with `This issue can no longer be resolved`;
    - `isResolved: true` is written.
  - Escalate:
    - LOW is refused with `This issue can no longer be escalated`;
    - an empty reason is refused with `A reason is required to escalate`;
    - HIGH with a reason works;
    - a null `countyId` gets the district's `countyId`.
  - Merge: `attachments: ["a.jpg"]` and `acknowledgedAt` survive every action.
  - Officer name: user `{ firstName: "Ama", lastName: "Kollie" }` gives `reviewedByName: "Ama Kollie"`; a user with neither name gives `"DEO"`.
  - An issue at an inactive school gives `Infrastructure issue not found`.
  - Another district's DEO gets 403 on each action.
  - `resolveInDistrict` (`districts.alerts.spec.ts`):
    - an escalated `INFRASTRUCTURE_ISSUE` gets `metadata.status: "RESOLVED"` with `resolvedByName`, and `attachments` is kept;
    - an `ATTENDANCE_CONCERN` alert's metadata is unchanged.
- [ ] **Step 2:** Run both specs. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm jest src/districts src/common/district` and `tsc`. Expected: PASS. Existing alerts and incidents tests stay green.
- [ ] **Step 5: Commit:** `feat(districts): infrastructure actions follow the rule; resolve closes issues everywhere`.

### Task 3: Web page and sidebar (Nemis portal-web)

**Files:**
- Modify: `apps/portal-web/src/app/government/deo/infrastructure/page.tsx`:
  - the header place via `useGetDistrictSettingsQuery`, as `deo/reports/page.tsx` does it;
  - an `ALL` status chip, first in the list, with the count of all issues;
  - Retry on the load error;
  - the action error in the modal: replace the console-only catch, read the RTK error's `data.message` if present, and keep the modal open;
  - "View School" stays as is.
- Modify: `apps/portal-web/src/components/sidebarConfig.ts`. Add the DEO nav item `{ name: "Infrastructure", href: "/government/deo/infrastructure", icon: Wrench }` after Transfers, following the neighbouring items' shape.
- Create: `apps/portal-web/src/app/government/deo/infrastructure/page.test.tsx`, mocked like `deo/reports/page.test.tsx`.

- [ ] **Step 1: Write the failing page tests:**
  - the real district · county, and no `Buchanan`;
  - clicking `Open` and then `All` shows every issue again;
  - a rejected review mutation keeps the modal open and shows `This issue can no longer be reviewed`; a rejection with no message shows `Couldn't save this action. Try again.`;
  - `Escalate` shows only on HIGH and CRITICAL issues;
  - no `Review` on an `UNDER_REVIEW` issue;
  - `Escalated to County` on an `ESCALATED` issue;
  - `Retry` on the load error calls `refetch`.
- [ ] **Step 2:** From `apps/portal-web`, run `pnpm vitest run src/app/government/deo/infrastructure/page.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm typecheck`, `pnpm lint` and `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): honest Infrastructure page, reachable from the sidebar`.

### Task 4: Desktop read model and offline store (desktop-client-nemis)

**Files:**
- `packages/application/src/interfaces/deo/district-overview-read-model.ts` + `SqliteDistrictOverviewReadModel.ts` + the in-memory double:

```ts
export interface DistrictInfrastructureRow { readonly id: string; readonly title: string; readonly description: string; readonly severity: string; readonly institutionId: string | null; readonly schoolName: string | null; readonly metadata: Record<string, unknown>; readonly createdAt: string }
/** Unresolved INFRASTRUCTURE_ISSUE alerts by the listDistrictAlerts rule; metadata parsed (object else {}). */
listInfrastructureIssues(districtId: string): DistrictInfrastructureRow[];
```

- `packages/application/src/interfaces/deo/district-alert-store.ts` + `SqliteDistrictAlertStore.ts`:

```ts
export interface AlertOfficer { readonly id: string; readonly name: string }
resolve(districtId: string, alertId: string, by: AlertOfficer, at: string): boolean;                 // was resolvedBy: string; also merges the infrastructure metadata on INFRASTRUCTURE_ISSUE
review(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean;
resolveInfrastructure(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean;
escalate(districtId: string, alertId: string, by: AlertOfficer, reason: string, at: string): boolean;
```

  - Each method reads the row under the existing `WHERE` authorisation (unresolved, not a teacher request, district or active school), plus `type = 'INFRASTRUCTURE_ISSUE'` for the three new methods.
  - It checks the transition, merges the metadata in code and writes the whole metadata with `updatedAt = at`, in one transaction.
  - `escalate` also sets a null `countyId` from the district row's `countyId`.
  - `false` when nothing matched or the transition is refused.
- Update `ResolveDistrictAlertUseCase` (`packages/application/src/use-cases/deo/resolve-district-alert.ts`) to pass `{ id: currentUserId, name }`. The name comes from `readModel.getUserProfile(currentUserId)`: first and last name, else `"DEO"`. Wire `readModel` in the factory.
- Tests:
  - `SqliteDistrictOverviewReadModel.test.ts`, `SqliteDistrictAlertStore.test.ts` and `resolve-district-alert.test.ts`;
  - the in-memory alert store double, if one exists. Search `packages/application/src/testing`.

- [ ] **Step 1: Write the failing tests:**
  - **`listInfrastructureIssues`:**
    - only unresolved `INFRASTRUCTURE_ISSUE` rows of the district or an active school, with no `ATTENDANCE_CONCERN`, teacher request, inactive school, other district or county-only rows;
    - `metadata` of `'not json'` gives `{}`;
    - `schoolName` is filled for school rows.
  - **Store transitions**, each asserting the row and the queued `sync_queue` entry, or none on refusal:
    - review OPEN → UNDER_REVIEW, and review UNDER_REVIEW → `false`;
    - resolveInfrastructure from UNDER_REVIEW → resolved with `isResolved = 1`, and from ESCALATED → `false`;
    - escalate LOW → `false`, HIGH → ESCALATED, and a null `countyId` gets the district's.
  - **Store merges:** `attachments` and `acknowledgedAt` are kept on every write.
  - **Shared resolve:** `resolve` on an ESCALATED infrastructure issue sets `metadata.status = 'RESOLVED'` and `resolvedByName = 'Ama Kollie'`; on an `ATTENDANCE_CONCERN` alert it leaves metadata unchanged; existing resolve tests are updated to the new signature.
  - **Use case:** `ResolveDistrictAlertUseCase` passes `{ id: 'deo-1', name: 'Ama Kollie' }`, or `'DEO'` without a profile.
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/electron/data/repositories/sqlite/business packages/application/src/use-cases/deo/resolve-district-alert.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): infrastructure issues read and acted on offline`.

### Task 5: Desktop use cases (desktop-client-nemis)

**Files:**
- `packages/types/src/deo-dashboard.ts`, one field per line:
  - `DeoInfrastructureStatus`;
  - `DeoInfrastructureIssue` (`id`, `schoolId`, `schoolName`, `category`, `title`, `note`, `severity`, `status`, `reportedAt`), mirroring `DistrictInfrastructureIssue`;
  - `DeoInfrastructureSummary`;
  - `DeoInfrastructureResult { districtId; district: {id,name}|null; county: {id,name}|null; summary; issues }`;
  - `DeoInfrastructureActionRequest { issueId: string; comments?: string }`;
  - `DeoInfrastructureEscalateRequest { issueId: string; reason: string }`.
- Create `packages/application/src/use-cases/deo/infrastructure-issues.ts` (+ `.test.ts`). It mirrors Task 1's helper over `DistrictInfrastructureRow`, with the same tests.
- Create `get-deo-infrastructure.ts` (+ test). The district comes from `currentDistrictId`. With no district, the result is empty, as in `get-deo-schools.ts`.
- Create `infrastructure-actions.ts` (+ test) with `ReviewInfrastructureIssueUseCase`, `ResolveInfrastructureIssueUseCase` and `EscalateInfrastructureIssueUseCase`. Each returns `boolean`. The officer is resolved as in Task 4. Escalate returns `false` for a blank reason without calling the store.
- `deo-application-service.ts` gains `getInfrastructure()`, `reviewInfrastructure(req)`, `resolveInfrastructure(req)` and `escalateInfrastructure(req)`. Wire them in `create-application-layer.ts`.

- [ ] **Step 1: Write the failing tests:**
  - the helper cases, mirroring Task 1;
  - the use case: an ATTENDANCE row in the double does not appear, because the read model already filters, so test the mapping only; header names; no district → empty;
  - actions: each passes the session district and officer to the store, and escalate with `'  '` → `false` with no store call.
- [ ] **Step 2:** Run `pnpm vitest run packages/application/src/use-cases/deo`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same run, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): infrastructure use cases`.

### Task 6: Desktop IPC, bridge and view model (desktop-client-nemis)

**Files:**
- `packages/types/src/ipc.ts`: add these channels and their `IpcContract` entries:
  - `DEO_INFRASTRUCTURE: 'deo:infrastructure'`
  - `DEO_INFRASTRUCTURE_REVIEW: 'deo:infrastructure-review'`
  - `DEO_INFRASTRUCTURE_RESOLVE: 'deo:infrastructure-resolve'`
  - `DEO_INFRASTRUCTURE_ESCALATE: 'deo:infrastructure-escalate'`
- `DeoApi` gains:
  - `getInfrastructure(): Promise<DeoInfrastructureResult>`
  - `reviewInfrastructure(req): Promise<boolean>`
  - `resolveInfrastructure(req): Promise<boolean>`
  - `escalateInfrastructure(req): Promise<boolean>`
- `apps/desktop/electron/security/validateIpc.ts`:
  - `assertDeoInfrastructureActionArgs`: one plain object with only `issueId` (a bounded non-empty string) and an optional `comments` (string, at most 2000 characters).
  - `assertDeoInfrastructureEscalateArgs`: only `issueId` and `reason`, where `reason` is a non-blank string of at most 2000 characters.
  - The list channel uses `assertNoArgs`.
- Create `apps/desktop/electron/ipc/handlers/deo/infrastructure.ts` (+ `.test.ts`) and register it in the DEO `index.ts`. Add the channels to `DEO_CHANNELS` and its test, and to the preload, `dashboard-bridge.ts` and `lib/ipc/deo.ts`.
- Create `packages/presentation/src/view-models/deo/deo-infrastructure-view-model.ts` (+ test).
  - State: `{ infrastructure: AsyncState<DeoInfrastructureResult>; acting: boolean; actionError: string | null }`.
  - `load()`.
  - `act(kind: 'review' | 'resolve' | 'escalate', issueId: string, text?: string): Promise<boolean>`. It calls the API, then `load()`. A rejection or a `false` reply sets `actionError = "Couldn't save this action. Try again."` and returns `false`.
  - `clearActionError()`.
- Register it in the presentation factory as `deoInfrastructure`, with the hook `useDeoInfrastructureViewModel`.

- [ ] **Step 1: Write the failing tests:**
  - **Validators:**
    - extra key → rejected;
    - empty `issueId` → rejected;
    - `comments` of 2001 characters → rejected;
    - escalate with `reason: ' '` → rejected;
    - list with any argument → rejected.
  - **Handlers:** they forward the request and return `.data`.
  - **Authorize list:** includes the 4 channels.
  - **View model:**
    - `act` success reloads and returns `true`;
    - `act` with a `false` reply sets `actionError`;
    - `act` rejection sets `actionError`;
    - `clearActionError` resets it.
- [ ] **Step 2:** Run `pnpm vitest run packages/presentation/src/view-models/deo apps/desktop/electron/ipc apps/desktop/electron/security`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same run, then `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(deo): infrastructure channels and view model`.

### Task 7: Desktop page and sidebar (desktop-client-nemis)

**Files:**
- Create `apps/desktop/renderer/components/deo/DeoInfrastructurePage.tsx`:
  - it reproduces the web page as Task 3 leaves it (`Nemis/apps/portal-web/src/app/government/deo/infrastructure/page.tsx`): markup, classes, icons, copy and modal;
  - the header place comes from the result;
  - "View School" goes to `/government/deo/schools/details?id=` (encoded), as `DeoSchoolsPage` links;
  - the modal shows `actionError`, stays open on failure, and closes on success;
  - it loads through `useRevalidateOnSync`;
  - `districtId === null` shows "No district assigned to your account."
- Create `apps/desktop/renderer/app/government/deo/infrastructure/page.tsx`.
- Modify `apps/desktop/renderer/components/shell/sidebarConfig.ts`: add `{ name: 'Infrastructure', href: '/government/deo/infrastructure', icon: Wrench }` after Transfers.
- Create `apps/desktop/renderer/app/government/deo/infrastructure/page.test.tsx`, modelled on `deo/alerts/page.test.tsx`.

- [ ] **Step 1: Write the failing page tests**, mirroring Task 3's:
  - header;
  - the All chip;
  - a `false` reply keeps the modal open with the message;
  - Escalate only on HIGH and CRITICAL;
  - no Review on UNDER_REVIEW;
  - "Escalated to County";
  - Retry;
  - no district;
  - the sidebar config has the Infrastructure item for a DEO (assert on the config export, as existing sidebar tests do).
- [ ] **Step 2:** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/infrastructure apps/desktop/renderer/components/shell`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm vitest run apps/desktop/renderer`, `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: PASS, apart from the known pre-existing fresh-login test.
- [ ] **Step 5: Commit:** `feat(deo): Infrastructure page on the desktop`.
