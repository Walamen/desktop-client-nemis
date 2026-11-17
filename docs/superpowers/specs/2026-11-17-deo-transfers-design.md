# DEO Transfers — design (piece 6 of 10)

Date: 2026-11-17. Repos: desktop-client-nemis and Nemis, branch `feat/deo-transfers` in both, cut from `main`.
Web layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.7.

## Goal

Replace the desktop's raw `student_transfers` table at `/government/deo/transfers` with the web's Student Transfer Requests page, read offline from this device. Fix the web so both apps agree. The server ships first.

## Decision (Alvin, 2026-11-17): oversight only

Schools decide transfers. The school that did not ask reviews the request, and after 14 days a lapsed pull can be completed by the school that asked (Phases C1/C3). A DEO watches; it does not decide.

- **Approve, Reject and the review-notes box are removed from the web page.** On the web they always failed, because `PATCH /student-transfers/:id/review` refuses a DEO.
- **The desktop never gets them.** No permission changes, and nothing is pushed.

## What the web got wrong (fixed on both sides)

1. **Only transfers out of the district's schools were listed.** Transfers into the district were missing. Now the page shows every transfer into, out of, or within the district.
2. **A lapsed request was rewritten to "Approved"** (the old client-compatibility hack), so it appeared under the Approved filter. Here a lapsed request keeps `status: PENDING` with `lapsed: true` and has its own Lapsed filter. A lapse means the child has not moved yet.
3. **The whole `student` row was sent to the DEO.** Now only the name and NEMIS ID are sent, which is what the desktop snapshot already carries.

## Rules (identical on both sides)

- **Rows:** transfers whose from-school or to-school belongs to the district, by `institution.districtId`, active or not.
- **Order:** newest `createdAt` first, then `id`.
- **direction:**
  - `WITHIN` when both schools are in the district;
  - `OUT_OF` when only the from-school is;
  - `INTO` when only the to-school is.
- **lapsed:** the existing `isLapsed`. The status is `PENDING`, the request was initiated by `RECEIVING_SCHOOL`, and `lapsesAt` is before now. Server: `student-transfers.service.ts`; desktop: `@nemis-desktop/shared` transfers.ts.
- **awaiting** (the school expected to act next):
  - pending and not lapsed: the reviewing school, i.e. the side that did not ask (from-school for a `RECEIVING_SCHOOL` request, to-school otherwise);
  - lapsed: the requesting school (the to-school), which can now complete or withdraw;
  - any other status: none.
- **summary:** `pending` (pending and not lapsed) and `lapsed` counts.

## Data

`DistrictTransferOverview` (Nemis types) / `DeoTransfersResult` (desktop):

```
{ districtId, district, county,                      // desktop only
  transfers: [{ id, studentName, studentNemisId,
                fromSchool: { id, name }, toSchool: { id, name },
                direction, status, lapsed, initiatedBy,
                awaitingSchool: { id, name } | null,
                requestedGrade, reason, reviewNotes,
                createdAt, requestedDate, reviewedAt }],
  summary: { pending, lapsed } }
```

- **Server:** `GET /districts/:id/transfers`, for DEO, SUPER_ADMIN and COUNTY_ADMIN, behind `ensureDistrictAccess`. The old `GET /student-transfers/district/:districtId` stays for compatibility; its only caller was this page.
- **Desktop:** read-model `listTransfers(districtId)` over `student_transfers`, using the denormalised names (migration 028). A school name that is missing reads "Unknown school". `GetDeoTransfersUseCase` uses the clock for `lapsed`. Channel `deo:list-transfers`: DEO-only, no arguments.

## Page (both apps; §4.7 layout, read-only)

- **Banner:** `ArrowRightLeft`, "District Management", "Student Transfer Requests", and a line "N pending · M lapsed" when either is above zero.
- **Narrow centred body.**
- **Status pills:** All, Pending (the default), Lapsed, Approved, Rejected, Cancelled. Each shows its count.
- **Direction pills:** All, Into district, Out of district, Within district.
- **Card header:**
  - pupil name plus the status chip;
  - `Building2` and "From → To";
  - for an open request, "Awaiting X · N days" (calendar days since `createdAt`; "today" for 0);
  - for a lapsed request, "Lapsed — X can complete or withdraw";
  - a chevron.
- **Expanded card** (read-only fields):
  - Student (name, NEMIS ID or "No NEMIS ID");
  - Requested (date, plus "Transfer by" when set);
  - Requested Grade (when set);
  - Asked by ("Receiving school" or "Sending school");
  - Reason;
  - Review Notes (when set, with the date it was reviewed).
- **Footer note:** "Schools decide transfers. This page is for district oversight."
- **Empty states:** "No transfer requests match these filters."
- **Desktop states:** loading, error only (never empty filters) with Retry, no district, refresh on sync.

## Accepted debt (review 2026-11-17)

- The desktop names a district school from its current local row and an outside school from the copy saved with the transfer; a renamed outside school, or a renamed pupil, stays stale on the device until the transfer itself changes. The server always reads current names.
- A school moved between districts is not re-shipped by the district delta: the device keeps its old districtId (and a school moving in brings no older transfers) until a full re-provision. Every DEO page shares this.
- The desktop chip shows Lapsed in amber, the web in violet: the desktop chip is shared with the School Admin transfer pages.

## Out of scope

A "Remind school" action (needs messaging, piece 9), and any DEO decision on a transfer.
