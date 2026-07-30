import type {
  SchoolAdminDeleteRequest,
  SchoolAdminListRequest,
  SchoolAdminSaveRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

/** Generic per-institution key/value collection store (the preload channel is
 * `window.nemis.schoolAdmin` — kept as-is for IPC compatibility with
 * electron/preload). Despite the name this isn't school-admin-only: finance,
 * messaging, notifications, reports and grading across every portal read and
 * write records here through a `collection` string acting as a pseudo-table
 * name, because those features don't have dedicated typed IPC endpoints yet.
 * Prefer a real typed bridge method over adding a new `collection` here when
 * one becomes available. */
export const collectionsBridge = {
  listSchoolAdminRecords: (request: SchoolAdminListRequest) => api().schoolAdmin.list(request),
  saveSchoolAdminRecord: (request: SchoolAdminSaveRequest) => api().schoolAdmin.save(request),
  deleteSchoolAdminRecord: (request: SchoolAdminDeleteRequest) => api().schoolAdmin.delete(request),
};
