import { describe, expect, it } from 'vitest';
import { User, UserOrganization } from '@nemis-desktop/domain';
import { SystemRole } from '@nemis-desktop/types';
import { toUserOutput } from './user-mapper';

describe('toUserOutput', () => {
  it('maps a missing email to null', () => {
    const user = User.reconstitute({
      id: 'user-2', firstName: 'Musu', lastName: 'Kollie', email: null, isActive: true,
      organizations: [
        UserOrganization.reconstitute({ id: 'org-1', role: SystemRole.STUDENT, institutionId: 'school-1', isActive: true }),
      ],
      version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(toUserOutput(user)).toEqual({
      id: 'user-2', fullName: 'Musu Kollie', email: null, isActive: true, roles: [SystemRole.STUDENT],
    });
  });

  it('maps a present email to its normalized value', () => {
    const user = User.reconstitute({
      id: 'user-1', firstName: 'Ama', lastName: 'Kollie', email: 'Ama@MOE.gov.lr', isActive: true,
      organizations: [], version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(toUserOutput(user).email).toBe('ama@moe.gov.lr');
  });
});
