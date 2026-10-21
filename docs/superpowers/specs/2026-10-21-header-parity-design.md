# Desktop Header parity with portal-web — design

Date: 2026-10-21 · Repos: `desktop-client-nemis` (most of it) and `Nemis` (server snapshot + profile sync)

## Why

The desktop shell Header ([Header.tsx](../../../apps/desktop/renderer/components/shell/Header.tsx)) is one component used by every portal role. It falls short of the web Header ([Nemis/apps/portal-web/src/components/Header.tsx](../../../../Nemis/apps/portal-web/src/components/Header.tsx)) in two ways:

1. **County Admin sees "User" and "—" instead of their name and role.** Root cause: the Header reads the signed-in user from the workspace's local `users` table (`GetCurrentUserUseCase` → `users.findById(currentUserId)`). That table is filled from the server provisioning snapshot, and the snapshot only includes users whose role assignment points at an institution in scope (`desktopRoleMemberships`, `desktop-provisioning.service.ts` ~L295), plus county DEOs. A County Admin's assignment has `countyId` and no `institutionId`, so their own row never arrives, the lookup returns `null`, and the view state is `empty`. The County dashboard greeting is blank for the same reason. DEO and Ministry Admin very likely have the same gap.
2. **Missing features the web has:** a working notification bell, a messages dropdown, Edit Profile, the profile photo, and a busy state on logout.

Success: every role's Header shows the signed-in person's real name, role label and photo. County, School Admin and Teacher get a working notification bell and messages dropdown. Every role can edit their profile, offline included (password excepted).

## Goals

