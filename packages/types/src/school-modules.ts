/**
 * Modules a principal can grant to a school office user (INSTITUTION_STAFF).
 */
export const SchoolModule = {
  ACADEMIC_SETUP: 'ACADEMIC_SETUP',
  STUDENTS: 'STUDENTS',
  STAFF: 'STAFF',
  TEACHING: 'TEACHING',
  FINANCE_PAYMENTS: 'FINANCE_PAYMENTS',
  FINANCE_RULES: 'FINANCE_RULES',
  REPORTS: 'REPORTS',
  SCHOOL: 'SCHOOL',
} as const;

export type SchoolModule = (typeof SchoolModule)[keyof typeof SchoolModule];

export const SCHOOL_MODULES: readonly SchoolModule[] = Object.values(SchoolModule);

export const SCHOOL_MODULE_LABELS: Record<SchoolModule, string> = {
  ACADEMIC_SETUP: 'Academic setup',
  STUDENTS: 'Students & families',
  STAFF: 'Teachers & staff',
  TEACHING: 'Teaching workflow',
  FINANCE_PAYMENTS: 'Record payments',
  FINANCE_RULES: 'Fee rules & payment plans',
  REPORTS: 'Reports',
  SCHOOL: 'School settings',
};

export function isSchoolModule(value: string): value is SchoolModule {
  return (SCHOOL_MODULES as readonly string[]).includes(value);
}

export type SchoolAccess = SchoolModule | 'BASE' | 'PRINCIPAL';

export const SCHOOL_MODULE_PRESETS: readonly {
  id: 'REGISTRAR' | 'BUSINESS_MANAGER';
  label: string;
  title: string;
  modules: readonly SchoolModule[];
}[] = [
  {
    id: 'REGISTRAR',
    label: 'Registrar',
    title: 'Registrar',
    modules: [SchoolModule.STUDENTS],
  },
  {
    id: 'BUSINESS_MANAGER',
    label: 'Business Manager',
    title: 'Business Manager',
    modules: [SchoolModule.FINANCE_PAYMENTS, SchoolModule.FINANCE_RULES],
  },
];

export function isInstitutionScopedRole(role: string): boolean {
  return role === 'INSTITUTION_ADMIN' || role === 'INSTITUTION_STAFF';
}

export function hasModule(
  user: { role: string; modules?: readonly string[] },
  module: SchoolModule,
): boolean {
  if (user.role === 'INSTITUTION_ADMIN') return true;
  if (user.role === 'INSTITUTION_STAFF') return (user.modules ?? []).includes(module);
  return false;
}

export function canUseSchoolAccess(
  user: { role: string; modules?: readonly string[] },
  access: SchoolAccess,
): boolean {
  if (access === 'BASE') return isInstitutionScopedRole(user.role);
  if (access === 'PRINCIPAL') return user.role === 'INSTITUTION_ADMIN';
  return hasModule(user, access);
}

/** Keys are paths relative to `/government/school-admin`. Unlisted paths are 'BASE'. */
export const SCHOOL_ROUTE_ACCESS: Readonly<Record<string, SchoolAccess>> = {
  '/academic-grading': SchoolModule.ACADEMIC_SETUP,
  '/academic-grading/windows/grades': SchoolModule.TEACHING,
  '/subjects': SchoolModule.ACADEMIC_SETUP,
  '/academic-years': 'PRINCIPAL',
  '/students': SchoolModule.STUDENTS,
  '/parents-guardians': SchoolModule.STUDENTS,
  '/teachers-staff': SchoolModule.STAFF,
  '/classes': SchoolModule.TEACHING,
  '/timetable': SchoolModule.TEACHING,
  '/attendance': SchoolModule.TEACHING,
  '/financial': SchoolModule.FINANCE_RULES,
  '/financial/record-payment': SchoolModule.FINANCE_PAYMENTS,
  '/reports': SchoolModule.REPORTS,
  '/past-years': SchoolModule.REPORTS,
  '/school-profile': SchoolModule.SCHOOL,
  '/grade-levels': SchoolModule.SCHOOL,
  '/infrastructure': SchoolModule.SCHOOL,
  '/settings/users': 'PRINCIPAL',
};

const SCHOOL_BASE_PATH = '/government/school-admin';

export function schoolRouteAccess(pathname: string): SchoolAccess {
  const relative = pathname.startsWith(SCHOOL_BASE_PATH)
    ? pathname.slice(SCHOOL_BASE_PATH.length)
    : pathname;
  let best: string | null = null;
  for (const key of Object.keys(SCHOOL_ROUTE_ACCESS)) {
    if (relative === key || relative.startsWith(`${key}/`)) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  return best === null ? 'BASE' : (SCHOOL_ROUTE_ACCESS[best] ?? 'BASE');
}

/** Labels joined with " or ", used in refusal copy. */
export function schoolAccessLabel(access: SchoolModule[] | SchoolModule): string {
  const list = Array.isArray(access) ? access : [access];
  return list.map((m) => SCHOOL_MODULE_LABELS[m]).join(' or ');
}
