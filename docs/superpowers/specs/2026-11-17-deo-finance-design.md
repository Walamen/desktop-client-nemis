# DEO Finance — design (piece 8 of 10)

Date: 2026-11-17. Repos: desktop-client-nemis and Nemis, branch `feat/deo-finance` in both, cut from `main`.
Web layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.9.

## Goal

Replace the desktop's raw fee tables at `/government/deo/finance` with the web's Finance Monitoring page: three tabs (Overview, Flagged Activity, Audit Logs), read offline from this device. Fix the web so both apps agree. The server ships first.

## Decision (Alvin, 2026-11-17): build Audit Logs, offline

The web Audit Logs tab called `GET /audit?districtId=`, which refuses a DEO (SUPER/MINISTRY/COUNTY only) and ignores `districtId` anyway, so the tab was always empty. Alvin chose to build it properly and offline: a new district finance-audit route, the same entries shipped in the district snapshot, and a desktop migration that forces one full resync.

## What the web got wrong (fixed on both sides)

1. **Audit Logs never loaded** (above).
2. **Figures were all-time.** The County Finance pages and the DEO dashboard use each school's *current academic year*; Finance did not, so the dashboard's fee compliance and this page disagreed. Now every allocation / collected / outstanding / rate figure on the page is current-year, by each school's own current year (`ACTIVE_YEAR` on the server, `academic_years.isCurrent = 1` on the desktop).
3. **Flagged Activity used a different list.** It called `/finance/deo/flagged`, which includes inactive schools and is all-time. Now Flagged Activity is derived from the same school rows as the Overview. `/finance/deo/flagged` is aligned too (active schools, current year) and kept for compatibility; nothing in the web calls it any more.
4. **Principal** came from school metadata only. Now it follows the Schools-page rule (piece 2): the active School Admin with the lowest user id, else the metadata principal, else "Not recorded".
5. **Outstanding could go negative** in the Flagged tab (overpayment). It is `max(expected − collected, 0)` everywhere.
6. **Hard-coded "Buchanan · Grand Bassa"** in the banner: the real district and county names.
7. **Three different rate cut-offs** for colouring. Kept two meaningful rules (below) and made the Flagged-tab bar use them.

## Rules (identical on both sides)

Shared rule file: Nemis `common/district/finance-status.ts`, desktop `packages/application/src/use-cases/deo/finance-status.ts`, pinned by the same case table.

- **Schools:** the district's active schools (`institution.districtId = district, isActive`). No county filter (server district routes scope `{districtId, isActive}`).
- **Per school (current year):**
  - `allocation` = Σ obligation `requiredAmount`; `collected` = Σ obligation `totalPaid`;
  - `outstanding` = max(allocation − collected, 0);
  - `collectionRate` = round(collected / allocation × 100), 0 when allocation is 0;
  - `studentCount` = active students;
  - `lastPaymentAt` = newest non-reversed payment at the school, any year (null → "No payment yet"). Desktop also skips a payment with a local reversal row.
