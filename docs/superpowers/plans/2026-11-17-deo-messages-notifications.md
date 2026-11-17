# DEO Messages + Notifications — implementation plan (piece 9)

Spec: `docs/superpowers/specs/2026-11-17-deo-messages-notifications-design.md`. Native inline execution, TDD (watch every new test fail first). Server ships first.

## Task 1 — Server (Nemis)
1. Snapshot DISTRICT: `directMessagesFor` for DISTRICT too; the county's COUNTY_ADMIN organisations + users in the roster. Specs.
2. Applier: DEO may push `user_notifications`. Spec.
3. Server tests, tsc, lint. Commit.

## Task 2 — Web (portal-web)
1. `lib/deo-notifications.ts` + test: card type from `UserNotificationType`, link mapping, filter counts.
2. DEO notifications panel on `useGetUserNotificationsQuery` (Load more, mark read, mark all, Open), real district names. Page test.
3. `DeoDirectMessagePanel`: `?userId=` deep link, past conversations via `buildSidebarItems`. Test.
4. Web tests, tsc, eslint, restore tsbuildinfo. Commit.

## Task 3 — Desktop application + infrastructure
1. Types (DEO messaging overview/contacts reuse County shapes), channels, `DeoApi` additions.
2. `listMessageContacts` on the district read model (+ SQLite + tests); DEO use cases reusing County ports; service, factory.
3. Migration 052 (resync district devices) + test.
4. IPC handlers + validators + DEO gate; `messaging:online-users` opened to DEO; RealtimeClient for DEO; preload, bridge, ipc group, hooks.

## Task 4 — Desktop presentation + renderer
1. `DeoMessagesViewModel`, `DeoNotificationsViewModel` + tests.
2. `DeoMessagesPanel` (reusing county messaging components), `DeoNotificationsPage`, routes; page tests (watched failing first).
3. lint, typecheck, build:renderer, full suite. Commit.

## Task 5 — Review
A fresh reviewer, a fix pass, memory, the merge menu.