- **G1. Name and role for every role.** The server snapshot always includes the caller's own `users` row and their own `userOrganizations` row(s), whatever the scope (NATIONAL, COUNTY, DISTRICT, INSTITUTION, TEACHER). This also fixes the County dashboard greeting, and DEO/Ministry at the same time.
- **G2. Header robustness.** Name, role and photo stay on screen while the user reloads (`status === 'refreshing'`), and don't flash back to "User". Remove the two debug `console.log` calls (Alvin has one of them as an uncommitted local edit; see "Constraints").
- **G3. Notification bell: County, School Admin, Teacher.** Behaves like the web `NotificationBell`:
  - The badge counts unread notifications, excluding type `NEW_MESSAGE`; above 99 it shows "99+".
  - Clicking opens a dropdown of up to 5 unread non-message notifications, newest first. Each shows the title, a coloured type tag (port the web's `getNotificationMeta`), the message clamped to 2 lines, and a relative time (port `relativeTime`).
  - Clicking an item navigates to its `link` and closes the dropdown.
  - The footer has "View all notifications", which goes to that role's `/notifications` page.
  - The empty state says "No notifications".
  - It reads from the device (`user_notifications`), so it works offline. It refreshes after each sync and after the user reads notifications on the Notifications page (the existing `useRevalidateOnSync` pattern; mind the persistent-layout staleness trap noted from the orphaned-pages work).
- **G4. Messages dropdown: County, School Admin, Teacher.** Behaves like the web `MessageDropdown`:
  - A chat icon whose badge is the total unread message count; above 9 it shows "9+".
  - Clicking opens the 5 most recent conversations. Each shows the counterpart's avatar (with photo), name, role (underscores → spaces), last message preview (bold when unread), relative time, and that conversation's unread count.
  - Clicking a conversation opens `<basePath>/messages?conv=<id>`; the Messages page must honour that parameter.
  - The footer has "View all messages". The empty state says "No conversations yet".
  - Reads from the device and works offline.
  - **The data is direct messages, as on the web (decided by Alvin).** Today the snapshot sends direct conversations and messages for COUNTY scope only (`directMessagesFor`, `desktop-provisioning.service.ts` ~L284–294). Extend it to INSTITUTION and TEACHER scope (the caller's own direct conversations). Move the desktop School Admin and Teacher Messages pages onto direct messages so they match the web's `SchoolAdminDirectMessagePanel` / `TeacherDirectMessagePanel`. The direct-message view replaces the older student-linked `conversations`/`messages` view on those pages. Before removing the old view, check the web pages for anything of the student-linked threads that still lives there, and keep that if so. Sending works as it does for County today (online), unless the existing code already supports offline sending for these roles.
- **G5. Profile photo in the Header.** The avatar shows the user's photo when one exists and initials otherwise, falling back to initials if the image fails to load (offline, broken URL).
- **G6. Logout busy state.** While signing out, the item reads "Signing out…" and is disabled, so a double click can't fire it twice. If sign-out fails, still route to the sign-in screen, as the web does, and log the error.
- **G7. Edit Profile: every role.** The "Profile (coming soon)" menu item becomes "Edit profile" and opens a modal mirroring the web `EditProfileModal`:
  - **Fields:** first name (required, ≤100), last name (required, ≤100), phone number (optional), email (read-only, "Email cannot be changed").
  - **Photo:** upload or replace (jpg/jpeg/png/webp, ≤5 MB, validated before saving) and delete (with a confirm).
  - **Change password section:** current, new (≥8) and confirm, each with a show/hide toggle.
  - Success and error messages match the web's wording.
  - **Do not port** the web modal's debug output (the console logs and the yellow "Validation Errors" JSON block).

## Offline behaviour of Edit Profile (decided by Alvin)

- **Name, phone and photo work offline.** They're written to SQLite immediately and the Header updates straight away. A sync record is queued and the user is told it saved. They go up on the next sync, following the Offline-First Contract.
- **Password change is online-only.** While offline, the password section is disabled and shows a clear message: "Connect to the internet to change your password." While online, it calls the server directly (`PATCH /users/profile` with `currentPassword`/`newPassword`) through the main process. It never queues and never stores either password on the device. A wrong current password shows the server's message.
- **Conflicts: the most recent change wins.** If the same profile was changed on the web before the desktop's offline edit syncs, whichever change was made later wins. A desktop edit that loses must not vanish silently (repo rule "Never silently discard user data"). It is recorded as a conflict and visible on the existing Sync pending-changes page, the same way other sync conflicts are.
  - **Truly most recent, for fields and photo alike (decided by Alvin).** A later desktop edit overwrites an earlier web edit.
  - **New server timestamp (approved by Alvin).** `User.updatedAt` can't be used: it is `@updatedAt`, and `auth.service.ts` writes `lastLoginAt` on every login, so it changes without any profile change. Add a profile-only timestamp column (e.g. `profileUpdatedAt`, with a Prisma migration). Only changes to first name, last name, phone or photo touch it, whether they come from the web endpoints (`PATCH /users/profile`, the photo endpoints) or from the desktop push path. Include it in the snapshot's `users` rows.
  - The generic `mutationDecision`/`sharedTimestamp` rule in `desktop-sync-applier.ts` (the server wins on any `updatedAt` difference) does **not** apply to profile pushes; the profile handler uses the new timestamp instead.
  - **Photos follow the same rule.** The photo push path must not call the unconditional `PATCH /users/me/profile-image` / `DELETE /users/profile/photo` as they are. It needs a most-recent-wins check against the same timestamp (a desktop-only endpoint or a conditional parameter, builder's call), and a losing photo edit is recorded as a conflict.

## Non-goals

- DEO and Ministry Admin don't get the working bell or messages dropdown. They wait for their own portal ports (decided by Alvin). For those two roles: hide the messages icon, and show the bell without a dropdown or badge (builder's call; see below). They **do** get G1, G2, G5, G6 and G7.
- No online-presence dot in the messages dropdown, because the desktop has no presence feed (my call).
- No working Quick Search; the web's input doesn't search either. Keep the existing disabled input.
- No email change, and no changes to the web Header.
- No Settings menu item beyond what exists (it stays "coming soon").

## Anti-goals (failure even if it "works")

- Showing a fake or placeholder name ("User") for a provisioned account in any role.
- Storing or queuing a password, current or new, anywhere on the device.
- An offline profile edit that disappears with no trace after syncing.
- Notification or message counts that come from the toast store. Today's bell counts `stores.notifications`, which holds pop-up toasts, not inbox items. That must go.
- Letting a device change any user other than the signed-in one, or any field other than first name, last name, phone and photo.

## Constraints

- Follow the existing hexagonal / CQRS / MVVM layering (Alvin's standing choice for this programme): use cases in `@nemis-desktop/application`, ViewModels in `@nemis-desktop/presentation`, SQLite adapters plus validated IPC in the main process, and the renderer only through `window.nemis` via `services/nemis-bridge`. Respect the renderer ESLint boundary guard.
- **Server first.** The server snapshot change (G1) and the server's acceptance of profile pushes ship before, or together with, the desktop. Existing devices pick up G1 on their next pull without re-provisioning (verify; the merge path is upsert).
- Server pushes accept **only** the signed-in user's own row (`entityId === context.userId`) and **only** `firstName`, `lastName`, `phoneNumber`, plus the photo through its own path. Everything else is rejected as a conflict.
- Photos are files, so they can't ride the generic JSON outbox. Use a dedicated push path like assignment attachments (`BackendProvisioningGateway` multipart + a sync service), calling the existing `PATCH /users/me/profile-image` and `DELETE /users/profile/photo`. Stage pending photo files under the workspace directory, as attachments are.
- "Most recent wins" compares the desktop edit's time with the server's `profileUpdatedAt`. The server clock vs. device clock issue already bit attendance (see the teacher-sync-conflict-fixes notes). The builder must pick a comparison that tolerates device clock skew (for example, translating the edit time using the server time seen at the last pull), and document it.
- **Server-first ordering also covers** the direct-message snapshot extension for INSTITUTION/TEACHER scope and the `profileUpdatedAt` migration.
- Alvin has uncommitted local edits in `Header.tsx` (one debug `console.log`) and `CountySettingsPage.tsx`. Don't commit them as part of this work; branch from `main` without carrying them, and ask before touching them.
- Process: spec → plan → subagent-driven build with review (Alvin's standing preference).

## What already exists to build on

- Local tables: `users` (now including `photoUrl`, `phoneNumber`), `user_notifications`, `conversations`, `messages`.
- Notifications pages: County `CountyNotificationsPage`; School Admin and Teacher the shared `NotificationsPage`. County notifications already sync "mark read" (`user_notifications` is allowed for COUNTY_ADMIN in `desktop-sync-applier.ts`).
- Messages pages: County `SqliteCountyMessagingReadModel`; School Admin and Teacher the shared `MessagesPage`.
- `headerConfigs[role]` in `sidebarConfig` already carries per-role settings (`avatarRole`). Add per-role flags/paths there rather than branching on role inside the Header.
- `@nemis-desktop/ui` has `Modal`, `Dropdown`, `Avatar`, `Input` and `Button`.

## Left to the builder

- Use-case, ViewModel, IPC channel and migration names and shapes.
- Whether the bell/messages counts come from one combined "header summary" query or two.
- Exactly how DEO/Ministry's placeholder bell looks (hidden vs. plain icon), as long as it doesn't pretend to have data.
- How the role label is chosen: mirror the web's `staticRoleLabel` → mapped role → raw role order if `headerConfigs` can carry it; otherwise the humanised assignment role.
- The clock-safe "most recent wins" comparison (see Constraints).
- How a pending local photo is displayed before it syncs (e.g. a file served from the workspace staging folder through a safe protocol). Never expose `fs` to the renderer.
- Tests: at minimum, a provisioning test proving a County Admin's (and DEO's, Ministry's) own user row is in the snapshot; Header tests for refreshing and no-name states; server applier tests for own-row-only, field allow-list and most-recent-wins; desktop tests for the offline edit → queue → push path, and for the password section being disabled offline.
