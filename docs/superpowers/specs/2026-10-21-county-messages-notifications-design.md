# County Messages + Notifications — design

Date: 2026-10-21 · Repos: `desktop-client-nemis` + `Nemis` · Branch: `feat/county-messages` (both, main checkouts)

## Intent

Port the County Admin **Messages** page and the **Notifications** page to the desktop, copying the web's design and behaviour and fixing web quirks on both sides:
- Messages: `portal-web/.../county/messages/page.tsx`, which renders `components/messaging/CeoDirectMessagePanel` + `MessageThread`, `ConversationListItem`, `SidebarContactItem`, `MessageBubble`, and `useDirectMessaging`.
- Notifications: `.../county/notifications/page.tsx`.

Both desktop routes are generic placeholders today. `county/messages/page.tsx` carries a TODO: it must honour `?institutionId=`, which the County Parents page's Send Message link passes (2026-10-18 parents spec §5.5).

## Alvin's decisions (2026-10-21)

1. **Messages: read offline, send online.** The server sync sends the signed-in County Admin's own direct conversations and messages, so they can be read offline. Starting a conversation, sending and marking read need a connection. Offline, those controls are disabled with the usual note.
2. **Live socket** while the app is online: new messages arrive instantly, and the green "online" dots work, the same as the web.

How it gets made: the County standing choices from Finance and Reports.
- Native inline build in the main checkouts; no worktrees, no subagents.
- The full hexagonal path for page data and commands.
- Fix every web quirk on both sides.
- Server ships first: the snapshot gains collections.

## Data the device needs

