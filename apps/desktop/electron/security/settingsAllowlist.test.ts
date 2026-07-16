import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
import { assertRendererReadableSetting, RENDERER_READABLE_SETTINGS } from './settingsAllowlist';

describe('settings allowlist', () => {
  it('allows exactly the approved public settings', () => {
    expect([...RENDERER_READABLE_SETTINGS].sort()).toEqual(['language', 'theme']);
    expect(() => assertRendererReadableSetting('theme')).not.toThrow();
    expect(() => assertRendererReadableSetting('language')).not.toThrow();
  });

  it('rejects any key outside the allowlist with FORBIDDEN', () => {
    for (const key of ['sync.token', 'device.secret', 'THEME', 'theme ', '']) {
      try {
        assertRendererReadableSetting(key);
        expect.unreachable(`should have rejected "${key}"`);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).code).toBe('FORBIDDEN');
      }
    }
  });

  it('never echoes stored values — message names the key only', () => {
    try {
      assertRendererReadableSetting('sync.token');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('sync.token');
      expect((error as Error).message).not.toMatch(/value/i);
    }
  });
});
