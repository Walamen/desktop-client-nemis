import { describe, expect, it } from 'vitest';
import { buildBackupFileName } from './backupFileName';

describe('buildBackupFileName', () => {
  const date = new Date('2026-07-15T09:30:05Z');

  it('formats a sortable UTC timestamp', () => {
    expect(buildBackupFileName(date)).toBe('nemis-2026-07-15T09-30-05.db');
  });

  it('appends a sanitized label', () => {
    expect(buildBackupFileName(date, 'Before Upgrade!')).toBe(
      'nemis-2026-07-15T09-30-05-before-upgrade.db',
    );
  });
});
