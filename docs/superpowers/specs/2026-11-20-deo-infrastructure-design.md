# DEO sub pages, piece 5: Infrastructure

**Date:** 2026-11-20
**Repos:** Nemis (server, portal-web) and desktop-client-nemis
**Size:** project (server rewrite + shared-resolve change + web fixes + desktop slice with offline actions)
**Release order:** server first, then web, then desktop

## Intent

School admins report infrastructure problems (a broken roof, no water, an unsafe building) from their web Infrastructure page (`POST /school-reports/infrastructure`). Each report becomes an `INFRASTRUCTURE_ISSUE` alert:
- `metadata.category` holds the category;
- `metadata.status` is `OPEN`, `UNDER_REVIEW`, `ESCALATED` or `RESOLVED`;
- `metadata.submittedAt` and `metadata.submittedByName` record who filed it and when.

The District Education Officer is meant to review, resolve, or escalate each issue to County. Escalated issues appear on County's Infrastructure page.

**Today the DEO can't do that properly.**

The web page `/government/deo/infrastructure` is in neither sidebar, and the desktop has no route at all. What the web page shows:
- **Every open alert in the district**, of every type: attendance concerns, teacher shortages, even teachers' requests to their own school admin. This duplicates the Alerts page.
- **Rows the server invents:**
  - "utilities" from legacy `metadata.facilities`;
  - capacity and staffing, which are dated with the school's creation date;
  - "inspection", from inspection records that nothing creates.

  These rows have made-up ids (`${schoolId}:utilities`), so **their Review, Resolve and Escalate buttons always fail**.
- **An invented status:** CRITICAL shows as "Escalated" and everything else as "Open". The real `metadata.status` is ignored.
- A fake "Buchanan · Grand Bassa" header.
- No "All" status chip. Once a status is picked, you can't get back to all issues.
- A failed action shows nothing; it only goes to the console.

The same issues also appear on the Alerts page and the DEO dashboard. Resolving one there sets `isResolved` but leaves `metadata.status` at `OPEN`, so the school and County keep seeing it as open.

## Goals

- **Server:**
  - the infrastructure list shows only real, open, school-filed infrastructure issues, by the district alert rule, with their real status;
  - Review, Resolve and Escalate use the same rule, enforce the page's allowed transitions, and record the officer's real name;
  - the shared alert resolve (Alerts page and dashboard Mark Reviewed) also sets `metadata.status` to `RESOLVED` for an infrastructure issue.
- **Web:**
  - the page keeps its layout;
  - real header, an "All" status chip, Retry on load errors, and visible action errors;
  - a sidebar entry.
- **Desktop:**
  - the same page, offline;
  - Review, Resolve and Escalate work offline through the alerts outbox;
  - the existing offline resolve also sets the status;
  - a sidebar entry.

## Non-goals

- **Letting school admins file issues from the desktop.** That is a school-admin feature; the desktop's school-admin Infrastructure page stays a read-only table. DEO devices see issues filed on the web once they sync.
- **No resolved-issue history on this page.** The page lists open (unresolved) issues, as today; resolved ones drop off.
- **No change to County's Infrastructure page,** or to how County acts on escalated issues.
- **No "facility gaps" from registration data.** Alvin rejected it: the fields default to "no".
- **No change to the Alerts page or dashboard lists,** beyond what Resolve writes.
- **No sidebar entries for Reports & Compliance or Alerts on the web.** They stay as they are.

## Anti-goals (a failure even if it "works")

- A row on this page that is not a real infrastructure issue, or a button that cannot succeed.
- A status shown that differs from what the school and County see for the same issue.
- An issue resolved from Alerts or the dashboard that still reads "Open" anywhere.
- A DEO acting on another district's issue, on either app. On the desktop, the district comes only from the session.
- A failed action that looks like it worked.

## Decided content (Alvin, 2026-11-20)

**Rows.** Only alerts of type `INFRASTRUCTURE_ISSUE` are listed. The rule:
- the alert is unresolved (`isResolved = false`);
- it is tagged with the district, or raised against an **active** school of the district (the Alerts rule, `districtAlertWhere`);
- a teacher's request to their school admin (`isSchoolStaffRequest`) never counts.

