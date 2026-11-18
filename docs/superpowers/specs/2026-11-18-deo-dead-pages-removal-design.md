# DEO sub pages, piece 0: remove the pages that receive no data

**Date:** 2026-11-18
**Repos:** Nemis (portal-web) and desktop-client-nemis
**Size:** small change

## Intent

This starts the DEO sub-pages task, which follows the 10 sidebar pieces. Alvin's rule: **any DEO page that receives no data on the web is removed from the web and is not added to the desktop.** This piece removes those pages before the real sub pages are ported. It also removes the dead links and dead code they leave behind.

## Pages that receive no data

| Web route | Why it receives nothing |
|---|---|
| `/government/deo/supervision` | Calls `GET /districts/:id/supervision-reports`, which does not exist on the server (404) |
| `/government/deo/resources` | Calls `GET /districts/:id/resources`, which does not exist (404) |
| `/government/deo/data` | Calls `GET /districts/:id/data-submissions`, which does not exist (404) |
| `/government/deo/submissions` | Reads enrolment applications. That flow is retired, and the records are not shipped to district devices. |
| `/government/deo/communications` | No page at all: a 404 on the web and a `ComingSoon` on the desktop. The only way in is the dashboard's **Send Broadcast** quick action on both apps. |

None of the first four is linked from the web sidebar or from any page.

## Goals

- **Web:**
  - Delete the four page folders.
  - Delete the RTK Query endpoints and hooks only they use: `getDistrictSubmissions`, `getDistrictSupervisionReports`, `getDistrictDataSubmissions`, `getDistrictResources`, and the submission status mutation (`useUpdateSubmissionStatusMutation`, if nothing else uses it).
  - Delete `components/deo/submissions/SubmissionDetailModal.tsx`.
  - Delete `components/deo/schools/SchoolDetailModal.tsx`. Nothing imports it today, and it is the only other user of the submissions query.
  - Delete what the deletions above leave unused: the `DistrictSubmissions` cache tag in `store/shared/baseApi.ts`, and `SubmissionItem`, `DistrictSubmissionType` and `DistrictSubmissionStatus` in `packages/types/src/deo.ts`. Recon on 2026-11-18 found no other users of any of them.
  - Drop the **Send Broadcast** quick action from the DEO dashboard.
- **Desktop:**
  - Delete `apps/desktop/renderer/app/government/deo/communications/`.
  - Drop **Send Broadcast** from `DeoDashboardPage.tsx`.
  - Update the dashboard test line that asserts the Send Broadcast link.

## Non-goals and anti-goals

- **No server changes.** The three missing routes have nothing to remove. The enrolment-application routes stay; whether to retire them is a separate decision.
- **No restyling of the dashboard** beyond what removing one tile needs.
- **No touching other dead code** this piece does not orphan. If it turns up, list it; don't delete it.
- Anti-goal: deleting a type, hook or component that something else still imports. Every deletion is grep-checked across `apps/portal-web/src` and `packages/` first.

## Approaches considered

1. **Remove the pages and everything only they use (chosen).** No dead code is left behind, and the server is untouched.
2. Delete only the page folders. This leaves unused queries and two orphaned modals, which mislead later readers.
3. Option 1 plus removing the server's enrolment-application routes. It goes beyond "remove the page", and it adds release-order risk.

Alvin picked 1 on 2026-11-18.

## Calls made by Claude (open to correction)

- **Quick Actions layout.** With two tiles left (Generate Report and Schedule Visit), the grid goes from `sm:grid-cols-3` to `sm:grid-cols-2` on both apps, so no empty slot is left.
- **Imports.** The `Megaphone` icon import is removed wherever this change leaves it unused.
- **Desktop `deo/alerts`** is not touched here. It receives data and gets its own piece.

## Verification

- **Web:** portal-web type-check, lint and Vitest. Grep shows no remaining references to the deleted routes, hooks or components.
- **Desktop:** the renderer dashboard test passes with the updated assertion, plus type-check and lint. Grep shows no `deo/communications` references left.

## Remaining order after this piece

1. School detail
2. Reports & Compliance
3. Alerts
4. School Reports Review
5. Infrastructure
6. Incidents
7. Analytics

Each gets its own spec, server first.
