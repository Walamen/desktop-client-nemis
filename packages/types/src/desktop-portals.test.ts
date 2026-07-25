import { describe, expect, it } from 'vitest';
import { SystemRole } from './enums';
import {
  DESKTOP_PORTALS,
  desktopPortalRoute,
  roleCanAccessRoute,
} from './desktop-portals';

describe('desktop portal registry', () => {
  it.each([
    [SystemRole.MINISTRY_ADMIN, '/government/ministry-portal'],
    [SystemRole.COUNTY_ADMIN, '/government/county'],
    [SystemRole.DEO, '/government/deo'],
    [SystemRole.INSTITUTION_ADMIN, '/government/school-admin'],
    [SystemRole.TEACHER, '/government/teacher'],
  ])('maps %s to its portal', (role, route) => {
    expect(desktopPortalRoute(role)).toBe(route);
    expect(DESKTOP_PORTALS[role].route).toBe(route);
    expect(roleCanAccessRoute(role, `${route}/reports`)).toBe(true);
  });

  it('rejects unsupported and cross-portal routes', () => {
    expect(desktopPortalRoute(SystemRole.PARENT)).toBeNull();
    expect(roleCanAccessRoute(SystemRole.TEACHER, '/government/school-admin')).toBe(false);
    expect(roleCanAccessRoute(SystemRole.DEO, '/government/county')).toBe(false);
  });
});
