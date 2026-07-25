import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '@nemis-desktop/shared';
import { parseConfig } from './parseConfig';

describe('parseConfig', () => {
  it('defaults to debug logging and localhost renderer URL in dev', () => {
    expect(parseConfig({}, true)).toEqual({
      isDev: true,
      rendererDevUrl: 'http://localhost:3010',
      logLevel: 'debug',
      apiBaseUrl: 'http://localhost:3001/',
    });
  });

  it('defaults to info logging in production', () => {
    expect(parseConfig({ NEMIS_API_URL: 'https://nemis.example' }, false).logLevel).toBe('info');
  });

  it('honors NEMIS_LOG_LEVEL override', () => {
    expect(parseConfig({ NEMIS_LOG_LEVEL: 'warn' }, true).logLevel).toBe('warn');
  });

  it('throws ConfigurationError for an invalid NEMIS_LOG_LEVEL', () => {
    expect(() => parseConfig({ NEMIS_LOG_LEVEL: 'verbose' }, true)).toThrow(ConfigurationError);
  });

  it('honors NEMIS_RENDERER_DEV_URL override', () => {
    expect(
      parseConfig({ NEMIS_RENDERER_DEV_URL: 'http://localhost:4000' }, true).rendererDevUrl,
    ).toBe('http://localhost:4000');
  });
});
