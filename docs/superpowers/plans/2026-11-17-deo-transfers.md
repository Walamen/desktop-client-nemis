# DEO Transfers — implementation plan (piece 6)

Spec: `docs/superpowers/specs/2026-11-17-deo-transfers-design.md`. Native inline execution, TDD (watch every new test fail first).

## Task 1 — Server (Nemis, ships first)
1. Types `DistrictTransferOverview`, `DistrictTransferItem`, `TransferDirection` in `packages/types/src/deo.ts`; build.
2. Failing spec `districts.transfers.spec.ts`:
   - into, out of and within the district;
   - a lapsed request keeps PENDING and has `lapsed`;
   - who is awaited for each status and initiator;
   - the student select is limited to name and NEMIS ID;
   - the order;
   - the summary;
   - another district's DEO is refused.
3. `getDistrictTransferOverview(districtId, user?)` in `districts.service.ts`, using the exported `isLapsed`. Route `GET :id/transfers`. Run the district tests and the full suite.

## Task 2 — Web (Nemis)
1. In `lib/deo-dashboard.ts`:
   - `TRANSFER_STATUS_TABS`, `DIRECTION_TABS`, `filterTransfers`, `transferTabCounts`;
   - `waitingLabel(createdAt, now)`, `directionLabel`;

   with tests.
2. In `deoApi.ts`, add `getDistrictTransferOverview`.
3. Rewrite `app/government/deo/transfers/page.tsx`: read-only, both pill rows, the awaiting line, the oversight note, and no review mutation. Show only the state when there is no data. Then tsc, eslint and web tests. Commit.

## Task 3 — Desktop
1. Types `DeoTransfersResult` and friends, `DeoApi.listTransfers`, and the IPC channel `deo:list-transfers`.
2. Read model `listTransfers(districtId)`. Failing SQLite tests:
   - into, out of and within the district;
   - other districts are excluded;
   - missing names;
   - the order.
3. `GetDeoTransfersUseCase` (lapsed with the clock, awaiting, summary). Failing test, then the service, the factory and the export.
4. IPC handler and test, the DEO gate test, preload, bridge, ipc group and hook.
5. `DeoTransfersViewModel` and the helpers (the same as the web), with tests.
6. `DeoTransfersPage` and the route. Page test watched failing against the old page:
   - banner;
   - pills and counts;
   - filters;
   - card expand;
   - no review controls;
   - error and Retry;
   - no district.
7. lint, typecheck, `build:renderer`, the full suite (temporary Node SQLite build, removed afterwards), commit.

## Task 4 — Review
A fresh reviewer, a fix pass, memory, the merge menu.
