# DEO Messages + Notifications — design (piece 9 of 10)

Date: 2026-11-17. Repos: desktop-client-nemis and Nemis, branch `feat/deo-messages` in both, cut from `main`.
Web layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.10 and §4.11. County precedent: `2026-10-21-county-messages-notifications-design.md` (most of the machinery is reused).

## Decisions (Alvin, 2026-11-17)

1. **Messages: the County model.** Readable offline: the district snapshot ships the DEO's own direct conversations and messages. Starting a conversation, sending and marking read need a connection and are disabled offline with a note. A live socket while online gives instant messages and the green online dots.
2. **Notifications: the DEO's own notifications, like County.** Both apps list the signed-in user's `user_notifications` (new direct messages, district assignment, and whatever else the platform sends a DEO). Fully offline on the desktop: they are already synced, and marking read goes out through the outbox. The web's derived district feed (`GET /districts/:id/notifications`: district alerts, district reports, DEO announcements and messages from the retired district-conversation system, with read state in a preference row) is retired from the page. Alerts stay on the Dashboard, reports on Generate Reports.

## What the web got wrong (fixed on both sides)

1. **`?userId=` was ignored.** The School Admins page's Message button links `/government/deo/messages?userId=<id>`, but the DEO panel only read `?conv=`. Now `?userId=` selects that person (their conversation if one exists, else a new chat with them) and sets the filter to their role.
2. **Past conversations vanished** when the counterpart stopped being an eligible contact (moved, deactivated). Listed after the eligible ones, readable, as County does (`sidebar-items.ts`, County fix M3).
3. **Notifications showed none of the DEO's real notifications** and linked the old message items to `/government/deo/communications`, a page that does not exist. Replaced by decision 2.
4. **Notification links** are stored as other portals' paths (`/messages/<id>` for a new message, `/deo/dashboard` for an assignment). Mapped: `/messages/<id>` → `/government/deo/messages?conv=<id>`; `/deo/dashboard` and `/deo` → `/government/deo`; `/government/deo/...` kept; anything else hides Open.

## Rules (identical on both sides)

- **Contacts** (server `DirectMessagesService.listEligibleRecipients`, DEO branch): active users other than the DEO with an active organisation that is either `COUNTY_ADMIN` of the district's county, or `INSTITUTION_ADMIN` whose `districtId` is the district or whose institution is in the district. One organisation per user (server: newest `assignedAt`; desktop: lowest id, as County does).
- **Sidebar:** the County Admin(s) pinned first; then a "SCHOOL ADMINS (N)" strip; School Admins with a conversation first (newest message first), then the rest by name; then past conversations with people who are no longer contacts.
- **Filters:** All / County Admin / School Admin; search matches first name, last name or school (hidden when only County Admin is selected).
- **Notification card type** from `UserNotificationType`:
  - `MESSAGE`: NEW_MESSAGE
  - `REPORT`: REPORT_SUBMITTED, REPORT_CARD_PUBLISHED
  - `ANNOUNCEMENT`: SYSTEM_ANNOUNCEMENT
  - `ALERT`: GENERAL_ALERT
  - `WARNING`: DEADLINE_REMINDER, BULK_UPLOAD_FAILED, SCHOOL_REJECTED, STUDENT_TRANSFER_REJECTED, DEO_UNASSIGNED, TRANSFER_CANCELLED
  - `SUCCESS`: SCHOOL_APPROVED, STUDENT_TRANSFER_APPROVED, BULK_UPLOAD_COMPLETED, DEO_ASSIGNED
  - `INFO`: everything else
- **Notifications page:** the §4.11 layout. Filter pills All / Unread then one per card type that has items, each with its count; newest first; 20 per page with Load more (the County fix N4); Mark as Read per card; Mark All as Read; Open (marks read, then navigates) only when the link maps.

## Data

- **Server snapshot (DISTRICT scope):**
  - `directConversations` / `directMessages` for the signed-in user (the existing `directMessagesFor`, until now COUNTY only).
  - The county's County Admin organisations (active and inactive, so a removed one reaches the device) and their users, in `userOrganizations` / `users`, so the contact list works offline.
- **Server applier:** a DEO device may push `user_notifications` (mark read); `userNotification()` still lets only the recipient change `isRead`.
- **Desktop migration 052:** one full resync on district devices only, so they receive the conversations and the County Admin.
- **Desktop:** `RealtimeClient` also runs for a DEO workspace. DEO use cases reuse the County ports for conversations, messages, the online commands and notifications (they are about the signed-in user, not the county); only the contact list is DEO-specific (`IDistrictOverviewReadModel.listMessageContacts`). Channels `deo:messaging-overview`, `deo:messaging-messages`, `deo:messaging-start`, `deo:messaging-send`, `deo:messaging-mark-read`, `deo:notifications-list`, `deo:notifications-mark-read`, `deo:notifications-mark-all-read`, DEO-only. `messaging:online-users` is opened to DEO.

## Pages (both apps)

- **Messages (§4.10):** banner "DEO Portal" / "Messages"; the two-pane panel; County Admin pinned with the crown; composer disabled offline on the desktop ("Messages need a connection to send.").
- **Notifications (§4.11):** banner "DEO Portal" / "Notifications"; heading "Notifications" over "DEO Portal · <District> · <County>"; the unread count; pills; tinted cards.

## Out of scope

- Sidebar and header unread badges.
- The server's `GET /districts/:id/notifications` and its mark-read routes stay (no web caller after this; removing them is a later clean-up).
- Message attachments; offline queuing of messages.

## Release order

Server first. Without it the desktop Messages page has no conversations or County Admin, and marking notifications read offline is refused by the server.
