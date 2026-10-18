# County Admin: Parents & Guardians list and profile

Date: 2026-10-18. Repos: `desktop-client-nemis` (most of the work) and `Nemis` (server + portal-web, ships first).
Branches: `feat/county-parents` in both, each in its own worktree (`Walamen/desktop-client-nemis-parents`,
`Walamen/Nemis-parents`), because the Teachers page is being built at the same time in the main checkouts.

Page 6 of the County Admin migration, after Dashboard, Districts, Schools, Students and Teachers (in progress). The
Schools approvals queue is still skipped.

## 1. Intent

A County Admin opens this page to **see a student's parent's details and how many children are linked to that
parent, just as on the web** (Alvin, 2026-10-18). It is a port of the web's two pages:
- `Nemis/apps/portal-web/src/app/government/county/parents/page.tsx` (list, 524 lines);
- `Nemis/apps/portal-web/src/app/government/county/parents/[id]/page.tsx` (profile, 329 lines).

The desktop's current `/government/county/parents` is the generic `SchoolAdminCollectionPage` placeholder.

## 2. What the County Admin sees

### 2.1 List (`/government/county/parents`), an exact port
- **Header band** (dark): county name (from the local `counties` row; "County" when none) and "Parents & Guardians";
  "Total" with the total count on the right.
