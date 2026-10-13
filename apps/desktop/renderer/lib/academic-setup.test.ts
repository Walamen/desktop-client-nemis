import { describe, expect, it } from 'vitest';
import { academicSetupHref, parseSetupDrawerTarget } from './academic-setup';

describe('academicSetupHref', () => {
  it.each([
    ['years', '/government/school-admin/academic-grading?open=years'],
    ['terms', '/government/school-admin/academic-grading?open=terms'],
    ['periods', '/government/school-admin/academic-grading?open=periods'],
    ['windows', '/government/school-admin/academic-grading?open=windows'],
  ] as const)('links %s to its drawer on the Academic Grading page', (drawer, href) => {
    expect(academicSetupHref(drawer)).toBe(href);
  });

  it('carries the year to open Terms on', () => {
    expect(academicSetupHref('terms', { yearId: 'y1' })).toBe('/government/school-admin/academic-grading?open=terms&yearId=y1');
  });

  it('encodes the year id', () => {
    expect(academicSetupHref('terms', { yearId: 'a&b' })).toBe('/government/school-admin/academic-grading?open=terms&yearId=a%26b');
  });

  it('omits an empty year id', () => {
    expect(academicSetupHref('terms', { yearId: '' })).toBe('/government/school-admin/academic-grading?open=terms');
  });
});

describe('parseSetupDrawerTarget', () => {
  it.each(['years', 'terms', 'periods', 'windows'])('accepts %s', (value) => {
    expect(parseSetupDrawerTarget(value)).toBe(value);
  });

  it.each(['', 'setup', 'TERMS', 'terms '])('rejects %j', (value) => {
    expect(parseSetupDrawerTarget(value)).toBeNull();
  });
});
