import { describe, expect, it } from 'vitest';
import {
  SCHOOL_MODULE_LABELS,
  SCHOOL_MODULE_PRESETS,
  SCHOOL_MODULES,
  canUseSchoolAccess,
  hasModule,
  schoolAccessLabel,
  schoolRouteAccess,
} from './school-modules';

const BASE = '/government/school-admin';
const admin = { role: 'INSTITUTION_ADMIN' };
const staff = (modules?: string[]) => ({ role: 'INSTITUTION_STAFF', modules });

describe('hasModule', () => {
  it('is true for the admin on every module', () => {
    for (const m of SCHOOL_MODULES) expect(hasModule(admin, m)).toBe(true);
  });
  it('follows the staff module list', () => {
    expect(hasModule(staff(['STUDENTS']), 'STUDENTS')).toBe(true);
    expect(hasModule(staff(['STUDENTS']), 'FINANCE_RULES')).toBe(false);
  });
  it('treats missing modules as none', () => {
    expect(hasModule(staff(undefined), 'STUDENTS')).toBe(false);
  });
  it('is false for a teacher', () => {
    expect(hasModule({ role: 'TEACHER' }, 'STUDENTS')).toBe(false);
  });
});

describe('canUseSchoolAccess', () => {
  it('lets staff use BASE but not PRINCIPAL', () => {
    expect(canUseSchoolAccess(staff([]), 'BASE')).toBe(true);
    expect(canUseSchoolAccess(staff([]), 'PRINCIPAL')).toBe(false);
  });
  it('refuses a teacher on BASE', () => {
    expect(canUseSchoolAccess({ role: 'TEACHER' }, 'BASE')).toBe(false);
  });
  it('lets the admin use PRINCIPAL', () => {
    expect(canUseSchoolAccess(admin, 'PRINCIPAL')).toBe(true);
  });
});

describe('schoolRouteAccess', () => {
  it.each([
    [BASE, 'BASE'],
    [`${BASE}/financial/record-payment`, 'FINANCE_PAYMENTS'],
    [`${BASE}/financial`, 'FINANCE_RULES'],
    [`${BASE}/financialx`, 'BASE'],
    [`${BASE}/academic-years/close`, 'PRINCIPAL'],
    [`${BASE}/academic-grading/windows/grades`, 'TEACHING'],
    [`${BASE}/settings`, 'BASE'],
    [`${BASE}/settings/users`, 'PRINCIPAL'],
  ])('%s -> %s', (path, access) => {
    expect(schoolRouteAccess(path)).toBe(access);
  });
});

describe('constants', () => {
  it('has the eight labels', () => {
    expect(SCHOOL_MODULE_LABELS).toEqual({
      ACADEMIC_SETUP: 'Academic setup',
      STUDENTS: 'Students & families',
      STAFF: 'Teachers & staff',
      TEACHING: 'Teaching workflow',
      FINANCE_PAYMENTS: 'Record payments',
      FINANCE_RULES: 'Fee rules & payment plans',
      REPORTS: 'Reports',
      SCHOOL: 'School settings',
    });
  });
  it('has the presets', () => {
    expect(SCHOOL_MODULE_PRESETS).toEqual([
      { id: 'REGISTRAR', label: 'Registrar', title: 'Registrar', modules: ['STUDENTS'] },
      {
        id: 'BUSINESS_MANAGER',
        label: 'Business Manager',
        title: 'Business Manager',
        modules: ['FINANCE_PAYMENTS', 'FINANCE_RULES'],
      },
    ]);
  });
  it('joins labels with " or "', () => {
    expect(schoolAccessLabel(['FINANCE_PAYMENTS', 'FINANCE_RULES'])).toBe(
      'Record payments or Fee rules & payment plans',
    );
    expect(schoolAccessLabel('REPORTS')).toBe('Reports');
  });
});