- **Three stat cards:** Total Parents / Guardians ("Registered in county"), Children Covered ("Active student
  links"), Primary Guardians ("Designated as primary contact").
- **Filter sidebar:** Search (placeholder "Name, email, phone…", 400 ms debounce), Relationship (button list: All,
  Father, Mother, Guardian, Grandparent, Uncle, Aunt, Sibling, Other), District (select, "All Districts" + the
  county's districts). Changing any filter returns to page 1.
- **Toolbar:** "N parents found" and a Card view / Table view toggle (aria-labels "Card view" / "Table view", as on
  Students).
- **Card view:** the web's `ParentCard`: photo on the left 40% (fallback `/parent-fallback.jpg`, already in
  `renderer/public`), name, relationship (or "—"), "N child/children" chip, phone and email lines when present, and
  "View Profile →".
- **Table view:** Parent (avatar + name), Relationship chip, Contact (phone/email), Children (count), District
  (comma-joined, or "—"). The whole row is clickable.
- **Empty state:** "No parents found matching your criteria."
- **Pagination:** 12 per page, the web's 7-button window, "Page X of Y". Hidden when there is one page.
- Card "View Profile" and table rows open `/government/county/parents/details?id=<guardianId>`.

### 2.2 Profile (`/government/county/parents/details?id=`), a port with the web's bugs fixed
- **Bar:** "← Back to Parents" (`router.back()`, as on the web).
- **Hero card:** avatar (photo or initials), name, relationship (sky text), districts joined with " · " (when any),
  and the Children count box.
- **Contact & Personal Information:** Phone (when present); Email, or a dimmed "Not provided"; District (comma-joined,
  when any); Occupation (when present).
- **Engagement:** High = email AND emergency contact; Medium = only one of them; Low = neither. Same colours, icons and
  sentences as the web. The red "Designated emergency contact" line when it applies. "Students covered: N
  student/students".
- **Send Message** (decided by Alvin: option 2): opens the Messages page with **the School Admin of the parent's
  school** selected (section 5.5). Disabled, with the web's disabled styling, when there is no school to use.
- **Children (N):** one card per linked child: avatar (student photo or initials), name, a status badge, a "Primary"
  badge when this parent is that child's primary guardian, the formatted NEMIS ID, the school, and the district.
- **Not found:** the web's "Guardian not found" + "Go back".

**Differences from the web, all decided:**
1. **Relationship filter ignores letter case** (Alvin: "fix it"). Stored values are mixed: the web's create form saves
   "Father", the bulk wizard "FATHER", and the desktop takes free text.
2. **Child counts and children cover this county only.** The desktop only holds the county's students; the web
   counts children in other counties too. *(my call, accepted by Alvin)*
3. **Parent photos are synced** (section 5.1), so the list shows them. The web's list never receives a photo and
   always shows the fallback. *(my call, accepted)*
4. **The profile's child count, districts and "Students covered" are filled in.** On the web, `findOne` returns
   neither `studentsCount` nor `districts`, so the box is empty, districts never show, and the text reads
   "undefined students". *(my call, accepted)*
5. **The child status badge is real:** "Active" (green, as on the web) or "Inactive" (slate). The web hard-codes
   "Active". *(my call, accepted)*
6. **A child card opens the desktop Student profile** (`/government/county/students/details?id=`). The web's child
   cards are not links. *(my call, accepted)*

The web's own profile bugs (difference 4) are **not** fixed on the web. Only Send Message changes there (section 5.5).

## 3. Goals, non-goals, anti-goals

**Goals**
- The list and profile work fully offline from synced SQLite, look like the web, and use the hexagonal path.
- Send Message lands the officer in a conversation with the right School Admin on the web, and goes to the same
  address on the desktop.

**Non-goals**
- Porting the County Messages page on the desktop. It stays the placeholder for now. The button goes to
  `/government/county/messages?institutionId=…` and the future Messages port handles the parameter.
- Letting County Admins message parents directly (the server's messaging rule is unchanged).
- Fixing the web profile's missing count/districts.
- Editing guardians from the County side.

**Anti-goals** (failure even if it technically works)
- A school device pushing the new guardian `photoUrl` column back to the server.
- Breaking the school-admin guardian screens or guardian sync (the `guardians` table is shared with them).
- Inventing data the device doesn't have (no fake names or placeholder contacts).

## 4. Constraints

- **Release order:** server first. The new snapshot field is ignored by older desktops. A new desktop on an old server
  just gets `photoUrl` absent → null → fallback (the importer must tolerate a missing field, as with Students).
- **Standing choices** (from earlier pages): compute offline from synced SQLite, porting server formulas; full
  hexagonal path (application port + use case → presentation ViewModel → SQLite adapter → IPC/preload/bridge); detail
  pages use `?id=` routes (static export); port web quirks except the ones listed in 2.2.
- **Shared files with the Teachers work:** `packages/types/src/ipc.ts`, `CountyApplicationService`,
  `createDataLayer`, `createApplicationComposition`, `ipc/authorizeChannel.ts` (`COUNTY_ADMIN_CHANNELS`, which makes
  the channels COUNTY_ADMIN-only), `ipc/registrar.ts` (handler registration), `validateIpc.ts`, and the county preload
  and bridge indexes. Keep edits to those files small and appended, so the merge with Teachers is easy. The new use
  cases are methods on `CountyApplicationService`, which sits under the existing `county` key, so `main.ts`
  `deferredApplication` needs **no** change. Teachers adds no migration, so **036 is this page's**.
- **Worktrees** need their own `pnpm install`. The full desktop suite needs better-sqlite3 built for the Node ABI
  (see the Subjects memory: the suite goes red when it is built for Electron).
- **Outbox triggers snapshot column lists at install time** (`installOutboxTriggers`, migration 010/026). Adding a
  column with `ALTER TABLE` does not change the guardians triggers. Do not regenerate them (same rule as students'
  `createdAt`). The server applier's guardian handler whitelists fields, so even a regenerated trigger would not
  write `photoUrl`. Still, don't rely on that.

## 5. How it works (my technical calls, for the builder)

### 5.1 Closing the photo gap (server snapshot, desktop migration 036)

- **Server** (`desktop-provisioning.service.ts`): the `tx.guardian.findMany` gains
  `include: { user: { select: { imageUrl: true } } }`. The `guardians` mapping gains
  `photoUrl: row.user?.imageUrl ?? null` (raw URL, the same as the students mapping). Ship it for every scope, since
  school devices simply store it. Update `DesktopProvisioningData` types and the snapshot tests.
- **Desktop migration 036** (`036-add-guardian-photo.ts`): `ALTER TABLE guardians ADD COLUMN photoUrl TEXT`, then force
  a full resync exactly as 035 does (`UPDATE sync_metadata SET lastFullResyncAt = NULL` when the column exists).
  Register it in `registry.ts`. It must **not** call `installOutboxTriggers`.
- **Importer** (`ProvisioningImporter.ts`): add `'photoUrl'` to the `guardians` spec column list.
- **School-admin writes:** checked by the reviewer. No guardian writer replaces whole rows
  (`SqliteGuardianRepository.ts:43`, `SchoolAdminModuleService.ts:487-489` and the id redirect in
  `DesktopSyncWorker.ts:516` all update named columns), so `photoUrl` survives. A regression test locks this in.

### 5.2 The base set (ported from `guardians.service.ts`)

Use the county predicate from `SqliteCountyStudentsReadModel`:
`OWN_COUNTY = (NOT EXISTS (SELECT 1 FROM counties) OR i.countyId IN (SELECT id FROM counties))`. It is private to
that file, so move it into the shared `./support` module and import it in both read models. *(my call: one
definition)*

- **A guardian is in the county list** when they have at least one `student_guardians` link to a student with
  `s.isActive = 1` at a school with `i.isActive = 1 AND OWN_COUNTY` (server `findByCounty` / `getStatsByCounty`).
- **A guardian's counted links ("county links")** are all their links to students at an `OWN_COUNTY` school, whatever
  the student's or school's active state. This is the nearest the device gets to the web, which counts every link.
  *(my call)*
  - `studentsCount` = number of county links.
  - `districts` = distinct district names of those students' schools, sorted by name. *(my call: the web keeps
    insertion order)*
  - `children` (profile) = those students.

### 5.3 List query (SQL-side filtering and paging)

The web filters a full list in the browser. The desktop filters and pages in SQL (as Students and Teachers do), with
the same results:
- **Search** (trimmed, non-empty): `firstName LIKE` or `lastName LIKE` or `phoneNumber LIKE` or `email LIKE`, each
  `%term%`. SQLite `LIKE` is ASCII case-insensitive, which matches the web's lowercase compare for names and email.
  Phone becomes case-insensitive too, which is harmless. Escape `%`, `_` and `\` in the term with `ESCAPE '\'`. *(my
  call: Students left this as a deferred minor)*
