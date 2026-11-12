import { describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { sameProvisioningUser, sameWorkspaceIdentity } from './sameProvisioningUser';

const base: ProvisioningUser = {
  id: 'u-1', email: 'r@school.lr', firstName: 'Reg', lastName: 'Istrar',
  role: SystemRole.INSTITUTION_STAFF,
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'inst-1', institutionId: 'inst-1' },
  institutionId: 'inst-1', modules: ['STUDENTS', 'REPORTS'], title: 'Registrar',
};

describe('sameWorkspaceIdentity', () => {
  it('matches on id, role, scope type and scope id only', () => {
    expect(sameWorkspaceIdentity(base, { ...base, modules: [], title: undefined, firstName: 'X' })).toBe(true);
    expect(sameWorkspaceIdentity(base, { ...base, id: 'u-2' })).toBe(false);
    expect(sameWorkspaceIdentity(base, { ...base, role: SystemRole.INSTITUTION_ADMIN })).toBe(false);
    expect(sameWorkspaceIdentity(base, { ...base, scope: { ...base.scope, scopeId: 'inst-2' } })).toBe(false);
  });
});

describe('sameProvisioningUser', () => {
  it('is true for an identical user', () => {
    expect(sameProvisioningUser(base, { ...base })).toBe(true);
  });
  it('treats modules as a set', () => {
    expect(sameProvisioningUser(base, { ...base, modules: ['REPORTS', 'STUDENTS'] })).toBe(true);
    expect(sameProvisioningUser(base, { ...base, modules: ['STUDENTS'] })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, modules: ['STUDENTS', 'REPORTS', 'FINANCE_RULES'] })).toBe(false);
  });
  it('treats a missing modules field as an empty set', () => {
    const withoutModules: ProvisioningUser = { ...base };
    delete (withoutModules as { modules?: unknown }).modules;
    expect(sameProvisioningUser(withoutModules, { ...withoutModules, modules: [] })).toBe(true);
  });
  it('treats an absent title and an undefined title alike', () => {
    const withoutTitle: ProvisioningUser = { ...base };
    delete (withoutTitle as { title?: unknown }).title;
    expect(sameProvisioningUser(withoutTitle, { ...withoutTitle, title: undefined })).toBe(true);
    expect(sameProvisioningUser(base, { ...base, title: 'Bursar' })).toBe(false);
  });
  it('sees a changed name, institution name or scope field', () => {
    expect(sameProvisioningUser(base, { ...base, lastName: 'Other' })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, institutionName: 'Alpha' })).toBe(false);
    expect(sameProvisioningUser(base, { ...base, scope: { ...base.scope, districtId: 'd-1' } })).toBe(false);
  });
});
