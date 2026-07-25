import { SystemRole, type SystemRole as SystemRoleValue } from './enums';

export const DesktopScopeType = {
  NATIONAL: 'NATIONAL',
  COUNTY: 'COUNTY',
  DISTRICT: 'DISTRICT',
  INSTITUTION: 'INSTITUTION',
  TEACHER: 'TEACHER',
} as const;
export type DesktopScopeType = (typeof DesktopScopeType)[keyof typeof DesktopScopeType];

export const DESKTOP_PORTAL_ROLES = [
  SystemRole.MINISTRY_ADMIN,
  SystemRole.COUNTY_ADMIN,
  SystemRole.DEO,
  SystemRole.INSTITUTION_ADMIN,
  SystemRole.TEACHER,
] as const;
export type DesktopPortalRole = (typeof DESKTOP_PORTAL_ROLES)[number];

export interface DesktopUserScope {
  readonly type: DesktopScopeType;
  readonly scopeId: string;
  readonly countyId?: string;
  readonly districtId?: string;
  readonly institutionId?: string;
  readonly staffId?: string;
}

export interface DesktopPortalDefinition {
  readonly role: DesktopPortalRole;
  readonly route: string;
  readonly scopeType: DesktopScopeType;
}

export const DESKTOP_PORTALS: Readonly<Record<DesktopPortalRole, DesktopPortalDefinition>> = {
  [SystemRole.MINISTRY_ADMIN]: {
    role: SystemRole.MINISTRY_ADMIN,
    route: '/government/ministry-portal',
    scopeType: DesktopScopeType.NATIONAL,
  },
  [SystemRole.COUNTY_ADMIN]: {
    role: SystemRole.COUNTY_ADMIN,
    route: '/government/county',
    scopeType: DesktopScopeType.COUNTY,
  },
  [SystemRole.DEO]: {
    role: SystemRole.DEO,
    route: '/government/deo',
    scopeType: DesktopScopeType.DISTRICT,
  },
  [SystemRole.INSTITUTION_ADMIN]: {
    role: SystemRole.INSTITUTION_ADMIN,
    route: '/government/school-admin',
    scopeType: DesktopScopeType.INSTITUTION,
  },
  [SystemRole.TEACHER]: {
    role: SystemRole.TEACHER,
    route: '/government/teacher',
    scopeType: DesktopScopeType.TEACHER,
  },
};

export function isDesktopPortalRole(role: string): role is DesktopPortalRole {
  return (DESKTOP_PORTAL_ROLES as readonly string[]).includes(role);
}

export function desktopPortalRoute(role: string): string | null {
  return isDesktopPortalRole(role) ? DESKTOP_PORTALS[role].route : null;
}

export function roleCanAccessRoute(role: string, path: string): boolean {
  const route = desktopPortalRoute(role);
  return route !== null && (path === route || path.startsWith(`${route}/`));
}

export function isSystemRole(value: string): value is SystemRoleValue {
  return Object.values(SystemRole).includes(value as SystemRoleValue);
}
