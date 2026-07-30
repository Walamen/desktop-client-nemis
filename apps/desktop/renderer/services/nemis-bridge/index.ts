/** Renderer-side callers of the Electron preload bridge (`window.nemis`),
 * organized per portal — the same shape as apps/portal-web/src/store.
 * Import the bucket that owns the operation you need:
 *   sharedBridge      — auth, sync, current user, device, attendance, generic records
 *   schoolAdminBridge — school profile, academics, students, staff, timetable
 *   teacherBridge     — teacher's own dashboard (grows as more lands)
 *   countyBridge / deoBridge / ministryPortalBridge — placeholders, no live endpoints yet
 * Error translation happens one layer up, in lib/ipc/. */
export * from './shared';
export * from './school-admin';
export * from './teacher';
export * from './county';
export * from './deo';
export * from './ministry-portal';
