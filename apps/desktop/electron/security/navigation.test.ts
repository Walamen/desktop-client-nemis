import { describe, expect, it } from 'vitest';
import { isAllowedNavigation } from './navigation';

const DEV_ORIGINS = ['http://localhost:3010'] as const;
const PROD_ORIGINS = ['app://renderer/'] as const;

describe('isAllowedNavigation', () => {
  it('allows same-origin dev URLs', () => {
    expect(isAllowedNavigation('http://localhost:3010/some/route', DEV_ORIGINS)).toBe(true);
  });

  it('blocks foreign origins', () => {
    expect(isAllowedNavigation('https://example.com/', DEV_ORIGINS)).toBe(false);
  });

  it('blocks userinfo-bypass URLs (host parsed as userinfo)', () => {
    expect(isAllowedNavigation('http://localhost:3010@evil.com/', DEV_ORIGINS)).toBe(false);
  });

  it('blocks port-prefix collisions', () => {
    expect(isAllowedNavigation('http://localhost:30103/', DEV_ORIGINS)).toBe(false);
  });

  it('allows the app:// renderer origin in production', () => {
    expect(isAllowedNavigation('app://renderer/dashboard/', PROD_ORIGINS)).toBe(true);
  });

  it('blocks other custom schemes and other app:// hosts', () => {
    expect(isAllowedNavigation('evil://renderer/x', PROD_ORIGINS)).toBe(false);
    expect(isAllowedNavigation('app://other/x', PROD_ORIGINS)).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedNavigation('not a url', DEV_ORIGINS)).toBe(false);
  });
});
