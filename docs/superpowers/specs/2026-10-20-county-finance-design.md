# County Finance (Overview + Fee Rules) — design

Date: 2026-10-20 · Repos: `desktop-client-nemis` + `Nemis` · Branch: `feat/county-finance` (both, main checkouts)

## Intent

Port the County Admin **Finance** page (`portal-web/src/app/government/county/finance/page.tsx`) and the **Fee Rules** page (`…/finance/fee-rules/page.tsx`) to the desktop County Admin portal, copying the web's design and behaviour, and fix the web's quirks on **both** sides. Today the desktop routes `/government/county/finance` and `/government/county/finance/fee-rules` are generic `SchoolAdminCollectionPage` placeholders. Their sidebar entries already exist.

## How it gets made (Alvin's choices for this page)

- **Native inline build** in the main checkouts. No worktrees, no subagents.
- **Full hexagonal path, no layer bypassed** (Alvin, 2026-10-20, after first choosing a plain main-process service and then reversing it). The chain is: application read-model port + use cases → presentation ViewModels → SQLite read-model adapter → IPC/preload/bridge. This is the same wiring as County Teachers.
- **Offline compute.** County devices already receive every fee rule, obligation and payment for the county's schools, so there's no snapshot change and no online call.
- **Fix every web quirk on both sides** (list below).

## The quirks and their fixes (both web + desktop)

