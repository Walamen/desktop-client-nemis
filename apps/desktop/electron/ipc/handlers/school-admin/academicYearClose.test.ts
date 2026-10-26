import { describe, expect, it, vi } from 'vitest';
import { IpcChannels, SystemRole, type IpcChannel } from '@nemis-desktop/types';
import { RemoteRejectedError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { authorizeChannel } from '@app/ipc/authorizeChannel';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { registerAcademicYearCloseHandlers } from './academicYearClose';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

const ALL_CLOSE_CHANNELS = [
  IpcChannels.CLOSE_GET_READINESS,
  IpcChannels.CLOSE_FILL_CELLS,
  IpcChannels.CLOSE_GET_PROMOTION,
  IpcChannels.CLOSE_SAVE_PROMOTION,
  IpcChannels.CLOSE_YEAR,
  IpcChannels.REOPEN_YEAR,
  IpcChannels.CORRECT_GRADE,
  IpcChannels.CORRECT_OUTCOME,
  IpcChannels.CORRECT_REMARK,
  IpcChannels.CLOSE_PENDING_CHANGES_COUNT,
];

function setup(countPending = () => 0) {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const gateway = {
    getCloseReadiness: vi.fn(async () => ({
      unpublishedPeriods: [],
      missingCells: [],
      cohort: { present: 1, withdrawn: 0 },
    })),
    fillCloseCells: vi.fn(async () => null),
    getClosePromotion: vi.fn(async () => ({ passMark: 50, students: [] })),
    saveClosePromotion: vi.fn(async () => null),
    closeAcademicYear: vi.fn(async () => null),
    reopenAcademicYear: vi.fn(async () => null),
    correctGrade: vi.fn(async () => null),
    correctOutcome: vi.fn(async () => null),
    correctRemark: vi.fn(async () => null),
  };
  const refresh = vi.fn(async () => true);
  registerAcademicYearCloseHandlers(handle, gateway, refresh, countPending);
  return { calls, gateway, refresh };
}

const entry = { studentId: 's', subjectId: 'x', gradingPeriodId: 'p', score: 70, reason: 'Lost sheet' };
const decision = { studentId: 's', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8' };

describe('academic year close IPC handlers', () => {
  it('reads call the gateway and never refresh', async () => {
    const { calls, gateway, refresh } = setup();
    expect(() => calls.get(IpcChannels.CLOSE_GET_READINESS)!.validate(['y-1'])).not.toThrow();
    expect(() => calls.get(IpcChannels.CLOSE_GET_READINESS)!.validate([])).toThrow();
    await calls.get(IpcChannels.CLOSE_GET_READINESS)!.handler('y-1');
    await calls.get(IpcChannels.CLOSE_GET_PROMOTION)!.handler('y-1');
    expect(gateway.getCloseReadiness).toHaveBeenCalledWith('y-1');
    expect(gateway.getClosePromotion).toHaveBeenCalledWith('y-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('fill-cells validates entries, forwards them and refreshes', async () => {
    const { calls, gateway, refresh } = setup();
    const c = calls.get(IpcChannels.CLOSE_FILL_CELLS)!;
    expect(() => c.validate([{ yearId: 'y', entries: [entry] }])).not.toThrow();
    expect(() => c.validate([{ yearId: 'y', entries: [{ ...entry, reason: '' }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', entries: [{ ...entry, score: 101 }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', entries: [{ ...entry, score: -1 }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', entries: [{ ...entry, extra: 1 }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', entries: 'nope' }])).toThrow();
    expect(await c.handler({ yearId: 'y', entries: [entry] })).toEqual({ data: null, refreshed: true });
    expect(gateway.fillCloseCells).toHaveBeenCalledWith('y', { entries: [entry] });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('save-promotion validates decisions and forwards the body without the year id', async () => {
    const { calls, gateway, refresh } = setup();
    const c = calls.get(IpcChannels.CLOSE_SAVE_PROMOTION)!;
    const body = {
      decisions: [decision, { studentId: 't', outcome: 'RETAINED', nextGradeLevel: null, overrideReason: 'Absent' }],
      principalRemarks: [{ studentId: 's', remark: 'Good' }],
      defaultPrincipalRemark: 'Well done',
    };
    expect(() => c.validate([{ yearId: 'y', ...body }])).not.toThrow();
    expect(() => c.validate([{ yearId: 'y', decisions: [{ ...decision, outcome: 'EXPELLED' }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', decisions: [{ ...decision, nextGradeLevel: 'GRADE_99' }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', decisions: [], principalRemarks: [{ studentId: 's' }] }])).toThrow();
    expect(() => c.validate([{ yearId: 'y' }])).toThrow();
    await c.handler({ yearId: 'y', ...body });
    expect(gateway.saveClosePromotion).toHaveBeenCalledWith('y', body);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('close-year takes a year id and refreshes', async () => {
    const { calls, gateway, refresh } = setup();
    const c = calls.get(IpcChannels.CLOSE_YEAR)!;
    expect(() => c.validate([])).toThrow();
    expect(await c.handler('y-1')).toEqual({ data: null, refreshed: true });
    expect(gateway.closeAcademicYear).toHaveBeenCalledWith('y-1');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a refused close does not refresh and the error propagates', async () => {
    const { calls, gateway, refresh } = setup();
    gateway.closeAcademicYear.mockRejectedValueOnce(new RemoteRejectedError(409, 'Not ready'));
    await expect(calls.get(IpcChannels.CLOSE_YEAR)!.handler('y-1')).rejects.toBeInstanceOf(RemoteRejectedError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reopen requires a reason', async () => {
    const { calls, gateway, refresh } = setup();
    const c = calls.get(IpcChannels.REOPEN_YEAR)!;
    expect(() => c.validate([{ yearId: 'y', reason: '' }])).toThrow();
    expect(() => c.validate([{ yearId: 'y' }])).toThrow();
    expect(() => c.validate([{ yearId: 'y', reason: 'Wrong mark' }])).not.toThrow();
    await c.handler({ yearId: 'y', reason: 'Wrong mark' });
    expect(gateway.reopenAcademicYear).toHaveBeenCalledWith('y', { reason: 'Wrong mark' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('corrections validate, forward and refresh', async () => {
    const { calls, gateway, refresh } = setup();
    const grade = { studentId: 's', subjectId: 'x', gradingPeriodId: 'p', score: 61, reason: 'Typo' };
    const g = calls.get(IpcChannels.CORRECT_GRADE)!;
    expect(() => g.validate([{ yearId: 'y', ...grade }])).not.toThrow();
    expect(() => g.validate([{ yearId: 'y', ...grade, reason: '' }])).toThrow();
    expect(() => g.validate([{ yearId: 'y', ...grade, score: 120 }])).toThrow();
    await g.handler({ yearId: 'y', ...grade });
    expect(gateway.correctGrade).toHaveBeenCalledWith('y', grade);

    const outcome = { studentId: 's', outcome: 'RETAINED', nextGradeLevel: null, reason: 'Appeal' };
    const o = calls.get(IpcChannels.CORRECT_OUTCOME)!;
    expect(() => o.validate([{ yearId: 'y', ...outcome }])).not.toThrow();
    expect(() => o.validate([{ yearId: 'y', ...outcome, outcome: 'X' }])).toThrow();
    expect(() => o.validate([{ yearId: 'y', ...outcome, reason: '' }])).toThrow();
    await o.handler({ yearId: 'y', ...outcome });
    expect(gateway.correctOutcome).toHaveBeenCalledWith('y', outcome);

    const remark = { studentId: 's', remark: 'Improved', reason: 'Typo' };
    const r = calls.get(IpcChannels.CORRECT_REMARK)!;
    expect(() => r.validate([{ yearId: 'y', ...remark }])).not.toThrow();
    expect(() => r.validate([{ yearId: 'y', ...remark, remark: '' }])).toThrow();
    await r.handler({ yearId: 'y', ...remark });
    expect(gateway.correctRemark).toHaveBeenCalledWith('y', remark);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('pending-changes count comes from the pending-changes source and takes no arguments', async () => {
    const { calls, refresh } = setup(() => 7);
    const c = calls.get(IpcChannels.CLOSE_PENDING_CHANGES_COUNT)!;
    expect(() => c.validate([])).not.toThrow();
    expect(() => c.validate(['x'])).toThrow();
    expect(await c.handler()).toBe(7);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('registers every close channel', () => {
    const { calls } = setup();
    for (const channel of ALL_CLOSE_CHANNELS) expect(calls.has(channel)).toBe(true);
  });

  it('every close channel is school-admin only; a teacher is denied', () => {
    const ws = (role: string) =>
      ({ get active() { return { user: { role } }; } }) as unknown as WorkspaceManager;
    for (const channel of ALL_CLOSE_CHANNELS) {
      expect(() => authorizeChannel(channel, ws(SystemRole.INSTITUTION_ADMIN))).not.toThrow();
      for (const role of [SystemRole.TEACHER, SystemRole.COUNTY_ADMIN, SystemRole.DEO, SystemRole.MINISTRY_ADMIN]) {
        expect(() => authorizeChannel(channel, ws(role))).toThrow(/school administrator/);
      }
    }
  });
});
