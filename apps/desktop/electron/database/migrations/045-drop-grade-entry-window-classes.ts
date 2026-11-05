import type { Migration } from './types';

/**
 * Grade entry windows are window-only: the per-class rows are gone on the
 * server, so the local mirror (and its triggers, which SQLite drops with the
 * table) goes too.
 */
export const dropGradeEntryWindowClasses: Migration = {
  version: 45,
  name: 'drop-grade-entry-window-classes',
  up(db) {
    db.exec('DROP TABLE IF EXISTS grade_entry_window_classes;');
  },
};
