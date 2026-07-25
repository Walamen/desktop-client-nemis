import { describe, expect, it } from 'vitest';
import { IpcChannels, SystemRole } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { authorizeChannel } from './authorizeChannel';

function workspace(role?: string): WorkspaceManager {
  return {
    get active() {
      if (!role) throw new Error('locked');
      return { user: { role } };
    },
  } as unknown as WorkspaceManager;
}

describe('authorizeChannel', () => {
  it('allows authentication while no workspace is open', () => {
    expect(() => authorizeChannel(IpcChannels.AUTH_LOGIN, workspace())).not.toThrow();
  });

  it('requires an unlocked workspace for protected reads', () => {
    expect(() => authorizeChannel(IpcChannels.STUDENT_LIST, workspace())).toThrow(/Sign in/);
  });

  it('blocks teacher and regional roles from school-management mutations', () => {
    for (const role of [
      SystemRole.TEACHER,
      SystemRole.COUNTY_ADMIN,
      SystemRole.DEO,
      SystemRole.MINISTRY_ADMIN,
    ]) {
      expect(() => authorizeChannel(IpcChannels.STUDENT_CREATE, workspace(role))).toThrow(
        /school administrator/,
      );
    }
  });

  it('allows teacher attendance but blocks unrelated roles', () => {
    expect(() =>
      authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(SystemRole.TEACHER)),
    ).not.toThrow();
    expect(() =>
      authorizeChannel(IpcChannels.ATTENDANCE_RECORD, workspace(SystemRole.DEO)),
    ).toThrow(/Attendance/);
  });
});
