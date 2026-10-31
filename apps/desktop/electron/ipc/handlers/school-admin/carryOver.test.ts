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
  registerCarryOverHandlers(handle, gateway as never, refresh);
  return { calls, gateway, refresh };
}

const save = {
  carryOverId: 'co-1',
  periods: [{ sourceGradingPeriodId: 'a-p1', targetGradingPeriodId: 'b-p1' }],
  subjects: [{ sourceSubjectId: 'a-m', targetSubjectId: null }],
};

describe('carry-over IPC handlers', () => {
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