| # | Quirk | Fix |
|---|---|---|
| 1 | The header says "Period: <current month>", but the figures are all-time across every academic year. | **Scope every figure to the current academic year** (Alvin's choice). An obligation counts only when its `academicYearId` is a year with `isCurrent = true`. Since every school has its own year rows, that means each school's own current year. A payment counts only when its obligation counts. The header label becomes **"Academic Year"**, and its value is the current-year name if every school that has a current year shares one name. Otherwise (mixed names, or no school with a current year) it reads "Current academic year". |
| 2 | The Payments District filter only appears after you've opened the All Schools tab, because its options come from that tab's lazy query. | Take the district options from the always-loaded dashboard's `districtComparison`. |
| 3 | Payment search matches first name and last name separately, so a full name ("Mary Kollie") finds nothing. | Split the search on whitespace. **Every** word must match at least one of the student's first name, last name or NEMIS ID, or the school name (case-insensitive contains). |
| 4 | The thresholds disagree: rate text turns amber at 30%, while the bar and badge use 40%. | One rule everywhere: **≥ 70 green, 40–69 amber, < 40 red.** This matches the badges (Below Target < 40, On Track ≥ 70, At Risk otherwise). |
| 5a | On Fee Rules, the `rounded-lg5border` class typo means the school cards have no border. | `rounded-lg border`. |
| 5b | On Fee Rules, Status always says "Active" because only active rules are fetched. | Include inactive rules. Order each school's rules active first, then mandatory first, then newest first. A school appears if it has any rule, active or not. |
| 6 | (False alarm.) Rules with no school never appear. | **No change.** No code path creates a school-less rule: School Admin create and the desktop sync both always set `institutionId`. Any such rows are old national seed data, not county rules. The desktop query also keeps `institutionId IS NOT NULL`. |

Also dropped as dead code: the unused `"audit"` member of the web `Tab` type.

## Figures (the server formulas, ported)

All figures cover the county's **active** schools (`institutions.countyId = county AND isActive`). "Current obligations" means obligations whose academic year has `isCurrent = true`.

- Per school (the `summarizeInstitutions` port, current year only):
  - expected = Σ requiredAmount
  - collected = Σ totalPaid
  - rate = round(collected / expected × 100), or 0 when nothing is expected
  - Group each student's obligation statuses at that school:
    - **paid** = every status is PAID_IN_FULL or WAIVED
    - **partial** = otherwise, if any status is PARTIALLY_PAID, PAID_IN_FULL or WAIVED
  - studentCount = active students currently at the school
  - unpaid = max(0, studentCount − paid − partial)
- **Dashboard:**
  - Sums of expected, collected, paid, partial and unpaid across schools; rate from the sums.
  - schoolsReporting = schools with collected > 0
  - totalSchools = number of active schools
  - districtComparison = per `institutions.districtId`, with the district name. Schools with no district are left out, exactly like the server. Each entry carries expected, collected, rate and schoolCount (schools in that district).
  - Also returns `academicYearName` (fix 1).
- **All Schools:** one row per active school: id, name, code, district id/name, the summary fields. Sorted by rate ascending, as on the web.
- **Payments:** non-reversed payments (`isReversed = 0`, plus no `fee_payment_reversals` row on the desktop) at active county schools whose obligation is a current-year one. Optional filters: districtId, ownership, and search (fix 3). Sorted by `paidAt` descending, 50 per page.
  - Summary over the whole filtered set: totalCollected = Σ amount, totalTransactions = count, schoolsWithPayments = distinct schools.
  - Each record carries: id, studentName, nemisId, schoolName, schoolOwnership, districtName, feeRuleName (empty when not found), amountPaid, method, reference, paidAt.
- **Fee Rules:** every rule (fix 5b) whose school is an active county school. Optional filters: ownership, and a school-name search (case-insensitive contains). Grouped by school, schools sorted by name, 10 schools per page. Returns `{ schools: [{ id, name, ownership, district: {id,name}|null, ownFeeRules: [...] }], total }`. Each rule carries id, name, description, category, amount, currency, applicableLevels (string[]), isActive. Fee rules aren't year-scoped.

## Server (Nemis) changes

- `FinanceSummaryService.summarizeInstitutions(ids, options?: { currentYearOnly?: boolean })`. When it's true, the two obligation queries add `academicYear: { isCurrent: true }`. DEO (`deo-finance.service.ts`) and district (`districts.service.ts`) callers stay unchanged: all-time, out of scope.
- `CeoFinanceService.getCountyDashboard` and `getSchoolFinanceSummaries` pass `currentYearOnly: true`. The dashboard also returns `academicYearName` (fix 1).
- `getCountyFeeCollections`: add `obligation: { academicYear: { isCurrent: true } }` to `where`, plus the word-by-word search (fix 3).
- `getAllSchoolFeeRules`: drop `isActive: true` and order by `[{isActive:"desc"},{isMandatory:"desc"},{createdAt:"desc"}]` (fix 5b).
- Jest specs cover each of these.

## portal-web changes

- `finance/page.tsx`:
  - the header label (fix 1)
  - district options from `dashboard.districtComparison` (fix 2)
  - the unified thresholds (fix 4)
  - the unused `audit` tab type removed
  - the `CeoFinanceDashboard` type gains `academicYearName: string | null`
- `fee-rules/page.tsx`: the border typo (fix 5a). Status now shows real values from 5b.
- **Known side effect:** `reports/generate/page.tsx` also reads `getCeoFinanceDashboard`, so its finance figures become current-year too. That's accepted, since it uses the same endpoint.

## Desktop changes

- **Types** (`packages/types`): `CountyFinanceDashboard`, `CountySchoolFinanceRow`, `CountyFeeCollectionsQuery` / `Result`, `CountyFeeRulesQuery` / `Result`, plus the `county.finance` API shape. New IPC channels:
  - `county:finance-dashboard`
  - `county:finance-schools`
  - `county:finance-payments`
  - `county:finance-fee-rules`
- **Application layer** (`packages/application`):
  - Port: `interfaces/county/county-finance-read-model.ts` (`getDashboard(countyId)`, `listSchools(countyId)`, `listFeeCollections(countyId, query)`, `listFeeRules(countyId, query)`).
  - Use cases: `use-cases/county/get-county-finance-dashboard.ts`, `get-county-finance-schools.ts`, `get-county-fee-collections.ts`, `get-county-fee-rules.ts`. These normalise the query (page bounds, trimmed search) and call the port.
  - Exposed through `county-application-service.ts` and `create-application-layer.ts`.
  - An in-memory read model in `testing/county/` for tests.
- **Presentation layer** (`packages/presentation`):
  - `view-models/county/county-finance-view-model.ts` holds the dashboard, the schools list (loaded lazily) and the payments page and filters, with loading and error state per part.
  - `county-fee-rules-view-model.ts` holds the rules page and filters.
  - Both are registered in `create-presentation-layer.ts` and `testing/create-test-application.ts`, with hooks in `renderer/lib/presentation/hooks/county.ts`.
- **Adapter:** `electron/data/repositories/sqlite/business/SqliteCountyFinanceReadModel.ts`.
  - Plain SQL over `institutions`, `districts`, `students`, `academic_years`, `fee_obligations`, `fee_payments`, `fee_payment_reversals` and `fee_rules`.
  - `applicableLevels` is parsed from its JSON text.
  - LIKE wildcards in search terms are escaped.
  - Wired in `createDataLayer.ts` and `createApplicationComposition.ts`.
- **IPC:**
  - handlers in `electron/ipc/handlers/county/finance.ts`; the county comes from the workspace scope id, as the other county handlers do
  - argument asserts in `validateIpc`
  - the COUNTY_ADMIN allow-list in `authorizeChannel`
  - registered in `registrar.ts`
  - no `electron/main/main.ts` change: the finance methods live on the existing `county` application service, whose key `deferredApplication` already lists
  - `preload/county/finance-api.ts`
  - `renderer/services/nemis-bridge/county/finance-bridge.ts`
- **Pages:** `app/government/county/finance/page.tsx` and `…/fee-rules/page.tsx` are a markup-for-markup port of the web pages with the fixes above. They read from their ViewModels, never from the bridge directly. They use:
  - `Spinner`, `Alert` and `Card` from `@nemis-desktop/ui`, and lucide icons
  - `formatCurrency` from `@/components/finance/shared`
  - `formatNemisId` from `@nemis-desktop/shared`
  - `formatDate`: whatever the renderer already uses for dates, or a local `en-US` short date
  - **County name for the header:** the source the county dashboard already uses
  - **Data loading:** `useRevalidateOnSync`, so the pages refresh after each sync. Tabs load lazily like on the web.
  - **Errors:** shown in the same red `Alert` the web uses.
- **Tests:**
  - adapter tests on an in-memory migrated SQLite (fixtures across two years, two districts, a reversed payment, an inactive school)
  - use-case tests against the in-memory read model
  - ViewModel tests
  - handler tests
  - light page render tests

## Non-goals

- The DEO finance page, the School Admin finance page, the ministry portal.
- Any snapshot change; any online path.
- The finance audit endpoint.

## Release order

None. The desktop computes offline from data it already syncs. Server and web ship together. Desktop and web will agree once both are on the new rules.

## Left to the builder

- SQL shape and indexes, if a query proves slow on 3k+ students.
- Test fixture details.
- Exact file split inside the renderer.