| Field | Source |
|---|---|
| `status` | `metadata.status` if it is one of `OPEN`, `UNDER_REVIEW`, `ESCALATED`; otherwise `OPEN`. An unresolved issue whose metadata says `RESOLVED` shows as `OPEN` (Claude's call; it can only arise from older data). |
| `category` | `metadata.category`, else `"Infrastructure"` |
| `reportedAt` | `metadata.submittedAt` if it is a valid ISO date, else the alert's `createdAt` |
| `schoolId` / `schoolName` | the alert's school. A district-tagged issue with no school shows the district name, and its "View School" link is hidden, as today. |
| `title`, `note`, `severity` | the alert's `title`, `description` and `severity` |
| Order | severity CRITICAL → LOW, then newest `reportedAt`, then `id` |
| `summary` | `totalIssues` (rows), `critical`, `open` (`OPEN` + `UNDER_REVIEW`), `escalated`. Same shape as today. |

**Actions** (the page's existing rules, now also enforced by the server):

| Action | Allowed when | Writes (`metadata`, merged) | Also |
|---|---|---|---|
| Review | status `OPEN` | `status: "UNDER_REVIEW"`, `reviewedAt`, `reviewedById`, `reviewedByName`, `reviewComments` (or null) | — |
| Resolve | status `OPEN` or `UNDER_REVIEW` | `status: "RESOLVED"`, `resolvedAt`, `resolvedById`, `resolvedByName`, `resolutionComments` (or null) | `isResolved = true`, `resolvedAt`, `resolvedBy` |
| Escalate | status `OPEN` or `UNDER_REVIEW`, and severity `HIGH` or `CRITICAL`; a reason is required | `status: "ESCALATED"`, `escalatedAt`, `escalatedById`, `escalatedByName`, `escalationReason`, `escalatedToCounty: true` | `countyId` = the district's county when it is null |

- **`…ByName`:** the officer's first and last name. If neither is set, use `"DEO"`. This replaces the email-prefix name used today.
- **Refusals:**
  - an issue outside the rule gives `NotFoundException("Infrastructure issue not found")`;
  - a disallowed transition gives `BadRequestException("This issue can no longer be <reviewed|resolved|escalated>")`;
  - escalating without a reason gives `BadRequestException("A reason is required to escalate")`.

**Shared resolve** (Alerts page Resolve, and dashboard Mark Reviewed, on both apps):
- When the alert is an `INFRASTRUCTURE_ISSUE`, it also merges `metadata.status: "RESOLVED"`, `resolvedAt`, `resolvedById` and `resolvedByName` into the metadata.
- This applies **even when the issue was escalated**: a DEO resolving it anywhere closes it everywhere (Claude's call).
- The Infrastructure page itself still shows no Resolve button on escalated issues, as today. It only lists unresolved issues, so a resolved one leaves the page.

**Page changes (both apps):**
- **Header place:** district · county, the same as the other DEO pages.
- **Status chips:** `All` (the default), `Open`, `Under Review`, `Escalated`, each with its count. Severity chips are unchanged.
- **Load error:** "Failed to load infrastructure issues." with a `Retry`.
- **Action error:** the modal stays open and shows the server's message (or "Couldn't save this action. Try again.") above its buttons.
- **"View School"** goes to School detail: the web `/government/deo/schools/${id}`, the desktop `/government/deo/schools/details?id=`.

**Sidebar (both apps):** "Infrastructure" (href `/government/deo/infrastructure`, a Lucide `Wrench` icon) in the management group, after Transfers.

## Approaches considered

1. **Rewrite the list in place on the server; desktop reads synced alerts and acts offline through the alerts outbox (chosen).**
   - Same route and response shape on the server.
   - The desktop already syncs every district alert, metadata included.
   - The server's sync applier already accepts alert updates from a district device, with the alert's whole `metadata` replaced and a base `updatedAt` conflict check.
   - This matches how resolving alerts already works offline.
2. **Desktop actions that need the internet.** Simpler, but it breaks the offline-first rule every other DEO action follows. Rejected.
3. **A separate infrastructure table.** It would duplicate data the alerts already carry. Rejected.

Alvin approved approach 1 on 2026-11-20.

## Design

### Server (Nemis `apps/Server/src/districts/`)

**`getDistrictInfrastructure(districtId, user)`:** keep `findOne` and `enforceDistrictAccess`. Then:
1. Load the active school ids.
2. Load the unresolved `INFRASTRUCTURE_ISSUE` alerts matching `districtAlertWhere` (from `district-alerts.ts`).
3. Drop teacher requests.
4. Map rows and sort as decided, then build the summary.
5. Look up school names with one `institution.findMany` (Alert has no Prisma relation to Institution).

Then:
- Delete the synthetic-row code and any helper only it used, such as `getSeverityRank` if nothing else uses it.
- The response type (`DistrictInfrastructureIssue` in `packages/types/src/deo.ts`) keeps its fields. Its `status` union stays `"OPEN" | "UNDER_REVIEW" | "ESCALATED"`.

**Infrastructure actions:**
- `reviewInfrastructureIssue`, `resolveInfrastructureIssue` and `escalateInfrastructureIssue` find the issue with `districtAlertWhere` plus `type: INFRASTRUCTURE_ISSUE`, not `districtId` alone.
- They enforce the transitions above and use the real name.
- `getInfrastructureIssueById` uses the same rule.

**Shared resolve:**
- `resolveInDistrict` (from the Alerts piece) adds the infrastructure metadata merge when `alert.type === INFRASTRUCTURE_ISSUE`.
- The officer name comes from the same lookup as the infrastructure actions; share one private `officerName(userId)` helper.

### Web (portal-web)

- **`app/government/deo/infrastructure/page.tsx`:**
  - the header place, as `deo/reports/page.tsx` does it;
  - the `All` status chip;
  - Retry on the load error;
  - the action error in the modal;
  - "View School" stays a link to `/government/deo/schools/${schoolId}`.
- **`components/sidebarConfig.ts`:** the Infrastructure nav item after Transfers in the DEO section. The `pageTitles` entry already exists.
- **Page test:**
  - real header;
  - the All chip resets the filter;
  - a failed action shows the message and keeps the modal open;
  - Escalate is offered only for HIGH or CRITICAL and needs a reason;
  - no Review on `UNDER_REVIEW`;
  - "Escalated to County" shown for `ESCALATED`.

### Desktop (desktop-client-nemis)

**Read model** (`IDistrictOverviewReadModel` + SQLite + in-memory double):
- `listInfrastructureIssues(districtId)` returns unresolved `INFRASTRUCTURE_ISSUE` alerts by the same rule as `listDistrictAlerts`: district-tagged or an active school, no teacher requests, no county-level alerts.
- Each row has `id`, `title`, `description`, `severity`, `institutionId`, `schoolName`, `metadata` (parsed safely: an object, else `{}`) and `createdAt`.

**Store** (`SqliteDistrictAlertStore`, the offline write side):
- `review(districtId, alertId, by: { id, name }, comments, at)`, `resolveInfrastructure(...)` and `escalate(districtId, alertId, by, reason, at)`.
- Each updates the alert's `metadata` (merged in code, then written whole) and `updatedAt`. Resolve also sets `isResolved`, `resolvedAt` and `resolvedBy`.
- Each authorises with the same `WHERE` rule as the existing `resolve`, plus `type = 'INFRASTRUCTURE_ISSUE'`, and checks the transition.
- Each returns `boolean`: `false` when nothing changed.
- The outbox trigger queues each change.
- The existing `resolve` (dashboard Mark Reviewed, Alerts Resolve) also merges the infrastructure metadata when the row is an `INFRASTRUCTURE_ISSUE`.

**Application:**
- `GetDeoInfrastructureUseCase` maps rows exactly as the server does, with one pure helper that mirrors the server's mapping (status normalisation, category, reportedAt, order, summary). It returns `DeoInfrastructureResult = { districtId, district, county, summary, issues }`. The issue fields mirror `DistrictInfrastructureIssue`.
- `ReviewInfrastructureIssueUseCase`, `ResolveInfrastructureIssueUseCase` and `EscalateInfrastructureIssueUseCase` take the district from `currentDistrictId` and the officer from the session user (id, first and last name).
- They reject an empty escalation reason before calling the store. They return `boolean`.

**IPC** (all in `DEO_CHANNELS`, validated strictly):
- `deo:infrastructure` (no arguments);
- `deo:infrastructure-review` (`{ issueId, comments? }`);
- `deo:infrastructure-resolve` (`{ issueId, comments? }`);
- `deo:infrastructure-escalate` (`{ issueId, reason }`, with a non-empty reason).

Ids and text are bounded.

**Presentation and renderer:**
- `DeoInfrastructureViewModel`: `load()`, and `act(kind, issueId, text?)`.
- `act` reloads after the call. A `false` reply, or a rejection, sets an action error carrying the message "Couldn't save this action. Try again."
- `DeoInfrastructurePage` reproduces the web page with the changes above.
- The route is `app/government/deo/infrastructure/page.tsx`.
- The sidebar entry goes after Transfers.
- The page reloads after each sync.

## Constraints

- **Scope:**
  - The server checks district access on list and on every action.
  - The desktop never takes a district id from the renderer, and its store's `WHERE` clause is the authorisation.
- **Parity:** the server and desktop row mapping, order and summary match, and so do the action transitions.
- **Offline-first:** desktop actions write locally and sync. A conflict (the server issue changed meanwhile) surfaces through the existing sync-conflicts flow, as for alerts.
- **Repo rules:**
  - Never commit desktop `apps/desktop/package.json` or portal-web `tsconfig.tsbuildinfo`.
  - No pushes.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Server specs:**
  - only `INFRASTRUCTURE_ISSUE` rows appear (an `ATTENDANCE_CONCERN` alert and a teacher request are absent);
  - an inactive school's issue and another district's issue are absent;
  - no synthetic rows;
  - the real `metadata.status` is shown, with unknown values falling back to OPEN;
  - category and reportedAt fallbacks work;
  - order and summary are as decided;
  - each action's allowed and refused transitions, with their messages;
  - escalate without a reason is refused;
  - the real officer name is recorded;
  - another district's DEO gets 403;
  - shared resolve sets `metadata.status: RESOLVED` for an infrastructure issue (including an escalated one) and leaves other alert types' metadata untouched;
  - existing alerts and incidents specs still pass.
- **Web:** typecheck, lint, Vitest, and the page test above.
- **Desktop:**
  - read-model and store tests for each transition, the authorisation, the outbox queueing, and the metadata merge on the existing resolve;
  - use-case tests mirroring the server's mapping;
  - IPC validator tests;
  - view-model action-error tests;
  - a renderer page test mirroring the web one;
  - the sidebar shows Infrastructure for a DEO.

## Facts and calls settled after the builder check (Claude)

- **The sync applier accepts these offline changes.** Its `alert()` merge:
  - allows a school alert in the device's scope, and a district-only alert of the device's district;
  - checks the base `updatedAt`;
  - writes the record's whole `metadata`.
- **County's page reads the fields this design writes:**
  - `metadata.status`, `category`, `submittedAt`, `reviewedAt`, `reviewedByName`, `reviewComments`, `escalatedAt`, `escalatedByName` and `escalationReason`;
  - `isResolved` only as a fallback.

  The merge must keep the fields it does not write (`attachments`, `acknowledged*`, `submittedBy*`).
- **County finds escalated issues by `alert.countyId`.**
  - School-filed issues always carry the school's county.
  - An alert created through the generic `NotificationsService.createAlert` could be district-only with a null `countyId`.
  - **Claude's call:** Escalate also sets `countyId` from the district when it is null, on both the server and the desktop store (the desktop `alerts` row has a `countyId` column and the district row carries its county).
  - Otherwise an escalation would silently never reach County.
- **The officer's name on the desktop** comes from the session user's synced profile (`IDistrictOverviewReadModel.getUserProfile(currentUserId)`): first and last name, else `"DEO"`.

## Left to the builder

- File locations and helper names.
- Whether the desktop mapping helper sits next to the use case or in `district-alerts`-style shared code.

## Remaining order after this piece

Incidents, then Analytics.
