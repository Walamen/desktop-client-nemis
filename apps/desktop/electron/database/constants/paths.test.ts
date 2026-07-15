import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDatabasePaths } from './paths';

describe('resolveDatabasePaths', () => {
  it('derives all paths from the user data directory', () => {
    const paths = resolveDatabasePaths(path.join('C:', 'Users', 'x', 'AppData', 'nemis-desktop'));
    expect(paths.directory.endsWith(path.join('nemis-desktop', 'database'))).toBe(true);
    expect(paths.databaseFile).toBe(path.join(paths.directory, 'nemis.db'));
    expect(paths.backupsDirectory).toBe(path.join(paths.directory, 'backups'));
  });
});
