import { describe, expect, it } from 'vitest';
import { toDesktopRoute } from './links';

describe('toDesktopRoute', () => {
  it('maps web detail links to the desktop ?id= routes', () => {
    expect(toDesktopRoute('/government/county/schools/abc-123')).toBe('/government/county/schools/details?id=abc-123');
    expect(toDesktopRoute('/government/county/districts/d 1')).toBe('/government/county/districts/details?id=d%201');
    expect(toDesktopRoute('/government/county/students/s-9?tab=record')).toBe('/government/county/students/details?id=s-9');
  });

  it('keeps other county pages as they are', () => {
    expect(toDesktopRoute('/government/county/schools')).toBe('/government/county/schools');
    expect(toDesktopRoute('/government/county/schools/create')).toBe('/government/county/schools/create');
    expect(toDesktopRoute('/government/county/messages?conv=c-1')).toBe('/government/county/messages?conv=c-1');
  });

  it('hides links outside the County portal or off the app', () => {
    expect(toDesktopRoute('https://evil.example/x')).toBeNull();
    expect(toDesktopRoute('/government/school-admin/students')).toBeNull();
    expect(toDesktopRoute('//evil.example')).toBeNull();
    expect(toDesktopRoute(null)).toBeNull();
    expect(toDesktopRoute('')).toBeNull();
  });
});
