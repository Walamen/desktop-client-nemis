import type { ProvisioningUser } from '@nemis-desktop/types';

/**
 * Pure comparisons of provisioning users. Kept free of native-module imports
 * (WorkspaceManager loads better-sqlite3), so the identity tuple below is
 * duplicated from `workspaceIdentity()` on purpose.
 */

const USER_KEYS = [
  'id',
  'email',
  'firstName',
  'lastName',
  'role',
  'institutionId',
  'countyId',
  'districtId',
  'staffId',
  'institutionName',
  'title',
] as const;

const SCOPE_KEYS = [
  'type',
  'scopeId',
  'countyId',
  'districtId',
  'institutionId',
  'staffId',
] as const;

/** True when the two users resolve to the same workspace (id, role, scope type and id). */
export function sameWorkspaceIdentity(a: ProvisioningUser, b: ProvisioningUser): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.scope.type === b.scope.type &&
    a.scope.scopeId === b.scope.scopeId
  );
}

function sortedModules(user: ProvisioningUser): string[] {
  return [...new Set(user.modules ?? [])].sort();
}

/** True when every field matches; `modules` compares as a set, absent equals empty. */
export function sameProvisioningUser(a: ProvisioningUser, b: ProvisioningUser): boolean {
  if (USER_KEYS.some((key) => a[key] !== b[key])) return false;
  if (SCOPE_KEYS.some((key) => a.scope[key] !== b.scope[key])) return false;
  const left = sortedModules(a);
  const right = sortedModules(b);
  return left.length === right.length && left.every((m, i) => m === right[i]);
}
