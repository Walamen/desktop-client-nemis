import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoTransfersResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoTransferHandlers } from './transfers';

describe('deo transfers IPC handlers', () => {
  it('deo:list-transfers returns the use case data and rejects arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const result: DeoTransfersResult = {
      districtId: 'd-1',
      district: null,
      county: null,
      transfers: [],
      summary: { pending: 0, lapsed: 0 },
    };
    registerDeoTransferHandlers(handle, { deo: { listTransfers: async () => ({ data: result }) } } as unknown as ApplicationLayer);
    const call = calls.get('deo:list-transfers');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(result);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['d-2'])).toThrow(IPCError);
  });
});
