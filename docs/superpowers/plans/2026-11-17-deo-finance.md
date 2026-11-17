# DEO Finance — implementation plan (piece 8)

Spec: `docs/superpowers/specs/2026-11-17-deo-finance-design.md`. Native inline execution, TDD (watch every new test fail first). Server ships first.

## Task 1 — Server (Nemis)
1. `common/district/finance-status.ts` + spec: `financeStatus(allocation, rate)`, `isFinanceFlagged`, `isFinanceListed`, `FINANCE_FLAG_RATE = 30` (case table).
2. `getDistrictFinance`: current year (`currentYearOnly`), principal (shared admin-name helper extracted from the standings code), clamp outstanding, rate-desc/name/id order. New spec `districts.finance.spec.ts`.
3. `fees/district-finance-audit.ts` + spec: candidate actors, entity check, window, take, actor name.
4. `GET /districts/:id/finance-audit` (controller + service + access check + limit parse) with spec.
5. Snapshot: `auditLogs` for DISTRICT via the helper; spec.
6. `/finance/deo/flagged`: active schools + current year + the shared rule.
7. Server tests, tsc, lint. Commit.

## Task 2 — Web (Nemis portal-web)
1. `lib/deo-finance.ts` + test: `financeFlaggedRows`, `financeStatusCounts`, `flaggedRateBarClass`, formatters.
2. deoApi: `getDistrictFinanceAudit`; drop the dead `/audit` query use and `getDeoFlaggedActivity` use from the page.
3. Page: real district banner, current-year tag, pill counts, flagged from rows, audit from the new route, error state. Page test (watched failing first).
4. Web tests, tsc, eslint. Restore `tsconfig.tsbuildinfo`. Commit.

## Task 3 — Desktop application
1. Types (`DeoFinanceResult`, `DeoFinanceAuditEntry`), channels `deo:finance`, `deo:finance-audit`, `DeoApi` additions.
2. `use-cases/deo/finance-status.ts` (same case table as the server).
3. Failing tests, then `GetDeoFinanceUseCase` / `GetDeoFinanceAuditUseCase`, service, factory, exports.

## Task 4 — Desktop infrastructure, presentation, renderer
1. Read-model methods + tests (current year, reversals, district-only, months, audit filter/order/limit).
2. Migration 051 (full resync) + registry + test.
3. IPC handlers + validators + gate test; preload, bridge, ipc group, hook.
4. `DeoFinanceViewModel` + tests.
5. `DeoFinancePage` + route; page test (watched failing first): tabs, pills/counts, flagged notice + chips, audit rows, error/Retry, no district.
6. lint, typecheck, `build:renderer`, full suite (temporary Node SQLite build, removed afterwards). Commit.

## Task 5 — Review
A fresh reviewer, a fix pass, memory, the merge menu.
