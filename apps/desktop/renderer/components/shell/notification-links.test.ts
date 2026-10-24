import { describe, expect, it } from 'vitest';
import { toPortalRoute } from './notification-links';

describe('toPortalRoute', () => {
  const SA = '/government/school-admin';
  const T = '/government/teacher';
  it('maps the grade-entry server link to the teacher gradebook', () => {
    expect(toPortalRoute(`${T}/grade-entry`, T)).toBe(`${T}/grades`);
  });
  it('maps the classes server link to My Classes', () => {
    expect(toPortalRoute(`${T}/classes`, T)).toBe(`${T}/my-classes`);
  });
  it('maps the assignment submissions server link to the assignment detail page', () => {
    expect(toPortalRoute(`${T}/assignments/a1/submissions`, T)).toBe(`${T}/assignment/detail?id=a1`);
  });
  it('maps the school-admin grades server link to Grade Entry & Results', () => {
    expect(toPortalRoute(`${SA}/grades`, SA)).toBe('/government/school-admin/academic-grading?open=windows');
  });
  it('maps the school-admin staff server link to Teachers & Staff', () => {
    expect(toPortalRoute(`${SA}/staff`, SA)).toBe(`${SA}/teachers-staff`);
  });
  it('returns null for an unknown in-portal path', () => {
    expect(toPortalRoute(`${SA}/students`, SA)).toBeNull();
    expect(toPortalRoute(`${T}/whatever/else`, T)).toBeNull();
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
