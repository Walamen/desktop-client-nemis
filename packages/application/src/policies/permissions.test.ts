import { describe, expect, it } from 'vitest';
import { APPLICATION_ACTIONS, permission } from './permissions';

describe('permission builder', () => {
  it('builds a PermissionRequest from an action', () => {
    expect(permission(APPLICATION_ACTIONS.STUDENTS_CREATE, { actorId: 'u1' })).toEqual({
      action: 'students:create',
      actorId: 'u1',
    });
  });

  it('omits optional fields when not supplied', () => {
    expect(permission(APPLICATION_ACTIONS.ATTENDANCE_RECORD)).toEqual({
      action: 'attendance:record',
    });
  });
});
