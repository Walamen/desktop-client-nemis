import { describe, expect, it } from 'vitest';
import { toPortalRoute } from './notification-links';

describe('toPortalRoute', () => {
  it('keeps a link inside the portal', () => {
    expect(toPortalRoute('/government/school-admin/students', '/government/school-admin')).toBe('/government/school-admin/students');
  });
  it('keeps the base path itself', () => {
    expect(toPortalRoute('/government/teacher', '/government/teacher')).toBe('/government/teacher');
  });
  it('maps County detail links to the desktop route', () => {
    expect(toPortalRoute('/government/county/schools/abc', '/government/county')).toBe('/government/county/schools/details?id=abc');
  });
  it('rejects another portal', () => {
    expect(toPortalRoute('/government/county/schools', '/government/school-admin')).toBeNull();
  });
  it('rejects a protocol-relative link', () => {
    expect(toPortalRoute('//evil.example/x', '/government/teacher')).toBeNull();
  });
  it('rejects null and empty', () => {
    expect(toPortalRoute(null, '/government/teacher')).toBeNull();
    expect(toPortalRoute('', '/government/teacher')).toBeNull();
  });
  it('rejects a path that only shares a prefix', () => {
    expect(toPortalRoute('/government/school-adminx', '/government/school-admin')).toBeNull();
  });
});
