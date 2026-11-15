# DEO School Admins page on the desktop — design

**Date:** 2026-11-15
**Branch:** `feat/deo-school-admins` (both repos), cut from `feat/deo-schools`
**Piece:** 3 of 10. Layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.4.

## Why

The desktop School Admins page is a Coming Soon placeholder. The DEO needs the web's School Admin Directory, offline, with real figures (option A).

## What the web does today

`portal-web/src/app/government/deo/school-admins/page.tsx` builds **one row per school** from `GET /institutions`:

| Shown | Web today |
|---|---|
| Name | the school's INSTITUTION_ADMIN user, else the metadata principal |
| ID | `ADM-` + first three characters of the **school** id (invented) |
| Joined | the **school's** creation date |
| Active / Suspended | the **school's** `isActive` (and the list only holds active schools, so Suspended is always 0) |
| "Submitted N reports this month" | field never sent → always 0 |
| "N open infrastructure issues" | field never sent → always 0 |
| "Last active" | field never sent → always "Recently" |
| Message, Flag buttons | do nothing |
| Banner | "Buchanan · Grand Bassa" hard-coded |

## Goals

1. The desktop page matches the web layout and works offline.
2. Each card describes a real School Admin account.
3. The web shows the same.

## Non-goals

Messaging (piece 9), suspending or reactivating accounts (a County Admin action), editing anyone.

## Approaches

**A. One card per School Admin account (chosen).** The directory lists people, as its title says. Status, last sign-in and joined date come from the account.
**B. Keep one card per school.** Rejected: "Suspended" and "Last active" describe a person, not a school, and a school with two admins could only show one.

## Design

### Who is listed

Every active INSTITUTION_ADMIN membership at an active school of the district, one card per person and school, ordered by school name then admin name. On the desktop the source is `institution_admin` (pruned on every pull since piece 2) joined to `users`.

### Each card

| Part | Rule |
|---|---|
| Avatar | the account photo |
| Name | first and last name |
| "Principal · {school}" | as the web |
| "ID: {employee number}" | the staff record of that user at that school, if any; the part is left out otherwise |
| "Joined: {Mon DD, YYYY}" | the account's creation date; left out when unknown |
| Status chip | **Active** when the account is active, **Suspended** when it is not (CheckCircle for Active, Ban icon for Suspended) |
| "Submitted N reports this month" | reports with `submittedById` = the user and `submittedAt` in the current calendar month |
| "N open infrastructure issues" | unresolved `INFRASTRUCTURE_ISSUE` alerts raised against the school (school staff requests excluded); red when above zero |
| "Last active: …" | the last sign-in, relative ("today", "3 days ago", "Mar 4, 2026" beyond 30 days); "Never signed in" when none |
| Message button | links to `/government/deo/messages?userId={id}` (the Messages page, piece 9, must honour it) |

KPI cards: Total Admins, Active, Suspended — counted over the cards. Tabs All / Active / Suspended, as the web.

**Schools without a School Admin** are listed after the cards as a short muted line: "No School Admin: {school}, {school}" — so a missing admin is visible instead of silently absent.

### Desktop

- `IDistrictOverviewReadModel` gains `listSchoolAdmins(districtId, monthStart)` returning per admin: user id, names, photo, school id and name, isActive, createdAt, lastLoginAt, employee number, reports this month; plus `countOpenInfrastructureIssuesBySchool(districtId)`.
- `GetDeoSchoolAdminsUseCase` → `DeoSchoolAdminsResult { districtId, district, county, admins, schoolsWithoutAdmin }`.
- Channel `deo:list-school-admins` in `DEO_CHANNELS`; `DeoSchoolAdminsViewModel`; helpers `adminTabCounts`, `filterAdminsByTab`, `lastActiveLabel(lastLoginAt, now)`.
- Page replaces the Coming Soon.

### Server and web

- `GET /districts/:id/school-admins` (DEO of the district, County Admin of its county, Super Admin) returns the same shape.
- The web page reads it, plus the settings query for the banner names.

## Calls made

1. **One card per School Admin account**, not per school.
2. **Suspended = the account is deactivated.**
3. **Joined = account creation date.** The membership's own date is not synced to devices.
4. **The invented "ADM-xxx" ID is replaced by the staff employee number**, or left out.
5. **The Flag button is removed.** It has no meaning anywhere in the system; Message links to the Messages page.
6. **Schools with no School Admin are named** under the directory.
7. **"Reports this month"** counts reports the admin personally submitted.
