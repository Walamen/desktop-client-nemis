# County Messages + Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Messages:** ported read-offline / send-online, with a live socket.
- **Notifications:** ported fully offline.
- **Quirks:** M1–M3 and N1–N5 fixed on both sides.

**Architecture:**
- **Server:**
  - the snapshot sends the County Admin's own direct conversations and messages
  - `getMessages` returns the newest window
  - recipients get a district fallback
- **Desktop:**
  - **Reads:** migration 038 adds pull-only tables and forces a full resync. Reads go hexagonal: a port with use cases, then a ViewModel, then SQLite.
  - **Commands:** they follow the County online-command precedent (`runOnline` + forced pull; handler → `BackendProvisioningGateway`). The pull is the only writer of local truth (D5).
  - **Socket:** a main-process `RealtimeClient` (socket.io-client 4.8.3, session cookie auth). It feeds a new `nemis:event` push channel, and triggers pulls.

**Spec:** `docs/superpowers/specs/2026-10-21-county-messages-notifications-design.md`

## Global Constraints

- Branch `feat/county-messages` in both **main checkouts**. Native inline build. Nemis server path is `apps/Server`. Files are CRLF: use Edit or node scripts written to the scratchpad (no heredoc'd scripts with backticks). There's no python.
- **County recipients rule:**
  - active users with an active org that is either `role='DEO' AND countyId=<county>`, or `role='INSTITUTION_ADMIN' AND institution.countyId=<county>`
  - excludes self
  - ordered by firstName, lastName
  - one org per user: the lowest org id among matching orgs
- **Counterpart role and institution:** the counterpart's first active org (lowest id), as the server's `listConversations` resolves it.
- **Unread** = incoming messages (`senderId != me`) with `isRead = 0`.
- **Online-only commands:** disabled when offline. Copy: "Messages need a connection to send."
- **Notifications:** 20 per page, Load more; Unread = unread notifications only; Total = all notifications; System Alerts = unresolved alerts in the county.
- **Test env:**
  - Temporary Node-ABI binary in `node_modules/better-sqlite3/build/Debug/` (from scratchpad `prebuild/`); delete it at the end.
  - Run server jest and desktop vitest one after the other; background long runs.
- **Known pre-existing failures:** desktop `renderer/app/page.test.tsx` and `teacher/timetable/timetable.test.tsx`.

## Review Focus

1. **An older server with no direct collections.** The import succeeds, and the page shows no conversations. The test is in Task 4.
2. **A `new-message` for a conversation not yet on the device.** A pull is triggered, with nothing written directly. The test is in Task 10.
3. **Socket auth expiry.** The socket reconnects with a fresh session, and never loops faster than its backoff. The test is in Task 10.
4. **Marking read offline.** No command is sent, and the unread count stays. The test is in Task 11.
5. **`?institutionId=` for a school with no School Admin.** Nothing is selected, and there's no crash. The test is in Task 13.

---

### Task 1: Server — snapshot direct conversations + messages

- Modify `Nemis/apps/Server/src/desktop-provisioning/desktop-provisioning.service.ts`:
  - after `counties`, for `scope.scopeType === "COUNTY"` only, load the user's conversations (`OR initiatorId/recipientId = user.userId`, `sinceFilter`)
  - load their messages (`conversationId in all of the user's conversation ids`, `sinceFilter`)
  - resolve counterparts (users + first active org by id, institution name, `cloudinaryService.getProfileImageUrl` or the existing photo helper)
  - emit `directConversations` (with the `counterpart*` columns) and `directMessages`
- Add both to `Nemis/packages/types/src/desktop-provisioning.ts` and to the empty snapshot.
- Test: `desktop-provisioning.direct-messages.spec.ts`, mocked Prisma in the service's existing spec style:
  - `county snapshots carry the user's conversations with the counterpart and their messages`
  - `other scopes carry none`
  - `a delta only includes rows updated since`
- [ ] RED → implement → GREEN (`npx jest src/desktop-provisioning`, `npx tsc --noEmit`) → commit `feat(desktop-sync): County devices receive their direct conversations`

### Task 2: Server — newest messages (M1), recipient district fallback (M2)

- `direct-messages.service.ts`:
  - **M1:** `getMessages` without `params.page` takes the newest `limit` (`orderBy desc`, `take limit`, then reverse to ascending). With `page`, behaviour is unchanged.
  - **M2:** the county `orgInclude` adds `institution: { select: { name, districtId, district: { select: { id, name } } } }`. `toRecipient` falls back to the institution's district for `districtId`/`districtName`.
- Test, added to `direct-messages.service.spec.ts`:
  - `without a page the newest messages come back, oldest first`
  - `a School Admin without a district on the org takes the school's district`
- [ ] RED → implement → GREEN → commit `fix(messages): long threads show their newest messages; school admins carry their district`

### Task 3: portal-web — M3 + N1–N4

- `components/messaging/sidebar-items.ts`: extract `buildSidebarItems(recipients, conversations)` from `CeoDirectMessagePanel`. It adds conversations whose counterpart isn't a recipient after the eligible ones, as `recipient` built from `counterpart`. The panel uses it.
- `notifications/page.tsx`:
  - **N1:** the Unread card = `notifUnread`.
  - **N2:** Total comes from a separate unfiltered query's `meta.total`.
  - **N3:** the subtitle is `text-slate-300`.
  - **N4:** `page` state with Load more, appending pages, until `items.length >= meta.total`.
- Tests: `sidebar-items.test.ts` (eligible first by last message, then contacts by name, then orphaned conversations) and `notifications/page-state.test.ts` if a helper is extracted.
- [ ] RED → implement → GREEN (vitest, tsc) → commit `fix(county): messages keep past conversations; notifications show true totals and page`

### Task 4: Desktop — migration 038, importer, collections

- `electron/database/migrations/038-create-direct-messages.ts`:
  - `direct_conversations(id PK, initiatorId, recipientId, lastMessageAt, createdAt, updatedAt, counterpartUserId, counterpartFirstName, counterpartLastName, counterpartPhotoUrl, counterpartRole, counterpartInstitutionName)`
  - `direct_messages(id PK, conversationId, senderId, content, isRead INTEGER, readAt, createdAt, updatedAt)`
  - indexes `(conversationId, createdAt)` and `(lastMessageAt)`
  - `UPDATE sync_metadata SET lastFullResyncAt = NULL`, guarded like 036
  - registered in the migrations index
- `PROVISIONING_COLLECTIONS` gains `'directConversations','directMessages'`. `ProvisioningImporter` specs, and table names, for both.
- Tests:
  - the migration test (tables, no outbox triggers, resync forced)
  - the importer test: `imports direct conversations and messages`, and `an older snapshot without them imports` (Review Focus 1)
- [ ] RED → implement → GREEN → commit `feat(county): direct messages are pulled into the device`

### Task 5: Desktop — types and channels

- `packages/types/src/county-messaging.ts`:
  - `CountyMessageRecipient {userId, firstName, lastName, photoUrl, role, districtId, districtName, institutionId, institutionName}`
  - `CountyDirectConversation {id, lastMessageAt, createdAt, counterpart: {userId, firstName, lastName, photoUrl, role, institutionName}, lastMessage, unreadCount}`
  - `CountyDirectMessage {id, conversationId, senderId, content, isRead, readAt, createdAt, isOwn, senderName}`
  - `CountyMessagingOverview {recipients, conversations}`
  - `CountyStartConversationRequest {targetUserId, initialMessage}`
  - `CountySendMessageRequest {conversationId, content}`
- `county-notifications.ts`:
  - `CountyNotification {id, type, title, message, isRead, link, createdAt}`
  - `CountyNotificationsQuery {filter, page, limit}`
  - `CountyNotificationsPage {items, total, totalAll, unread, alertsUnresolved}`
- `realtime.ts`: `RealtimeEvent = {type:'message'; conversationId} | {type:'notification'} | {type:'presence'; userId; online} | {type:'synced'}`.
- **Channels:**
  - `county:messaging-overview` (`[]`)
  - `county:messaging-messages` (`[conversationId]`)
  - `county:messaging-start`, `county:messaging-send`, `county:messaging-mark-read` (`[conversationId]`, `OnlineCommandResult<null>`)
  - `messaging:online-users` (`[userIds: string[]] → string[]`)
  - `county:notifications-list`, `county:notifications-mark-read` (`[id]`), `county:notifications-mark-all-read` (`[]`)
- `CountyApi` and a new `EventsApi { subscribe(listener): () => void }` on `NemisApi`.
- [ ] Types only; commit with Task 6.

### Task 6: Desktop — application ports + use cases

- `ICountyMessagingReadModel`:
  - `getOverview(currentUserId): CountyMessagingOverview`
  - `listMessages(conversationId, currentUserId): CountyDirectMessage[] | null` (null when not a participant)
- `ICountyNotificationsRepository`:
  - `list(recipientId, query): CountyNotificationsPage`
  - `markRead(recipientId, id): boolean`
  - `markAllRead(recipientId): number`
- **Use cases:**
  - `GetCountyMessagingOverview` and `GetCountyMessages` (deps `currentUserId` from ports)
  - `GetCountyNotifications`
  - `MarkCountyNotificationRead` and `MarkAllCountyNotificationsRead` (commands, through the unit of work)
  - `CountyApplicationService` methods; in-memory fakes; wired in the factory and the test application
- Tests:
  - `overview and messages are for the signed-in user`
  - `marking a notification read is scoped to the recipient`
  - `mark all returns the count`
- [ ] RED → implement → GREEN → commit `feat(county): messaging and notifications use cases`

### Task 7: Desktop — SQLite messaging read model

- `SqliteCountyMessagingReadModel`:
  - **Recipients:** the Global rule over `users`, `user_organizations`, `institutions`, `districts`, `counties`. District = the org's `districtId`, else the institution's.
  - **Conversations:** `direct_conversations` with `unreadCount` and the `lastMessage` subqueries, ordered by `lastMessageAt DESC NULLS LAST, createdAt DESC`.
  - **Messages:** `direct_messages` ordered by `createdAt, id`; `senderName` = "You" or the counterpart's name.
- Tests:
  - `recipients are county DEOs and county School Admins, active, without me, by name`
  - `a school admin takes the school's district`
  - `pool DEOs and other-county users are excluded`
  - `conversations carry unread and last message, newest first`
  - `messages are oldest first with isOwn and senderName`
  - `a conversation the user is not in returns null`
- [ ] RED → implement + wire (data layer, composition) → GREEN → commit `feat(county): messaging read model over synced conversations`

### Task 8: Desktop — SQLite notifications repository

- `SqliteCountyNotificationsRepository`:
  - list filtered by recipient and filter, `createdAt DESC`, `LIMIT/OFFSET`
  - counts: total for the filter, `totalAll`, unread, and alerts unresolved in the own county (`alerts` where `countyId` is own county, or the alert's institution or district is in the county)
  - `markRead`/`markAllRead`: `UPDATE user_notifications SET isRead=1, updatedAt=?` for the recipient's unread rows, so the outbox triggers enqueue updates
- Tests:
  - `filters, pages of 20 and counts`
  - `alerts unresolved counts only the county`
  - `mark read writes an outbox update`
  - `mark read of someone else's notification changes nothing`
- [ ] RED → implement + wire → GREEN → commit `feat(county): notifications read and marked read on the device`

### Task 9: Desktop — gateway commands + IPC

- `BackendProvisioningGateway`: `startDirectConversation(req)`, `sendDirectMessage(req)` and `markDirectConversationRead(id)`, all `ONLINE_COMMAND`, returning null.
- Handlers in `county/messaging.ts`:
  - the reads go through the app; the commands use `runOnline(gateway…, refresh)`
  - `messaging:online-users` → the RealtimeClient (Task 10)
- `county/notifications.ts` handlers.
- Validators:
  - content is 1–5000 characters after trim
  - ids are single strings
  - the online-users list holds ≤ 500 ids
- Authorize: COUNTY_ADMIN for the `county:*` channels.
- Wire preload, bridge and the `countyIpc` facade.
- Tests: forwarding, validators, authorize, plus gateway request shapes (URL, method, body).
- [ ] RED → implement → GREEN; typecheck → commit `feat(county): messaging and notifications channels`

### Task 10: Desktop — RealtimeClient + push channel

- Add `socket.io-client@4.8.3` (exact) to `apps/desktop`.
- `electron/realtime/RealtimeClient.ts`, built with deps `{ connect(url, opts) → socket-like, getCookie(): Promise<string>, pullNow(): Promise<boolean>, emit(event: RealtimeEvent), isOnline(): boolean, now }`, with methods `start()`, `stop()` and `onlineUsers(ids): Promise<string[]>`.
  - It connects with `extraHeaders: { cookie }` and `transports: ['websocket']`, to `new URL('/notifications', apiBaseUrl)` with path `/socket.io`.
  - `new-message` → `pullNow()`, then `emit({type:'message', conversationId})`.
  - `new-notification` → `pullNow()`, then `emit({type:'notification'})`.
  - `user-online`/`user-offline` → `emit({type:'presence'})`.
  - `connect_error` → back off 2 s, 4 s … up to 60 s, refetching the cookie before each retry.
- `main.ts`:
  - start on sign-in, network online and workspace unlock; stop on sign-out or offline
  - `emit` = `mainWindow.webContents.send('nemis:event', event)`
  - also emit `{type:'synced'}` after each completed sync
- Preload: `events.subscribe(listener)` via `ipcRenderer.on('nemis:event')`, returning an unsubscribe. Renderer bridge: `realtimeBridge.subscribe`.
- Tests (fake socket):
  - `new-message triggers a pull then emits message`
  - `notification triggers a pull`
  - `presence events are forwarded`
  - `connect errors back off and refetch the cookie` (Review Focus 3)
  - `stop disconnects and cancels retries`
  - `onlineUsers asks get-online-users and returns the ack`
- [ ] RED → implement + wire → GREEN → commit `feat(desktop): live messages and notifications over the server socket`

### Task 11: Desktop — ViewModels

- `CountyMessagesViewModel`:
  - **State:**
    - `overview`
    - `selectedConversationId`, `pendingRecipient`
    - `messages`
    - `onlineUserIds`
    - `sending`
    - `commandError`
  - **Actions:**
    - `loadOverview()` and `select(recipient, conversationId | null)`. Select loads the messages, and marks read when online.
    - `send(content, online)`: send or start.
    - `refreshPresence(ids)`
    - `onRealtime(event)`: on message, reload the overview and the open thread; on presence, refresh presence.
- `CountyNotificationsViewModel`:
  - **State:** `page`, `filter`, and the accumulated `items`.
  - **Actions:** `load(filter)`, `loadMore()`, `markRead(id)`, `markAllRead()`.
- Tests:
  - `select loads the thread and marks read only online` (Review Focus 4)
  - `send starts a conversation for a pending recipient, then selects it after the refresh`
  - `send offline does nothing`
  - `a message event reloads the overview and the open thread`
  - `notifications: filter resets paging; load more appends; mark all read reloads`
- [ ] RED → implement + register + hooks → GREEN → commit `feat(county): messages and notifications ViewModels`

### Task 12: Desktop — Notifications page

- Markup port of the web page with N1–N5. `link` maps through `toDesktopRoute(link)` in `components/county/notifications/links.ts`:
  - `/government/county/<section>/<id>` → `/government/county/<section>/details?id=<id>`
  - other `/government/county/...` paths are kept
  - anything else gives null, and the link is hidden
- `useRevalidateOnSync` plus `useRealtime` (a notification event reloads).
- Tests:
  - `links.test.ts`
  - page: `cards show unread notifications, unresolved alerts and the all-time total`, `filter switches and load more appends`, `read marks one; mark all read disables when nothing unread`, `empty and error states`
- [ ] RED → implement → GREEN → commit `feat(county): Notifications page`

### Task 13: Desktop — Messages page

- `components/county/messaging/`:
  - `ConversationListItem`, `SidebarContactItem`, `MessageBubble`, `MessageThread`, `CountyMessagesPanel` (ports)
  - `sidebar-items.ts` (the Task 3 builder, copied)
  - `useRealtime` hook in `renderer/hooks/`
- `app/government/county/messages/page.tsx`: header band + Suspense + panel. It reads `?institutionId=` and `?conv=`. The TODO comment is removed.
- **Offline:** the composer is disabled with the copy, and a pending contact can't start a conversation.
- Tests:
  - `lists conversations then contacts, filters by role, district and name`
  - `selecting shows the thread with own and incoming bubbles`
  - `send calls the channel and clears the box`
  - `offline disables sending with the note`
  - `?institutionId selects that school's admin and the School Admin filter`
  - `?institutionId with no admin selects nothing` (Review Focus 5)
  - `online dots come from presence`
  - `a realtime message event reloads the thread`
- [ ] RED → implement → GREEN → commit `feat(county): Messages page with live updates`

### Task 14: Verify

- [ ] Desktop typecheck, lint, the full suite (only the 2 known failures) and the renderer build; delete the temporary binary.
- [ ] Server tsc + jest; portal-web tsc + vitest.
- [ ] Inline self-review against the spec and Review Focus; fix findings test-first; update memory; finishing-a-development-branch.
