# DEO Incidents Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the web DEO Incidents page, a duplicate of the Alerts page's Open view. Make the incidents endpoint's `summary` count every open alert, not just the first 50, so the web dashboard's badges are true.

**Architecture:** One server method changes: counts are taken before the list is trimmed. One web page file is deleted. The desktop is untouched.

**Tech Stack:** NestJS + Jest (`apps/Server`), Next.js + Vitest (`apps/portal-web`).

**Spec:** `docs/superpowers/specs/2026-11-20-deo-incidents-removal-design.md` (desktop-client-nemis repo)

**Branches:**
- `feat/deo-incidents-removal` in Nemis, for both tasks.
- desktop-client-nemis has the same branch, holding only the spec and plan.

## Global Constraints

- `getDistrictIncidents` keeps its rule, its order (`severity desc`, then `createdAt desc`) and its response shape `{ alerts, summary: { total, critical, high, medium, low } }`.
- `summary` counts **every** open alert after the teacher-request filter.
- `alerts` is the first 50 of that list.
- The web dashboard (`app/government/deo/page.tsx`) keeps `useGetDistrictIncidentsQuery` and `useMarkIncidentReviewedMutation` unchanged.
- Never commit `apps/portal-web/tsconfig.tsbuildinfo`. No pushes.
- Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Exactly 50 or fewer open alerts:** the counts are unchanged from today. Tested in Task 1.
2. **A severity filter passed (`?severity=HIGH`):** the summary counts the filtered set, as today, but uncapped. Tested in Task 1.
3. **The dashboard's "Mark Reviewed" still works** after the page deletion. It is untouched, and typecheck plus the full web suite in Task 2 cover it.

---

### Task 1: Uncapped incident counts (Nemis server)

**Files:**
- Modify: `apps/Server/src/districts/districts.service.ts`, `getDistrictIncidents` (search the method).
- Test: add to `apps/Server/src/districts/districts.school-standings.spec.ts`, beside the existing incidents tests, using its mocks.

- [ ] **Step 1: Write the failing tests:**
  - `counts every open alert but lists the first 50`: 51 open alerts (1 CRITICAL, 50 LOW) plus 1 teacher request (`metadata.staffId`) give `alerts.length === 50`, `alerts[0].severity === "CRITICAL"`, and `summary` equal to `{ total: 51, critical: 1, high: 0, medium: 0, low: 50 }`.
  - `small districts are unchanged`: 3 open alerts give `alerts.length === 3` and `summary.total === 3`.
  - `severity filter counts the filtered set`: with `severity: "LOW"` and the 51-alert fixture, `summary.total === 50` and `alerts.length === 50`.
- [ ] **Step 2:** From `apps/Server`, run `pnpm jest src/districts/districts.school-standings.spec.ts`. Expected: the first test FAILS (`summary.total` is 50).
- [ ] **Step 3:** In `getDistrictIncidents`, compute `summary` from the full filtered list, then return `alerts: filtered.slice(0, 50)`.
- [ ] **Step 4:** Run `pnpm jest src/districts src/common/district` and `pnpm exec tsc --noEmit -p tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(districts): incident counts cover every open alert, not the first 50`.

### Task 2: Delete the web Incidents page (Nemis portal-web)

**Files:**
- Delete: `apps/portal-web/src/app/government/deo/incidents/page.tsx`. Delete the directory too if nothing else is in it.

- [ ] **Step 1:** From `apps/portal-web`, run `grep -rn "deo/incidents" src`. Expected: only the file being deleted.
- [ ] **Step 2:** Delete the page.
- [ ] **Step 3:** Remove `.next/types` if present, then run `pnpm typecheck`, `pnpm lint` and `pnpm test`. Expected: all pass. Run the grep again; expected: no matches.
- [ ] **Step 4: Commit:** `feat(deo): remove the Incidents page (Alerts covers it)`.