- **Relationship** (not "all"): `lower(trim(g.relationship)) = lower(?)`. "Other" matches only the word "other", as
  on the web. *(my call)*
- **District** (not "all"): `EXISTS` a county link whose school has `i.districtId = ?`. The web compares district
  names. Comparing by id gives the same result unless two districts share a name. *(my call)*
- **Order:** `lastName ASC, firstName ASC, id ASC`. The web orders by `lastName` only; the tie-breakers keep pages
  stable. *(my call)*
- **Paging:** `limit` (renderer sends 12; validator caps at 50) and `page` (≥ 1). Result:
  `{ county, districts, stats, data, total, page, limit, totalPages }`, where `total` is the filtered count that feeds
  "N parents found" and the pagination.
- **Row** (`CountyGuardianListItem`): `id`, `firstName`, `lastName`, `relationship`, `phoneNumber`, `email`,
  `photoUrl`, `studentsCount`, `districts: string[]`.
- `districts` (filter options): the same source as the County Students district filter (`listActiveDistricts`, the
  county's active districts), which matches the web's `/districts?countyId=`.

### 5.4 Stats (`getStatsByCounty`, ported)

Over the base set, independent of filters:
- `total` = number of guardians in the base set.
- `primaryGuardians` = base-set guardians with at least one `isPrimary = 1` link to an **active student at an active
  own-county school** (the server's stats filter the links this way).
- `childrenCovered` = sum of `studentsCount` over the base set. The web sums the unfiltered list's `studentsCount`.

### 5.5 Send Message → Messages with the school's admin selected

**Which school** *(my call)*: only **active** children at **active own-county** schools count, because the County
Admin can only message admins of their own county's schools, and a school a child has left is the wrong contact.
Among those children, take the school of the first one where this parent is primary, otherwise the first one's school.
"First" = children ordered by `lastName, firstName, id`. The profile result carries this as
`messageInstitutionId: string | null`. Null disables the button. That happens when every child of the parent is
inactive or at an inactive school. Those parents are still openable from a deep link (5.6).

**Web** (Nemis repo):
- **Server** `direct-messages.service.ts`: `toRecipient` adds `institutionId: org?.institutionId ?? undefined`
  (the org row already carries it). `EligibleRecipient` in `packages/types/src/messaging.ts` gains
  `institutionId?: string`.
- **`CeoDirectMessagePanel.tsx`**: read `?institutionId=` with `useSearchParams` (the page already wraps the panel in
  `Suspense`). Once recipients have loaded, select the first `INSTITUTION_ADMIN` recipient with that
  `institutionId` via `handleSelectItem(recipient, existingConversationId ?? null)`, once per mount. Follow
  `SchoolAdminDirectMessagePanel`'s `?userId=` handling. When nobody matches, select nothing (no error).
- **Server `guardians.service.ts` `findOne`**: the student select gains `isActive: true`. The institution select gains
  `countyId: true` and `isActive: true`. Each mapped student then carries `isActive`, and its `institution` carries
  `countyId` and `isActive`. Add them to the web's `GuardianStudent` type. These are additive. Nothing else in
  `findOne` changes, and the web profile's missing count/districts stay as they are.
- **Web parent profile**: Send Message becomes a button that `router.push`es
  `/government/county/messages?institutionId=<id>`. The web has no `messageInstitutionId`, so a small pure helper
  computes the same rule client-side from `guardian.students`. It keeps only active students whose institution is
  active and has `countyId === user.countyId`, then picks primary first, then first by name. When nobody qualifies,
  the button is disabled with the title "No linked school".

**Desktop:** the button `router.push`es `/government/county/messages?institutionId=<messageInstitutionId>`. Today that
page is the placeholder and ignores the parameter. The Messages port will pick it up. Add a new comment to the
placeholder `app/government/county/messages/page.tsx` saying it must honour `?institutionId=`, and note it in
section 7. No `mailto:` (the desktop blocks external navigation in `hardenWindow.ts`).

### 5.6 Profile query

`getGuardian(id)` → `CountyGuardianDetail | null`. It returns null when the guardian has no county links (a
non-county or unknown id) *(my call: the list's base set additionally needs an active child; the profile only needs
a county link, so a parent whose children all left stays openable from a deep link)*. Fields:
- `id`, names, `relationship`, `phoneNumber`, `email`, `address`, `occupation`, `isEmergencyContact`, `photoUrl`;
- `studentsCount`, `districts`, `messageInstitutionId`;
- `children[]`: `id`, `firstName`, `lastName`, `nemisId`, `photoUrl`, `isActive`, `isPrimary`,
  `institution { id, name, districtName }`, ordered as in 5.5.

The header's county name is not needed on the profile (the web shows none).

### 5.7 Layers

Mirror the County Students slice file by file:
- **types** (`packages/types/src/county-guardians.ts`, exported from the index): `CountyGuardiansQuery`,
  `CountyGuardiansResult`, `CountyGuardianListItem`, `CountyGuardianStats`, `CountyGuardianDetail`.
- **application:** `ICountyGuardiansReadModel` (`listGuardians(query)`, `getGuardian(id)`);
  `GetCountyGuardiansUseCase` (adds county + districts, as Students does); `GetCountyGuardianDetailUseCase`;
  `CountyApplicationService` methods; port `countyGuardians`; an in-memory fake under `testing/county/`.
- **presentation:** `CountyGuardiansViewModel` and `CountyGuardianDetailViewModel`, with hooks, following the
  Students view models (`trackQuery`).
- **electron:** `SqliteCountyGuardiansReadModel`, wired in `createDataLayer` and `createApplicationComposition`, with
  the new key added to `deferredApplication` in `main.ts`. IPC channels `county:list-guardians` and
  `county:get-guardian` (COUNTY_ADMIN only, as the other county channels), validators (limit ≤ 50, id non-empty
  string). Handler `ipc/handlers/county/guardians.ts`, preload `preload/county/guardians-api.ts`, bridge
  `services/nemis-bridge/county/guardians-bridge.ts`, and the renderer facade.
- **renderer:**
  - `app/government/county/parents/page.tsx` replaces the placeholder (the list component can live in
    `components/county/parents/`);
  - `components/county/parents/ParentProfilePage.tsx` behind `app/government/county/parents/details/page.tsx`, under
    `Suspense` (`useSearchParams`);
  - photos through the existing `SchoolPhoto` / avatar components with the right fallbacks (`/parent-fallback.jpg`,
    `/student-fallback.jpg`), so the CSP's Cloudinary rule applies as on Students;
  - NEMIS ID formatted as the County Students page does.

## 6. Testing

- **Server (Nemis):**
  - snapshot: guardians carry `photoUrl` from the linked user, null without one;
  - `getEligibleRecipients` for a County Admin includes `institutionId` on School Admin recipients.
  - `findOne` students carry `isActive` and `institution.countyId` / `institution.isActive`.
- **portal-web (Vitest):**
  - the CEO panel selects the matching School Admin from `?institutionId=`, and selects nothing for an unknown id;
  - the school-choice helper: primary first, then first by name; skips inactive children, inactive schools and other
    counties; null when nobody qualifies (button disabled).
- **Desktop migration:** 036 adds the column, resets `lastFullResyncAt`, and leaves the guardians triggers unchanged.
  An update to a guardian after 036 produces an outbox payload **without** `photoUrl`.
- **Desktop importer:** `photoUrl` is stored, and a snapshot without the field still imports.
- **Guardian writers:** a school-admin guardian edit keeps an existing `photoUrl`.
- **SQLite read model:**
  - base set (inactive child only → excluded from the list; inactive school only → excluded; other county → excluded);
  - county links counting inactive children;
  - each filter, including relationship case ("FATHER" matches "Father") and LIKE escaping;
  - order and paging;
  - each stat (primary only via an active link);
  - districts sorted and distinct;
  - profile children order, `isPrimary`, `isActive`, `messageInstitutionId` (primary first, then first child; an
    inactive primary child is skipped; null when all children are inactive or at inactive schools);
  - unknown or non-county id → null.
- **Use cases / view models:** follow the Students tests.
- **IPC:** role guard and validators, as `handlers/county/students.test.ts`.
- **Renderer:**
  - list parity (header, cards, filters incl. debounce, toggle, empty state, paging window, links);
  - profile sections (engagement levels, emergency line, email "Not provided", status/Primary badges, child link,
    Send Message target and disabled state);
  - not-found state.

## 7. Known risks and open points

- **Desktop Send Message lands on a placeholder** until the County Messages page is ported. That port must read
  `?institutionId=`.
- **Photo freshness:** a parent changing their user photo doesn't bump `guardians.updatedAt`, so delta pulls miss it
  until the next full resync (same as the Students deferred minor).
- **Multiple School Admins at one school:** the web selects the first matching recipient (the server orders by name).
- **One admin of two schools:** `toRecipient` reads only the user's latest matching org (`take: 1`), so such an admin
  carries one `institutionId`, and a link naming their other school selects nobody. Accepted (rare).
- **Counts differ from the web** for parents with children in other counties (decided, section 2.2 item 2).
- **Merge with Teachers:** expect small conflicts in the shared files listed in section 4.