- **status:** `No Data` when allocation is 0; else `On Track` at rate ≥ 80, `At Risk` at 50–79, `Behind` below 50.
- **flagged:** allocation > 0 or collected > 0 is *listed*; it is `Flagged` when rate < 30 and outstanding > 0, else `Monitor`. Listed rows sort by rate ascending, then name.
- **Rate bar colour (Flagged tab):** ≥ 80 emerald, ≥ 30 amber, else red.
- **Summary:** totals of the rows; `complianceRate` = round(totalCollected / totalAllocation × 100) (0 when none); `schoolsBilling` = allocation > 0; `schoolsBehind` = status Behind.
- **School order (Overview):** rate descending, then name, then id.
- **Trend:** non-reversed payments at the district's active schools in the last six calendar months including this one (any academic year — it is a time series), summed per month, oldest first, label "Nov". Months use the machine's local calendar on each side. Both pages show "No completed payments recorded in the last six months." when every month is zero (the server always sends six months, so the web's old empty check never fired).

### Finance audit entries

- **Entry types:** `entityType` ∈ `feeRule`, `feeObligation`, `feePayment` (what `school-admin-fees.service.ts` and `obligations.service.ts` write).
- **Belongs to the district** when its `entityId` is one of: a district school's id (bulk fee-rule creation logs the institution id), a fee rule, an obligation or a payment of a district school (any active state; bulk obligation creation logs the fee-rule id). Matching by entity, not by actor, so a person who works in two districts never leaks entries across.
- **Candidates:** to keep the query bounded, only entries whose actor has (or had) a link to a district school are considered, then each is checked by entity as above.
- **Window:** the last 365 days (same as the County audit trail). The page shows the newest 50, newest first.
- **Shown:** time, actor name (first + last, else email), action, `entityType #first-8-of-entityId`.

Server helper `districtFinanceAudit(tx, districtId, { since?, take? })` in `fees/district-finance-audit.ts` feeds both the route and the snapshot so they agree. It pages by keyset on (timestamp, id), never OFFSET, and the snapshot asks for at most the newest 500 entries per sync (the page shows 50), so it stays cheap inside the snapshot transaction. After a long offline spell a device therefore skips anything older than those 500; accepted.

**Offline fee work is audited too (review fix).** Fee rules, obligations and payments that school desktops push through the sync applier now write the same audit entries as the online fee services (`feeRule` / `feeObligation` / `feePayment`, action from the operation type, `metadata.source = "desktop-sync"`), inside the per-operation transaction. Before, the DEO's tab missed every fee change made offline.

## Data

`DistrictFinanceResponse` (Nemis types, web) / `DeoFinanceResult` (desktop):

```
{ districtId, district, county,                     // desktop only
  summary: { totalAllocation, totalCollected, totalOutstanding,
             complianceRate, schoolsBilling, schoolsBehind },
  trend: [{ period, amount }],
  schools: [{ schoolId, schoolName, schoolCode, principalName,
              allocation, collected, outstanding, complianceRate,
              studentCount, lastPaymentAt, status }],
  flagged: [{ schoolId, schoolName, schoolCode, expected, collected,
              outstanding, collectionRate, isFlagged }] }   // desktop: in the result; web: derived by lib/deo-finance.ts from schools
```

Audit entry: `{ id, timestamp, actorName, action, entityType, entityId }`.

- **Server:**
  - `GET /districts/:id/finance` (existing) changes to the rules above.
  - New `GET /districts/:id/finance-audit?limit=` (DEO, SUPER_ADMIN, COUNTY_ADMIN; `enforceDistrictAccess`; limit 1–100, default 50).
  - District snapshot: `auditLogs` now ships for `DISTRICT` scope = `districtFinanceAudit` rows in the 365-day window (delta by timestamp with the County 5-minute overlap), mapped to the existing desktop columns (`actorScope` = `auditScopeLabel`).
- **Desktop:**
  - Migration 051 forces one full resync on district devices only (`provisioning_metadata.scopeType = 'DISTRICT'`) so they receive the existing history (the table already exists, migration 039). The importer's 365-day prune already applies.
  - Read model (district overview): `financeBySchool(districtId)`, `lastPaymentBySchool(districtId)`, `paymentsByMonth(districtId, since)`, `listFinanceAudit(limit)`.
  - `GetDeoFinanceUseCase` and `GetDeoFinanceAuditUseCase` (district from the session; with none, an empty page with `districtId: null` and no reads, as the Transfers use case does), channels `deo:finance` and `deo:finance-audit`, DEO-only, no arguments.

## Page (both apps; §4.9 layout)

- **Banner:** "DEO Portal · Finance" / "Finance Monitoring", district block with the real names.
- **Underline tabs:** Overview, Flagged Activity, Audit Logs. Each tab loads only when first opened (Audit Logs separately).
- **Overview:** four KPI cards (District Allocation, Collected, Collection Rate %, Outstanding; compact LRD), Budget Utilization (three bars + Schools Tracked / Schools Billing / Behind Target tiles), Monthly Collection Trend (CSS bars; empty text kept), the schools table with ALL / On Track / At Risk / Behind / No Data pills, each showing its count; "View School" → `schools/details?id=` (ComingSoon until the sub-pages task). A heading "Current academic year" tag sits on the KPI row so the scope change is visible.
- **Flagged Activity:** the amber notice, the table, the empty text.
- **Audit Logs:** the table, empty text "No finance audit entries found".
- **States:** loading, error with Retry (only the error, never zero cards), no district.
- Desktop styles follow the desktop palette (16px cards, no shadows) as the earlier pieces did.

## Out of scope

- School detail (sub-pages task).
- Desktop County dashboard/fees keep using `OWN_COUNTY`; the DEO dashboard's fee compliance still reads the County read model (it filters to the district, so a district school with a different county id is missing there only). Left as is.
- Exporting finance data.
