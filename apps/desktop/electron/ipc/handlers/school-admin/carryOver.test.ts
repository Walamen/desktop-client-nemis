import { describe, expect, it, vi } from 'vitest';
import { IpcChannels, type IpcChannel } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCarryOverHandlers } from './carryOver';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const gateway = {
    listPendingCarryOvers: vi.fn(async () => []),
    getCarryOver: vi.fn(async () => ({ id: 'co-1' })),
    saveCarryOver: vi.fn(async () => null),
  };
  const refresh = vi.fn(async () => true);
  const local = [{ id: 'co-1', studentId: 's1', studentName: 'Ama Kofi', fromInstitutionName: 'Alpha', createdAt: 'x' }];
  const readLocalPending = vi.fn(() => local);
  const carried = [{ studentId: 's1', percentage: 72, sourceSchoolName: 'Alpha' }];
  const carriedFor = vi.fn(() => carried);
  registerCarryOverHandlers(handle, gateway as never, refresh, { listPending: readLocalPending, carriedFor });
  return { calls, gateway, refresh, readLocalPending, local, carriedFor, carried };
}

const save = {
  carryOverId: 'co-1',
  periods: [{ sourceGradingPeriodId: 'a-p1', targetGradingPeriodId: 'b-p1' }],
  subjects: [{ sourceSubjectId: 'a-m', targetSubjectId: null }],
};

describe('carry-over IPC handlers', () => {
  it('lists the local pending tasks offline, with no arguments', async () => {
    const { calls, gateway, readLocalPending, local } = setup();
    expect(() => calls.get(IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING)!.validate([])).not.toThrow();
    expect(() => calls.get(IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING)!.validate(['x'])).toThrow();
    expect(await calls.get(IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING)!.handler()).toBe(local);
    expect(readLocalPending).toHaveBeenCalled();
    expect(gateway.listPendingCarryOvers).not.toHaveBeenCalled();
  });

  it('reads the carried marks of one period and subject from local data', async () => {
    const { calls, carriedFor, carried } = setup();
    const ch = calls.get(IpcChannels.CARRIED_GRADES_FOR_PERIOD)!;
    expect(() => ch.validate([{ gradingPeriodId: 'p1', subjectId: 'm' }])).not.toThrow();
    expect(() => ch.validate([{ gradingPeriodId: 'p1' }])).toThrow();
    expect(() => ch.validate([{ gradingPeriodId: 'p1', subjectId: 'm', x: 1 }])).toThrow();
    expect(await ch.handler({ gradingPeriodId: 'p1', subjectId: 'm' })).toBe(carried);
    expect(carriedFor).toHaveBeenCalledWith('p1', 'm');
  });

  it('reads go to the server and never refresh', async () => {
    const { calls, gateway, refresh } = setup();
    await calls.get(IpcChannels.CARRY_OVER_LIST_PENDING)!.handler();
    await calls.get(IpcChannels.CARRY_OVER_GET)!.handler('co-1');
    expect(gateway.listPendingCarryOvers).toHaveBeenCalled();
    expect(gateway.getCarryOver).toHaveBeenCalledWith('co-1');
    expect(refresh).not.toHaveBeenCalled();
    expect(() => calls.get(IpcChannels.CARRY_OVER_GET)!.validate([])).toThrow();
  });

  it('a save is sent without the id in the body and refreshes local data', async () => {
    const { calls, gateway, refresh } = setup();
    expect(() => calls.get(IpcChannels.CARRY_OVER_SAVE)!.validate([save])).not.toThrow();
    const result = await calls.get(IpcChannels.CARRY_OVER_SAVE)!.handler(save);
    expect(gateway.saveCarryOver).toHaveBeenCalledWith('co-1', { periods: save.periods, subjects: save.subjects });
    expect(refresh).toHaveBeenCalled();
    expect(result).toEqual({ data: null, refreshed: true });
  });

  it('refuses a malformed save', () => {
    const { calls } = setup();
    const validate = calls.get(IpcChannels.CARRY_OVER_SAVE)!.validate;
    expect(() => validate([{ ...save, periods: [{ sourceGradingPeriodId: '', targetGradingPeriodId: null }] }])).toThrow();
    expect(() => validate([{ ...save, extra: 1 }])).toThrow();
    expect(() => validate([{ ...save, subjects: 'x' }])).toThrow();
  });
});
