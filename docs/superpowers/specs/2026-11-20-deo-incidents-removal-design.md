# DEO sub pages, piece 6: Incidents removed; dashboard alert counts fixed

**Date:** 2026-11-20
**Repos:** Nemis (server, portal-web). desktop-client-nemis has no code change.
**Size:** small change
**Release order:** server first, then web

## Intent and why

- The web page `/government/deo/incidents` ("Incidents & Community Issues") is a read-only list of the district's **open alerts**. It uses the same rule and source as the Alerts page's Open view.
- No incident records exist behind it: every item reads "Open". It has no school name, no paging and no actions, and it stops at 50.
- It is reachable only by URL, and the desktop never had it.
- The Alerts page now shows the same alerts, with school names, paging and Resolve, on both apps.

The endpoint behind it, `GET /districts/:id/incidents` (`getDistrictIncidents`), also feeds the web DEO dashboard. The server works out that endpoint's `summary` (total, critical, high, medium, low) **after** trimming the list to 50. A district with more than 50 open alerts therefore shows capped counts on the web dashboard, while the desktop dashboard and the Alerts page count them all.

Alvin chose (2026-11-20) to remove the page and fix the counts.

## Goals

- **Web:** delete `app/government/deo/incidents/page.tsx`. The dashboard keeps `useGetDistrictIncidentsQuery` and `useMarkIncidentReviewedMutation`.
- **Server:** `getDistrictIncidents` computes `summary` over every open alert that passes the rule and the teacher-request filter. `alerts` is still the first 50 in the existing order. The response shape is unchanged.

## Non-goals and anti-goals

- **Non-goals:**
  - no change to the endpoint's rule, order or response shape;
  - no change to the Alerts page;
  - no desktop change.
- **Anti-goals:**
  - a web dashboard Critical or High count that disagrees with the Alerts page and the desktop dashboard for the same data;
  - a broken link to the deleted page. None exists today; a search confirms it.

## Approaches

1. **Remove the page and fix the counts (chosen).** Alerts already covers the page, and the fix closes the 50-cap gap parked in the Alerts piece.
2. **Port the page to the desktop.** That makes a second read-only copy of Alerts' Open view. Rejected.

## Design

- **Server, `apps/Server/src/districts/districts.service.ts`, `getDistrictIncidents`:** build the filtered, ordered list, compute `summary` from all of it, then return `alerts: filtered.slice(0, 50)`.
  - Spec, in `districts.school-standings.spec.ts` (where the incidents tests live) or a new `districts.incidents.spec.ts`: 51 open alerts (1 CRITICAL, 50 LOW) plus 1 teacher request give `alerts.length` 50, `summary.total` 51, `summary.critical` 1 and `summary.low` 50.
- **Web:**
  - delete the page file;
  - search `apps/portal-web/src` for `deo/incidents` (expect no matches, since no `pageTitles` entry exists);
  - clear `.next/types` before `tsc`.
- **Verification:**
  - server `pnpm jest src/districts src/common/district` and `tsc`;
  - web `pnpm typecheck`, `pnpm lint` and `pnpm test`.

## Constraints

- Never commit `apps/portal-web/tsconfig.tsbuildinfo`.
- No pushes.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Remaining after this piece

Analytics, including its "not submitted in 7 days" insight, which still reads report data no school can produce.