| Data | Today | Change |
|---|---|---|
| Notifications (`user_notifications`, recipient = the signed-in user) | synced; isRead edits push through the outbox (sync applier handles `user_notifications`) | none |
| Alerts (unresolved count card) | synced (`alerts`) | none |
| Users + their organisations, for the recipient list | synced for the county (Users page) | none |
| Direct conversations + messages | **not synced** | snapshot collections `directConversations` and `directMessages` for the signed-in user, COUNTY scope only (Claude's call: no other desktop role has the page yet) |

- **`directConversations` rows**:
  - `id, initiatorId, recipientId, lastMessageAt, createdAt, updatedAt`
  - the counterpart as the server's `listConversations` shapes it: `counterpartUserId`, `counterpartFirstName`, `counterpartLastName`, `counterpartPhotoUrl`, `counterpartRole`, `counterpartInstitutionName`
- **`directMessages` rows**: `id, conversationId, senderId, content, isRead, readAt, createdAt, updatedAt` for those conversations.
- **Deltas** use `updatedAt`. A read receipt bumps the message's `updatedAt`.
- **Desktop migration 038** adds `direct_conversations` and `direct_messages`:
  - pull-only: not in the mutable tables, no outbox triggers
  - indexed on `conversationId` and `lastMessageAt`
- An older server sends no such collections; the tables stay empty and the page says there are no conversations yet.

## Messages page (desktop)

**Layout:** a markup port of the web panel.
- A sidebar with "Messages N of M", name search, the All / DEO / School Admin filter, and the district dropdown.
- The list: conversations first, by last message; then contacts by name.
- The thread pane: header with name, role, institution and online dot; message bubbles; composer.

**Reads (offline):**
- **Recipients** use the server's COUNTY_ADMIN rule, computed from synced users:
  - active users with an active org that is either DEO with `countyId` = own county, or INSTITUTION_ADMIN at an institution in the own county
  - sorted by first name, last name
  - excludes yourself
  - one org per user: the first matching one by id, since the desktop has no `assignedAt`
- **Conversations and messages** come from the new tables:
  - unread = incoming messages with `isRead = 0`
  - `isOwn` = sender is you
  - `senderName` = "You", or the counterpart's name

**Commands (online-only):**
- start conversation: POST `/direct-messages/conversations`, with the first message
- send: POST `…/conversations/:id/messages`
- mark read: PATCH `…/read`

**After a command:** the main process upserts the returned conversation or message straight into the local tables, so the thread updates at once, then asks for a background delta pull. Offline, the composer is disabled with "Messages need a connection to send." Mark-read runs when a conversation is opened while online.

**Deep links:**
- `?institutionId=` selects that school's School Admin, the same rule as the web's `findInstitutionAdmin`, and sets the filter to School Admin.
- `?conv=` selects that conversation.

### The socket (main process)

- **The client:** `electron/realtime/RealtimeClient.ts`, using `socket.io-client@4.8.3` (pinned to portal-web's version).
  - It connects to `<apiBaseUrl>/notifications` (path `/socket.io`) while a workspace is signed in and the network is online.
  - It authenticates with the desktop session's `access_token` cookie (the gateway already reads `cookie: access_token=`).
  - It reconnects with a fresh session on drop, and disconnects on sign-out or going offline.
- **Events:**
  - `new-message`: upsert the message when its conversation exists locally, else ask for a pull; then notify the renderer.
  - `new-notification`: ask for a delta pull; notify the renderer once the pull lands.
  - `user-online` / `user-offline`: forwarded to the renderer.
- **Presence:** the renderer asks for online user ids through `messaging:online-users`, which calls the socket's `get-online-users` ack, so the dots appear.
- **A new main → renderer push channel** (`nemis:event`): preload exposes `events.subscribe(listener) → unsubscribe`, with typed `RealtimeEvent` payloads. It's the first push channel on the desktop.

## Notifications page (desktop)

A markup port of the web page, offline:
- **Header:** "Notifications & Messages" and Mark all read.
- **Three cards:** Unread, System Alerts (unresolved), Total.
- **Filter:** All / Unread / Read.
- **The list:** severity colour and icon by type, relative time, the type label, "View details →", and a Read button.
- **Writes:** marking read updates the local rows, and the existing outbox pushes them.

## The quirks and their fixes (both sides)

| # | Where | Quirk | Fix |
|---|---|---|---|
| M1 | Messages (server) | A conversation shows only its **oldest** 30 messages: page 1 of an ascending list, so new messages in a long thread never appear. | Without a `page`, `getMessages` returns the **newest** `limit` messages, oldest first. |
| M2 | Messages (server) | A School Admin recipient has no district when their org lacks `districtId`, so the district filter hides them. | `districtId`/`districtName` fall back to the institution's district. |
| M3 | Messages (web + desktop) | A conversation whose counterpart is no longer an eligible recipient (moved, deactivated) vanishes from the sidebar with its history. | List such conversations too (after eligible ones), readable. Sending is left to the server to allow or refuse. |
| M4 | Messages (server) | Reading messages silently marks them read (`getMessages` side effect), so a preview fetch clears unread. | Kept: the web relies on it. The desktop reads locally and marks read explicitly. Documented, not changed. |
| N1 | Notifications | The "Unread — Notifications" card adds unresolved **alerts** to the unread notifications. | Unread = unread notifications only. Alerts have their own card. |
| N2 | Notifications | "Total — All notifications" shows the total for the **current filter**. | Total of all notifications, whatever the filter. |
| N3 | Notifications | The subtitle is `text-gray-600` on the dark header band, so it's unreadable. | `text-slate-300`. |
| N4 | Notifications | Only the first 20 notifications ever show, with no paging. | 20 per page with "Load more". |
| N5 | Notifications (desktop) | Links are web routes (`/government/county/schools/<id>`); the desktop uses `?id=` detail routes. | Map known `/<section>/<id>` links to the desktop's `/<section>/details?id=`; open other in-app paths as-is; hide external links. |

## Server (Nemis) changes

- **Snapshot:** `directConversations` + `directMessages` for COUNTY scope (fields above), delta by `updatedAt`. Counterpart fields are resolved like `listConversations`: the first active org's role and institution name; photo via `getProfileImageUrl`.
- `DirectMessagesService.getMessages`: M1.
- `listEligibleRecipients` (`toRecipient`): M2.
- Jest specs for each.

## portal-web changes

- `CeoDirectMessagePanel`: M3.
- `notifications/page.tsx`: N1, N2, N3, N4. N4 uses the API's `page`/`limit` with Load more.
- Vitest for the pure pieces: the sidebar list builder (M3), and an extracted page-state helper for N1/N2.

## Desktop changes

- **Types:**
  - `county-messaging.ts`:
    - `CountyMessageRecipient`, `CountyDirectConversation`, `CountyDirectMessage`, with the web shapes
    - `CountyMessagingSnapshot { recipients, conversations }`
    - the command requests and results
  - `county-notifications.ts`:
    - `CountyNotification`
    - `CountyNotificationsPage { items, total, unread, alertsUnresolved }`
    - `CountyNotificationsQuery { filter: 'ALL'|'UNREAD'|'READ', page, limit }`
  - `realtime.ts`: `RealtimeEvent`.
- **Channels:**
  - `county:messaging-overview`
  - `county:messaging-messages`
  - `county:messaging-start`, `county:messaging-send` and `county:messaging-mark-read` (online)
  - `messaging:online-users`
  - `county:notifications-list`, `county:notifications-mark-read`, `county:notifications-mark-all-read`
- **Application:**
  - `ICountyMessagingReadModel`
  - `ICountyMessagingGateway` (the online commands)
  - `ICountyNotificationsRepository`
  - use cases on `CountyApplicationService`
- **Adapters:** SQLite read model and notifications repository (mark-read writes go through the normal repository write path, so the outbox triggers fire); gateway methods on `BackendProvisioningGateway`; `RealtimeClient` + presence.
- **Presentation:** `CountyMessagesViewModel` (overview, thread, presence, commands, realtime events), `CountyNotificationsViewModel`.
- **Renderer:**
  - `components/county/messaging/*`: the five ported components and the panel
  - `app/government/county/messages/page.tsx` (Suspense for `useSearchParams`)
  - `app/government/county/notifications/page.tsx`
  - a `useRealtime` hook subscribing to `nemis:event`
- **Dependency:** `socket.io-client@4.8.3`.

## Non-goals

- Messages for the other desktop roles.
- Sidebar unread badges.
- Message attachments.
- Offline queuing of messages (decision 1).

## Release order

**Server first.** The desktop works against an older server, but its Messages page stays empty until the server sends the new collections.

## Left to the builder

- Socket reconnect timing.
- Exact SQL.
- Fixture details.
