import path from 'node:path';

export interface DatabasePaths {
  /** <userData>/database — owns the db file, WAL/SHM siblings, and backups. */
  directory: string;
  /** <userData>/database/nemis.db */
  databaseFile: string;
  /** <userData>/database/backups */
  backupsDirectory: string;
}

export const DATABASE_FILE_NAME = 'nemis.db';

/** Pure so tests never need Electron's app.getPath(). */
export function resolveDatabasePaths(userDataDir: string): DatabasePaths {
  const directory = path.join(userDataDir, 'database');
  return {
    directory,
    databaseFile: path.join(directory, DATABASE_FILE_NAME),
    backupsDirectory: path.join(directory, 'backups'),
  };
}
