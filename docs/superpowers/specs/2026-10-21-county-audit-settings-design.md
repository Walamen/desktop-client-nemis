# County Audit Trail + Settings — design

Date: 2026-10-21 · Pages 11 and 12 of the County Admin port (portal-web → desktop).
Repos: `desktop-client-nemis` and `Nemis` (server `apps/Server`, web `apps/portal-web`).
Process: same as earlier County pages — native inline build in the main checkouts, full hexagonal path on the desktop (port + use case → ViewModel → SQLite adapter → IPC/preload/bridge/countyIpc facade), web quirks fixed on both sides.

## 1. Intent

Bring the County Admin's last two ComingSoon pages to the desktop.

- **Audit Trail** — lets a County Admin check what they and their county's DEOs and School Admins have been doing. Today the web page works but shows the whole country's activity to every County Admin, and its counts, search and filters disagree with each other. The desktop version must work offline and online.
- **Settings** — the web page is a placeholder (inputs never save, security buttons do nothing, preferences are not stored). Alvin: "just copy the web for now, all those features are coming soon".

## 2. Decisions made by Alvin

| # | Decision |
|---|---|
| A1 | A County Admin sees **their own** audit trail plus **every DEO and School Admin of their county**. |
| A2 | The audit trail works **both online and offline**. |
| A3 | The device keeps the **last 12 months** of audit history. |
| A4 | Fix the web quirks **on both sides**. |
| A5 | **Drop** the Live Updates switch on both sides: the 4th card becomes **This Month** on the web and **Last Synced** on the desktop. |
| A6 | **Total Actions counts the last 12 months on both sides**, so web and desktop show the same numbers. |
| S1 | Settings is an **exact copy** of the web page; the non-working controls stay non-working ("coming soon"). |

## 3. Audit Trail

### 3.1 Who is in scope (A1) — server rule, used everywhere

For a County Admin of county C, an audit row is in scope when its `userId` is:

1. the County Admin themself, or
2. a user with an **active** `DEO` link whose `countyId = C` or whose district's `countyId = C`, or
3. a user with an **active** `INSTITUTION_ADMIN` link whose institution's `countyId = C`.

Countyless pool DEOs are not in scope. Membership is by the user's **current** active links (Claude's call: a DEO who moves county takes their history with them; simplest rule that matches how the Users page scopes people).

One server helper (`countyAuditActorIds(tx, countyId, selfId)` or a Prisma `UserWhereInput`) computes this and is used by the list, the stats and the desktop snapshot so the three can never disagree. SUPER_ADMIN / MINISTRY_ADMIN keep their current unscoped view.

### 3.2 Server fixes (Nemis `apps/Server/src/audit`)

| Quirk today | Fix |
|---|---|
| `GET /audit/ceo` ignores the caller: every County Admin sees every county. | Controller passes the caller; a County-Admin-only caller is confined by §3.1. |
| `GET /audit/stats/county/:countyId` lets a County Admin read any county, counts *every* user linked to the county (teachers, staff…) and the action breakdown (`groupBy`) is not scoped at all. | County-Admin-only caller may request only their own county (403 otherwise); counts and breakdown use §3.1. |
| `findForCEO` `console.log`s every row it returns. | Remove the logging. |
| Search only filters the 50 rows on screen (client side). | New `search` query param, applied server-side over the whole scoped log: actor first/last name, actor email, action label, entity label (case-insensitive contains). |
| No paging past the first 50. | `limit`/`offset` already exist; the client uses them ("Load more"). Response keeps `total` (of the filtered query). |
| Entity filter options (User, Institution, Student, Teacher, School) don't match stored `entityType` values (`Staff`, `StudentTransfer`, `institutions`, `feeRule`…): "Teacher" and "School" never match anything; the client-side `includes` check disagrees with the server's exact match. | Stats response gains `entityTypes: {value, label}[]` = distinct `entityType` values in scope, labelled via `ENTITY_MAPPINGS` (extended with the explicit types the services write; fallback: humanised value). The dropdown is built from it; the filter is an exact match on `value`, server-side only. |
| Action filter lists Login/Logout, which nothing on the server ever writes, and omits Export/Import/Search. | Action options = the actions present in the scoped `actionStats`, labelled via `ACTION_MAPPINGS`. |
| Field and column named `scoop`. | Renamed `scope` (DTO, `@nemis/types`, web column header "Scope"). |
| `scope` label uses the actor's *first* org link, whatever it is. | Uses the actor's active link in priority School Admin → "School", DEO → "District", County Admin → "County", else "System". |

Stats (A6): `totalLogs` counts the **last 12 months** (sub-label "Last 12 months" on both sides); the response gains `monthLogs` (since the 1st of the current month, server time) for the web's 4th card (A5). The list itself is not windowed on the web.

### 3.3 Web fixes (portal-web `components/county/AuditSection.tsx`)

