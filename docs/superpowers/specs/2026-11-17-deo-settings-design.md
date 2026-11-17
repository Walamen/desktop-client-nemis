# DEO Settings — design (piece 10 of 10)

Date: 2026-11-17. Repos: desktop-client-nemis and Nemis, branch `feat/deo-settings` in both, cut from `main`.
Web layout reference: `2026-11-14-deo-portal-web-design-reference.md` §4.12.

## Decisions (Alvin, 2026-11-17)

1. **Notification Preferences switches are removed from both apps.** The server stores them in the preference row but nothing reads them, so they never changed any notification. The stored values stay on the server; removing the column and DTO field is a later clean-up.
2. **Desktop: read offline, save online.** The profile (name, email, phone, district, county) shows from synced data. Office Address is not synced: it loads from the server when connected. Save Changes and the password fields work only online, then a pull brings the new values back. Offline they are disabled with a note.

## What the web got wrong (fixed)

1. **Inert switches** (decision 1).
2. **Employee ID was made up** (`DEO-<district code>`, the same for every DEO of a district). The field is removed from both pages. The server still sends it; the web no longer shows it.
3. **Every save error read the same** ("Unable to save settings right now…"), even a wrong current password. The page now shows the server's message when there is one, and checks before sending: a new password needs the current one, and both need at least 8 characters (the server's rule).
4. **A blank first or last name was saved.** The server trimmed it to an empty string and stored it. Now it refuses with "First name cannot be empty." / "Last name cannot be empty." (400).

## Page (both apps; §4.12 layout, without the switches and Employee ID)

- Banner "DEO Portal" / "Settings"; heading "Settings" over "DEO Portal · <District> · <County>".
- Feedback strip after saving: success "Settings saved successfully.", or the error.
- **Profile Information:** initial tile, full name, "District Education Officer", district tag. Editable First Name, Last Name, Phone; read-only Email, District, County; Office Address textarea (255 max).
- **Security:** Current Password, New Password.
- **Save Changes** (primary, spinner while saving).
- Desktop offline: a note "Settings need a connection to save."; inputs for editing, the password fields and Save are disabled; Office Address shows "Loads when you are online." when it could not be fetched.

## Data

- **Server:** `GET /districts/:id/settings` and `PATCH /districts/:id/settings` (existing). The only server change is fix 4.
- **Desktop:**
  - `GetDeoSettingsUseCase` (offline): the signed-in user's synced `users` row (first name, last name, email, phone) and the district and county names; `districtId: null` when none is assigned.
  - Online, through the main process with the session's district (never the renderer's):
    - `deo:settings-remote` → GET settings, returns `{ officeAddress }`;
    - `deo:settings-save` → PATCH with `{ firstName, lastName, phoneNumber, officeAddress?, currentPassword?, newPassword? }`, then a pull (`runOnline`).
  - IPC validation: names 1–100 characters after trimming, phone ≤ 50, office address ≤ 255, passwords 8–128 and only as a pair, no other keys.

## Review fixes

- A wrong current password said "The email or password is incorrect." on the desktop (the gateway reads every 401 as a lost session). With a password change, the settings handler now reports "Current password is incorrect."
- Saved but not yet pulled back: the page keeps what was typed and says the change shows after the next sync, instead of flashing the old row.
- Reconnecting no longer replaces an office address being edited; a failed address load says so, with Retry, and is logged.
- Both apps' form checks also refuse a spaces-only new password, a current password under 8 characters, and passwords over 128.
- A failed reload after the page has shown data keeps the form on screen.

## Accepted

- The web Header keeps showing the old name until the next sign-in or reload (it reads the login session).
- The desktop shows the saved name after the pull; the header follows the existing session-refresh-on-sync.

## Out of scope

- Profile photo upload; removing the stored preference column.
