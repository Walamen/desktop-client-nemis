import { contextBridge } from 'electron';
import type { NemisApi } from '@nemis-desktop/types';
import { sharedApi } from './shared';
import { schoolAdminApi, teacherDirectoryApi } from './school-admin';
import { teacherDashboardApi } from './teacher';
import { deepFreeze } from './deep-freeze';
import './county';
import './deo';
import './ministry-portal';

/** Renderer-facing bridge, composed from per-portal files — the same split
 * as services/nemis-bridge/ and electron/ipc/handlers/ on the other two
 * sides of this boundary:
 *   shared/       — auth, provisioning, sync, system, settings, identity,
 *                   device, attendance, generic records
 *   school-admin/ — dashboard, school, academics, students, staff directory,
 *                   timetable
 *   teacher/      — the teacher's own dashboard method
 *   county/, deo/, ministry-portal/ — placeholders, no channels yet
 * `teacher` is the one NemisApi key genuinely owned by two portals — merged
 * here the same way lib/ipc/index.ts merges the ApplicationLayer `teachers`
 * service on the renderer side. */
const nemisApi: NemisApi = {
  ...sharedApi,
  ...schoolAdminApi,
  teacher: {
    ...teacherDirectoryApi,
    ...teacherDashboardApi,
  },
};

// Deep-frozen before crossing the context bridge: renderer code runs in a
// separate (sandboxed, isolated) JS context but still receives this exact
// object by reference. Without freezing, a compromised or malicious script
// running in the renderer could reassign `window.nemis.auth.login` (or any
// other bridge method) to intercept credentials or tamper with IPC calls.
contextBridge.exposeInMainWorld('nemis', deepFreeze(nemisApi));