- Search box sends `search` to the server (debounced ~300 ms); no client-side filtering remains.
- Action and Entity dropdowns built from the stats response (§3.2).
- "Load more" appends the next 50 (same pattern as the notifications page's `mergePage`/`hasMore`).
- Column "Scope".
- Stat cards and list now count the same people.
- Live Updates card removed; 4th card "This Month" from `monthLogs` (A5).

### 3.4 Desktop data

**Server snapshot** (`desktop-provisioning.service.ts`), COUNTY scope only, new collection `auditLogs`:

- rows in §3.1 scope with `timestamp ≥ now − 365 days`;
- delta pulls: `timestamp > since` (audit rows are append-only, no `updatedAt`); the builder may add a small overlap to cover rows committed just after `since`;
- fields: `id, userId, action, entityType, entityId, timestamp`, plus denormalised `actorName` and `actorScope` (§3.2 label), so the desktop needs no extra user/org data. `changes`, `metadata` and `userEmail` are **not** shipped (size + personal data; the page doesn't show them) — Claude's call.
- `@nemis/types` `desktop-provisioning.ts` gains the field.

**Desktop migration 039**:

- `audit_logs(id PK, userId, action, entityType, entityId, timestamp, actorName, actorScope)` with an index on `timestamp`; pull-only (no outbox triggers);
- `counties` gains `isActive`, `createdAt`, `updatedAt` (for Settings, §4);
- forces a full resync (`UPDATE sync_metadata SET lastFullResyncAt = NULL`).

**Importer**: specs for `auditLogs` and the new county columns; `PROVISIONING_COLLECTIONS` gains `auditLogs`. After each import the device **deletes audit rows older than 365 days** (A3), so the table never grows past the window.

### 3.5 Desktop page

Port of `AuditSection` + `audit/page.tsx`, same layout and copy, reading only from the device (works offline and online, A2):

- **Cards:** Total Actions (sub-label "Last 12 months"), Today, This Week (last 7 days from midnight, as the server does), **Last Synced** (the sync status store's last successful pull, relative time; "Never" before the first) (A5).
- **Filters:** search (actor name, action label, entity label), Action and Entity dropdowns built from the rows present — same rules as §3.2.
- Action and entity labels: the desktop keeps its own copy of `ACTION_MAPPINGS` / `ENTITY_MAPPINGS` (with the same fallback) so search and labels match the web — Claude's call.
- **Timeline table:** Date, Action (icon + "Created Student"), Actor, Scope; newest first; 50 per page with Load more.
- States: loading, error ("Error loading audit logs. Please try again later."), empty ("No audit logs found").
- Refreshes on sync (`useRevalidateOnSync`).

Hexagonal path: `ICountyAuditReadModel { getStats(now), list(query) }` port, `GetCountyAuditStatsUseCase` / `GetCountyAuditLogsUseCase`, `CountyAuditViewModel` (filters, page, hasMore, loadMore), `SqliteCountyAuditReadModel`, IPC channels `county:audit:stats` / `county:audit:list` (COUNTY_ADMIN-only), validators, preload, bridge, countyIpc facade, in-memory fake for tests.

## 4. Settings (S1)

Exact port of `government/county/settings/page.tsx`: title "Settings", subtitle, "Back to Dashboard" button, Profile Settings card (empty inputs with the web's placeholders, disabled County field filled with the county name, Save/Cancel that do nothing), Security card (three buttons that do nothing), Preferences card (three unsaved checkboxes, same defaults), County Information card.

County Information reads from the device: county name, code, number of districts, number of schools, status (Active/Inactive), created and last-updated dates — the last three from the new `counties` columns (§3.4). Hexagonal path: `GetCountySettingsUseCase` → `CountySettingsViewModel` → SQLite read → IPC `county:settings` → bridge/facade. "Office: {name} County Education Office" copy kept.

No web changes for Settings (Alvin: copy as is).

## 5. Non-goals

- Making any Settings control work.
- Audit detail drill-down (`changes`/`metadata`), exports, or teachers/other staff in the county audit.
- Changing the DEO or School Admin audit views.

## 6. Release order

**Server ships first**: the desktop's migration 039 forces a full resync expecting `auditLogs` and the new county columns; an old server sends neither (the importer treats a missing collection as empty, so nothing breaks — the page is just empty until the server is updated).

## 7. Testing

- Server: scope helper (own / DEO by county / DEO by district / School Admin / pool DEO excluded / teacher excluded); `findForCEO` confined + search + entity exact match; stats 403 for another county, scoped counts and breakdown, `entityTypes`; snapshot `auditLogs` window + since + COUNTY-only.
- Web: AuditSection search → query param, Load more, dropdowns from stats, Scope header.
- Desktop: migration + importer + 365-day prune; read model (stats windows, filters, search, paging); VM; audit page and settings page tests.

## 8. Calls Claude made (check while reading)

- Scope by the actor's **current** active links (§3.1).
- Snapshot omits `changes`, `metadata`, `userEmail` (§3.4).
- Delta pull by `timestamp > since`, small overlap allowed (§3.4).
- 365-day prune after each import (§3.4).
- Action/entity dropdowns built from the data actually present (§3.2, §3.5).
- Desktop copies the label mappings (§3.5).
