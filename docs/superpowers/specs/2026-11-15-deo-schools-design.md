# DEO Schools page on the desktop — design

**Date:** 2026-11-15
**Branch:** `feat/deo-schools` (both repos), cut from `feat/deo-dashboard`
**Piece:** 2 of 10 in the DEO sidebar-page port. Layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.2. Builds on `2026-11-15-deo-dashboard-design.md`.

## Why

The desktop DEO Schools page is a raw table of synced records. The DEO needs the web's Schools Management page, offline, with real numbers (Alvin's option A, 2026-11-15: compute real figures offline and fix the web to match).

## What the web does today

`portal-web/src/app/government/deo/schools/page.tsx` reads `GET /institutions?districtId=`, which carries none of the fields the table shows:

| Column | Web today |
|---|---|
| Level | `school.level` does not exist → always "Primary"; the Primary/Secondary tabs therefore never match "Secondary" |
| Principal | metadata `contact.principal`, else "N/A" |
| Students / Teachers | `_count` — all students, all staff |
| Attendance | always 0% |
| Reports (dots) | `reportsSubmitted` / `totalReports` never sent → no dots |
| Status | always "Compliant" |
| Banner | "Buchanan · Grand Bassa" hard-coded |

## Goals

1. The desktop page matches the web layout and works fully offline.
2. Every column is real, by the rules below, on both sides.
3. The web page shows the same numbers.

## Non-goals

- The school detail page (next task). Clicking a row opens a "School detail" Coming Soon page on the desktop.
- Changing the dashboard.

## Approaches

**A. Reuse the dashboard's school rows (chosen).** The per-school computation from `GetDeoDashboardUseCase` moves into one shared function; a new `GetDeoSchoolsUseCase` returns district, county and the rows. On the server, the existing `school-standings` endpoint gains the two new fields and the web page switches to it.
**B. Let the Schools page call `deo:get-dashboard`.** Rejected: it would load alerts, trends and submissions the page never shows.
**C. A separate per-school query set for this page.** Rejected: two computations of the same standing would drift.

## Design

### Rules

- **Level:** the school's `levels` (InstitutionLevel), title-cased and joined ("Primary, Secondary"); "—" when none.
- **Tabs:** All · Compliant · Needs Review · Flagged · Primary · Secondary. Primary = levels include `PRIMARY`; Secondary = levels include `SECONDARY`. A school with both is in both. Each tab shows its count (the web computes counts but does not print them; the desktop prints them in the pill, as the other DEO pages do).
- **Principal:** the active School Admin user's full name; else the metadata principal (`contact.principal`, then `principalName`); else "Not recorded".
- **Students / Teachers:** active students / active teaching staff (as the dashboard).
- **Attendance:** the 30-day rate with the web's bar thresholds (green ≥ 80, amber ≥ 70, red below); "—" and an empty bar when null.
- **Reports:** three dots for the last three calendar months, oldest first; a dot is green when the school submitted at least one report dated in that month. (The web has no source for "required reports"; this is a call, see below.)
- **Status:** the compliance status from the shared rule.
- **Banner:** "DEO Portal" / "Schools Management"; right side "District" over "{district} · {county}", parts left out when unknown.
- **Order:** by school name.

### Desktop

- `DeoSchoolRow` gains `principalName: string | null` and `reportMonths: boolean[]` (length 3, oldest first). The dashboard ignores them.
- `IDistrictOverviewReadModel` gains `schoolAdminNameBySchool(districtId)` and `reportMonthsBySchool(districtId, sinceDate)` (`{ institutionId, month }`, month `YYYY-MM`); `DistrictSchoolRef` gains `metadataPrincipal: string | null` read from the profile JSON.
- `buildDistrictSchoolRows(...)` is extracted from `GetDeoDashboardUseCase` and used by it and by `GetDeoSchoolsUseCase`.
- Channel `deo:list-schools` (no args) → `DeoSchoolsResult { districtId, district, county, schools }`, in `DEO_CHANNELS`.
- `DeoSchoolsViewModel`; pure helpers `schoolTabCounts(schools)` and `filterSchoolsByTab(schools, tab)`.
- Page `app/government/deo/schools/page.tsx` replaces the raw tables; row click → `/government/deo/schools/details?id=…`, a Coming Soon page for now.

### Server and web

- `computeSchoolStandings` adds `principalName` and `reportMonths` by the same rules (School Admin from `userOrganization` role `INSTITUTION_ADMIN`, active; metadata via `getInstitutionContact`).
- Web Schools page reads `useGetDistrictSchoolStandingsQuery` and the district settings for the banner names; it shows the dots, "—" for a null rate, and the tab counts.

## Calls made

1. **Report dots = the last three calendar months**, green when the school submitted a report that month. Nothing defines how many reports a school owes.
2. **Principal falls back** from School Admin user, to metadata, to "Not recorded" (the web's "N/A" reads as a name).
3. **Tab counts are printed** in the pills.
4. **Primary/Secondary tabs read the real levels**; a school with both levels appears under both.
5. **Row click goes to a Coming Soon detail page** until the next task builds it (the standing rule for missing targets).

## Testing

Use-case tests for the shared rows (principal fallback order, report months incl. a month with none, both new fields); read-model tests for the two new queries and the metadata principal; IPC and authorisation tests for `deo:list-schools`; helper tests for tabs and counts; a page test; server tests for the two new fields; web build and suite.
