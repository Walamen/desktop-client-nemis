import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoFinanceResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoFinanceHandlers } from './finance';

describe('deo finance IPC handlers', () => {
  it('deo:finance and deo:finance-audit return the use case data and take no arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const finance = { districtId: 'd-1', schools: [] } as unknown as DeoFinanceResult;
    const audit = [{ id: 'e-1' }];
    registerDeoFinanceHandlers(handle, {
      deo: { getFinance: async () => ({ data: finance }), listFinanceAudit: async () => ({ data: audit }) },
    } as unknown as ApplicationLayer);
    for (const [channel, result] of [
      ['deo:finance', finance],
      ['deo:finance-audit', audit],
    ] as const) {
      const call = calls.get(channel);
      expect(call).toBeDefined();
      expect(await call!.handler()).toEqual(result);
      expect(() => call!.validate([])).not.toThrow();
      // The district comes from the session, never from the renderer.
      expect(() => call!.validate(['d-2'])).toThrow(IPCError);
    }
  });
});
