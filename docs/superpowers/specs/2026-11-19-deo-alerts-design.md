# DEO sub pages, piece 3: Alerts

**Date:** 2026-11-19
**Repos:** Nemis (server, portal-web) and desktop-client-nemis
**Size:** project (server rule + access fix + web page fix + desktop slice)
**Release order:** server first, then web, then desktop

## Intent

A District Education Officer needs one place to work through the district's alerts: what is open now, what was dealt with, and which school each one is about. They also need to mark an alert reviewed once they have acted on it.

The web page `/government/deo/alerts` exists, but it disagrees with the rest of the DEO portal:

- **It lists a different set of alerts from the dashboard.** It shows only alerts tagged with the district, so an alert raised against one school never appears. It also shows teachers' requests to their own school admin (edit attendance, edit grades) and lets the DEO resolve them. The dashboard (and the later Incidents page) shows school alerts too, hides those requests, and refuses to resolve them.
- **The server has no access check.** `GET /districts/:id/alerts` and `PATCH /districts/:id/alerts/:alertId/resolve` never check that the caller belongs to the district. Any DEO or County Admin can list any district's alerts, and any DEO can resolve them.
- **It shows things that aren't real or true.** The header always reads "Buchanan · Grand Bassa". A failed Resolve only reaches the console. An alert never says which school it is about.

On the desktop, the route is a raw table of the synced `alerts` collection. The desktop sidebar links to it; on the web the page is reachable only by URL.

Two server notification links point at pages piece 0 deleted:
- alert notifications go to `/government/deo/submissions`;
- message notifications go to `/government/deo/communications`.

## Goals

- **One alert rule, the dashboard's:** an alert belongs to the district when it is tagged with the district, or raised against an **active** school of the district. Teachers' requests to their own school admin are excluded. The Alerts page, the dashboard and Resolve all use it, on both apps.
- **Server:**
  - rewrite the alerts list to use the rule, and add district access checks to list and resolve;
  - make resolve apply the same checks as the dashboard's Mark Reviewed;
  - fix the two dead notification links.
- **Web:** the real district · county header, the school name on each alert, and a visible error when Resolve fails. The rest of the layout is unchanged.
- **Desktop:** a `DeoAlertsPage` at `deo/alerts` with the same layout, computed offline. Resolve reuses the offline Mark Reviewed that already exists (`deo:resolve-alert`).

## Non-goals

- No web sidebar entry. The desktop sidebar entry stays.
- No new alert types, no creating or editing alerts, and no un-resolving.
- No change to the Incidents page. It is a later sub page, and it may end up reusing this rule.
- No change to `getDistrictNotifications` beyond the two links.

## Anti-goals (a failure even if it "works")

- The Alerts page's open count disagreeing with the dashboard's open alerts for the same data.
- A DEO seeing or resolving another district's alerts, on either app. On the desktop, the district comes from the session, never from the renderer.
- A DEO resolving a teacher's request to their school admin.
- A failed Resolve that looks like it worked.

## Decided content (agreed with Alvin, 2026-11-19)

**Which alerts are listed:** the dashboard's rule above, as Alvin chose. Within the rule:

| Element | Rule |
|---|---|
| Filter | Open Alerts (default) / Resolved / All, as today |
| Order | unresolved first, then severity CRITICAL → HIGH → MEDIUM → LOW, then newest `createdAt` first, then `id` |
| Page size | 15, as today; "Page n of m (t total)" and the arrows only when there is more than one page |
| Each alert | severity badge, type (underscores → spaces), created date, the Resolved chip when resolved, title, description, and "Resolved on …" when resolved — all as today |
| School name (Claude's call) | shown when the alert is raised against a school: one line "School: {name}" under the description. Without it, a school alert can't be told apart. The name comes from the school row; an alert tagged only with the district shows no line. |
| Header | district · county names, as on the Schools and Reports & Compliance pages; parts left out when not loaded |
| Resolve | only on unresolved alerts. Success refreshes the list. Failure shows "Couldn't resolve this alert. Try again." next to that alert's button. On the desktop, after a `false` reply the list reloads, and the same message shows only if the alert is still unresolved. |
| Empty | "No open alerts — all clear!" for Open, "No alerts found." otherwise, as today |
| Error | "Failed to load alerts." with a Retry |

**Notification links** (server `getAlertActionUrl` and `getDistrictNotifications`):
- `DATA_VALIDATION_ISSUE`, `PENDING_APPROVAL` and `NEW_SCHOOL_REGISTRATION` → `/government/deo/alerts` (was `/submissions`);
- `INFRASTRUCTURE_ISSUE` keeps `/government/deo/infrastructure`, a later sub page;
- other types keep `/government/deo`;
- message notifications → `/government/deo/messages` (was `/communications`).

## Approaches considered

1. **Reuse the dashboard rule on both sides, with the existing routes and offline resolve (chosen).**
   - The server pulls the rule out of `getDistrictIncidents` into one helper.
   - The alerts list and resolve use that helper; `getDistrictIncidents` and `markIncidentReviewed` keep working through it.
   - The desktop adds one read-model query next to `listOpenAlerts`, and pages locally.
2. **Point the web page at the incidents endpoint.** It returns only open alerts, at most 50, with no paging and no resolved history. Rejected.
3. **Desktop reads alerts from the server.** That loses offline use, though every alert is already synced. Rejected.

Alvin approved approach 1 on 2026-11-19.

## Design

### Server (Nemis `apps/Server/src/districts/`)

**The rule**, used by both alerts and incidents: one place builds the alert `where` for a district.
- It reads `{ OR: [{ districtId }, { institutionId: { in: activeSchoolIds } }] }`.
- Callers filter out `isSchoolStaffRequest(alert.metadata)` after the query.
- That filter can't be expressed in Prisma `where` on JSON portably, so callers must page **after** filtering: fetch the matching rows, filter, sort, then slice. Districts hold tens to a few hundred alerts, so this is fine.

**`getDistrictAlerts(districtId, options, user)`:**
- Add `user` and call `ensureDistrictAccess(districtId, user)`, as `getDistrictIncidents` does. The controller passes `@CurrentUser()`.
- `isResolved` filters the rule's set when given.
- Order: unresolved first, then severity rank, then `createdAt` desc, then `id`.
- Each item gains `institutionId: string | null` and `schoolName: string | null`, the latter from the school.
- `meta` is unchanged: `page`, `limit`, `total` after filtering, `totalPages`.

**`resolveDistrictAlert(districtId, alertId, user)`:**
- Call `ensureDistrictAccess`.
- The alert must belong to the district by the rule. Otherwise `BadRequestException("Alert does not belong to this district")`, as today.
- A school staff request → `BadRequestException("This is a request for the school's administrator to answer")`, the same text as `markIncidentReviewed`.
- Resolving an already resolved alert returns it unchanged (claude's call: idempotent, matching the desktop store, which leaves it alone).
- `markIncidentReviewed` and `resolveDistrictAlert` share one implementation.
- Roles are unchanged (resolve stays DEO and SUPER_ADMIN).

**Links:** update `getAlertActionUrl` and the two `"/government/deo/communications"` literals in `getDistrictNotifications`.

### Web (portal-web)

- `AlertItem` (or wherever the web alert type lives) gains `institutionId` and `schoolName`.
- `alerts/page.tsx`:
  - the header place via `useGetDistrictSettingsQuery`, as the Reports & Compliance page now does;
  - the "School: {name}" line;
  - the per-alert Resolve error message;
  - Retry on the load error.
- The resolve mutation also invalidates whatever tag the dashboard's incidents query provides, so the dashboard count follows a resolve.
- Page test (Vitest):
  - the real header place;
  - the school line shown or absent;
  - the Resolve failure message;
  - the Open empty text;
  - pagination shown only when `totalPages` > 1.

### Desktop (desktop-client-nemis)

**Rule alignment:** `listOpenAlerts` and `SqliteDistrictAlertStore.resolve` limit school alerts to **active** schools of the district (`i.isActive = 1`), matching the server. The dashboard follows automatically.

**Read model:** `listDistrictAlerts(districtId, filter: 'open' | 'resolved' | 'all')` → rows in the page's order, each with:
- `id`, `type`, `severity`, `title`, `description`;
- `institutionId`, `schoolName`;
- `isResolved`, `resolvedAt`, `createdAt`.

It uses the same rule (`notSchoolStaffRequest`, district or active school). County-level alerts on the device are excluded, as in `listOpenAlerts`.

**Use case:** `GetDeoAlertsUseCase` (query `{ filter, page }`).
- The district comes from `currentDistrictId`.
- It pages 15 per page in code.
- It returns `DeoAlertsResult = { districtId, district, county, alerts, meta: { page, limit, total, totalPages } }`.
- A page past the end returns the last page. With no district: `districtId: null`, no alerts, and `total` 0.

**Wiring**, the same as earlier DEO slices:
- `deo:list-alerts` validates `{ filter, page }`: filter must be one of the three values, and page a positive integer.
- `DEO_CHANNELS`, preload, bridge, `lib/ipc`.
- `DeoAlertsViewModel` with `load(filter, page)` and `resolve(alertId)`.
  - Resolve calls the existing `deo:resolve-alert`, then reloads the current filter and page.
  - It records a per-alert error when the call rejects, or when it replied `false` and the reloaded list still shows that alert unresolved.

**Renderer:** `components/deo/DeoAlertsPage.tsx` reproduces the web page with the changes above. `app/government/deo/alerts/page.tsx` replaces the raw table. It reloads after each sync, as the other DEO pages do.

## Constraints

- **Scope:**
  - The server checks `ensureDistrictAccess` on list and resolve.
  - The desktop takes the district only from the session. The `WHERE` clause in the store stays the resolve authorisation.
- **One copy of the rule per app:**
  - Server: one helper, used by alerts and incidents.
  - Desktop: the read-model SQL shares the existing `notSchoolStaffRequest` and district/active-school condition.
- **Resolve stays offline-first on the desktop:** write locally, queue, sync. The server re-checks scope in the sync applier, as today.
- **Repo rules:**
  - Never commit desktop `apps/desktop/package.json` or portal-web `tsconfig.tsbuildinfo`.
  - No pushes.
  - Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification

- **Server:**
  - Alerts list:
    - a school alert is listed;
    - a staff request is not;
    - an inactive school's alert is not;
    - another district's alert is not;
    - the filters and the order;
    - paging counts after filtering.
  - Access checks: another district's DEO gets 403 on list and on resolve.
  - Resolve:
    - refuses a staff request;
    - refuses another district's alert;
    - resolves a school alert;
    - is idempotent.
  - Incidents specs still pass.
  - The notification links.
- **Web:** type-check, lint and Vitest with the page test above.
- **Desktop:**
  - Read-model tests: filters, order, school name, staff request excluded, inactive school excluded, county alert excluded.
  - Updated `listOpenAlerts` and store tests for an inactive school.
  - Use-case paging: the last page, past the end, and no district.
  - IPC validator tests.
  - View-model resolve-then-reload, and the `false` reply.
  - Renderer page test, mirroring the web one.

## Facts checked while writing (answers to the builder check)

- **Resolved alerts reach the desktop.**
  - The provisioning snapshot selects alerts by institution / county / district with only the `since` delta filter; it has no `isResolved` filter.
  - So the desktop's Resolved and All views hold the same history as the server, as of the last sync.
- **Who passes the access check:** `ensureDistrictAccess` lets in:
  - SUPER_ADMIN;
  - a COUNTY_ADMIN whose county holds the district;
  - a DEO of that district.

  The DEO alerts page is the only portal-web caller of these two routes (County uses `/counties/:id/alerts`), so tightening breaks no one.
- **The dashboard's alert count.**
  - The web dashboard counts open alerts through `getDistrictIncidents`, which stops at 50. The desktop dashboard counts them all.
  - With more than 50 open alerts, the web dashboard shows 50 while the Alerts page shows the true total.
  - That cap is pre-existing and belongs to the Incidents piece. Here, "agree" means the same set of alerts.
- **Severity sorts correctly.** `AlertSeverity` is declared LOW, MEDIUM, HIGH, CRITICAL, so Prisma `severity: "desc"` already gives CRITICAL first. The rank-in-code rule just has to agree with it.
- **A false reply from desktop resolve.** `SqliteDistrictAlertStore.resolve` returns `false` both for "not yours / a teacher's request" and for "already resolved". Claude's call:
  - the view model reloads after any reply;
  - the error message shows only if that alert is still listed as unresolved after the reload.

  So an alert another device already resolved simply moves to Resolved, and the store keeps its existing tests.
- **The sync applier does not re-check teacher requests.**
  - It checks only that the alert belongs to the device's district or schools (`desktop-sync-applier.ts` `alerts` scope).
  - The desktop store already refuses teacher requests, so only a tampered client could push one.
  - Claude's call: leave the applier as it is in this piece, and list it as a follow-up.
- **Notification targets exist.** `/government/deo/alerts` and `/government/deo/messages` are live on both apps.

## Left to the builder

- File locations and the helper's name.
- Whether the server sorts in SQL plus code or wholly in code, as long as the order is as decided.

## Remaining order after this piece

School Reports Review, Infrastructure, Incidents, Analytics.
