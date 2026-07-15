import { describe, expect, it } from 'vitest';
import { buildBackupFileName } from './backupFileName';

describe('buildBackupFileName', () => {
  const date = new Date('2026-07-15T09:30:05.123Z');

  it('formats a sortable UTC timestamp with millisecond precision', () => {
    expect(buildBackupFileName(date)).toBe('nemis-2026-07-15T09-30-05-123.db');
  });

  it('appends a sanitized label', () => {
    expect(buildBackupFileName(date, 'Before Upgrade!')).toBe(
      'nemis-2026-07-15T09-30-05-123-before-upgrade.db',
    );
  });

  it('omits the suffix when the label sanitizes to nothing', () => {
    expect(buildBackupFileName(date, '!!!')).toBe('nemis-2026-07-15T09-30-05-123.db');
  });
});
