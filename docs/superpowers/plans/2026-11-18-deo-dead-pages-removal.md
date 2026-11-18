# DEO dead pages removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the DEO pages that receive no data (web Submissions, Supervision, Resources and Data; the Communications target on both apps), plus everything only they use.

**Architecture:** Pure deletion, across two repos. The web work happens in `Nemis` (portal-web plus `packages/types`) and the desktop work in `desktop-client-nemis` (renderer). The server is untouched. Each repo works on its own branch, `feat/deo-dead-pages`, cut from `main`.

**Tech Stack:** Next.js + RTK Query (portal-web), Vitest; Next.js renderer in Electron (desktop), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-deo-dead-pages-removal-design.md` (desktop repo)

## Global Constraints

- No server changes. `apps/Server` stays untouched.
- Delete a symbol only after grep, across `Nemis/apps` and `Nemis/packages` (excluding `node_modules`), shows that nothing outside the deleted files uses it.
- No other dead code is deleted. If grep turns some up, list it in the final report instead.
- Quick Actions grid: change `sm:grid-cols-3` to `sm:grid-cols-2` on both dashboards. Change no other dashboard styling.
- The desktop's uncommitted `apps/desktop/package.json` version bump (2.0.9 → 3.0.0) is Alvin's. It must never be staged or committed.

## Review Focus

- **Type-check after deleting the API endpoints.** Any remaining import of a removed hook fails `tsc`. Owned by Task 1 Step 5.
- **The `@nemis/types` barrel.** If `packages/types/src/index.ts` names `SubmissionItem` and the other two types explicitly instead of using `export *`, the removal breaks the build. Owned by Task 1 Step 3.
- **Desktop route list or sidebar entries pointing at `deo/communications`.** Grep should find none besides the dashboard; Task 2 Step 1 confirms it.
- **The `Megaphone` import.** It must go only from the two dashboard files, where it becomes unused, and lint must stay clean. Owned by Task 1 Step 5 and Task 2 Step 4.

---

### Task 1: Web: remove the four pages, their API surface, orphaned modals and types, and Send Broadcast

**Files** (all paths in the `Nemis` repo):
- Delete: `apps/portal-web/src/app/government/deo/submissions/page.tsx`, `.../deo/supervision/page.tsx`, `.../deo/resources/page.tsx`, `.../deo/data/page.tsx` (and their now-empty folders)
- Delete: `apps/portal-web/src/components/deo/submissions/SubmissionDetailModal.tsx`, `apps/portal-web/src/components/deo/schools/SchoolDetailModal.tsx` (and any folder left empty)
- Modify: `apps/portal-web/src/store/deo/Api/deoApi.ts`. Remove:
  - the `getDistrictSubmissions` and `updateSubmissionStatus` endpoints (about lines 396–444)
  - the `getDistrictSupervisionReports`, `getDistrictDataSubmissions` and `getDistrictResources` endpoints (about lines 739–778, including the comment above each)
  - their five hook names from the export list (about lines 1351–1352 and 1378–1380)
  - `SubmissionItem` from both the `import type` and the `export type` lists
- Modify: `apps/portal-web/src/store/shared/baseApi.ts:49`. Remove the `"DistrictSubmissions"` tag type.
- Modify: `packages/types/src/deo.ts`. Remove `DistrictSubmissionType` (line 3), `DistrictSubmissionStatus` (line 4 onward) and `interface SubmissionItem` (lines 100–132).
- Modify: `apps/portal-web/src/app/government/deo/page.tsx`. Remove the Send Broadcast `<a>` (about lines 714–727) and the `Megaphone` import, and change the Quick Actions grid to `sm:grid-cols-2`.

**Interfaces:** none produced. Task 2 is independent.

- [ ] **Step 1: Branch.** In `Nemis`, run `git switch -c feat/deo-dead-pages main`. Expected: the new branch, with a clean tree.
- [ ] **Step 2: Delete the page folders and the two modal files**, using `git rm`.
- [ ] **Step 3: Edit `deoApi.ts`, `baseApi.ts`, `packages/types/src/deo.ts` and the dashboard** as listed above. Then check how `packages/types/src/index.ts` re-exports `deo.ts`; if it names the removed types, remove them there too.
- [ ] **Step 4: Grep for leftovers.** Run `rg -n "useGetDistrictSubmissions|useUpdateSubmissionStatus|SupervisionReports|DataSubmissions|DistrictResources|SubmissionItem|DistrictSubmission(Type|Status|s\b)|SubmissionDetailModal|SchoolDetailModal|deo/(submissions|supervision|resources|data|communications)" apps packages -g "!**/node_modules/**"`.
  - Expected: no hits in portal-web or packages.
  - Hits in `apps/Server` are allowed (server routes stay): `getDistrictSubmissions` in the districts service/controller.
- [ ] **Step 5: Verify.** From `apps/portal-web`, run `pnpm typecheck`, `pnpm lint` and `pnpm test`; also run `pnpm --filter @nemis/types build` if that package has a build script.
  - Expected: the type-check passes, lint shows no new errors (compare against `main` if anything appears), and all tests pass.
- [ ] **Step 6: Commit.** Use `git add -A apps/portal-web packages/types`, then commit `chore(deo): remove web DEO pages that receive no data`, with this body:

  > Submissions, Supervision, Resources and Data (no server route or retired flow), the unused SchoolDetailModal, their queries/types, and the Send Broadcast link to the non-existent communications page.

  End the message with the `Co-Authored-By` trailer.

### Task 2: Desktop: remove the Communications placeholder and Send Broadcast

**Files** (all paths in the `desktop-client-nemis` repo):
- Delete: `apps/desktop/renderer/app/government/deo/communications/page.tsx` (and the folder)
- Modify: `apps/desktop/renderer/components/deo/DeoDashboardPage.tsx`. Remove the Send Broadcast entry (lines 480–485) and the `Megaphone` import (line 12), and change the grid at line 478 to `sm:grid-cols-2`.
- Test: `apps/desktop/renderer/app/government/deo/page.test.tsx:208-214`

**Interfaces:** none.

- [ ] **Step 1: Branch and grep.** Run `git switch -c feat/deo-dead-pages main`, then `rg -n "deo/communications" apps packages`.
  - Expected: hits only in `DeoDashboardPage.tsx`, `page.test.tsx` and the page itself.
  - If a route list or sidebar entry also turns up, remove it in this task.
- [ ] **Step 2: Write the failing test.** In the `keeps the year closures panel` test, replace line 212 with:

  ```tsx
  expect(screen.queryByText('Send Broadcast')).not.toBeInTheDocument();
  expect(screen.getByText('Generate Report').closest('a')).toHaveAttribute('href', '/government/deo/reports/automated');
  expect(screen.getByText('Schedule Visit').closest('a')).toHaveAttribute('href', '/government/deo/schools');
  ```

- [ ] **Step 3: Run it to make sure it fails.** Run `pnpm vitest run apps/desktop/renderer/app/government/deo/page.test.tsx` from the repo root. Expected: FAIL, because Send Broadcast is still in the document.
- [ ] **Step 4: Implement.** Make the `DeoDashboardPage.tsx` edits listed above, and `git rm` the communications page.
- [ ] **Step 5: Verify.**
  - Run the same test file. Expected: PASS. Note that `fresh-login app/page.test.tsx` is a different file and fails on `main` already; it is not part of this check.
  - Run `pnpm --filter @nemis-desktop/app typecheck` and `pnpm lint`. Expected: no errors.
- [ ] **Step 6: Commit.**
  - Run `git add apps/desktop/renderer docs/superpowers/specs/2026-11-18-deo-dead-pages-removal-design.md docs/superpowers/plans/2026-11-18-deo-dead-pages-removal.md`. Do NOT stage `apps/desktop/package.json`.
  - Commit `chore(deo): remove desktop Communications placeholder and Send Broadcast`, ending with the `Co-Authored-By` trailer.
